import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { DisconnectReason, Room, RoomEvent, Track, VideoPresets } from 'livekit-client';
import { AudioMixer } from '../utils/audioMixer.js';
import { captureOptions, loadAudioPrefs, AUDIO_PUBLISH } from '../utils/audioConfig.js';

/**
 * Everything the browser needs to be in a LifeOS video room (LiveKit).
 *
 * The server decides WHO may enter and who the host is (see /meetings/:id/room). This hook only connects with
 * the short-lived token it was given, publishes your mic/camera, and turns LiveKit events into plain data
 * for the UI. It also keeps LifeOS' attendance record fresh (heartbeat + leave).
 *
 * Bandwidth: adaptive streaming + simulcast mean each person is only sent the video quality their tile
 * actually needs, and camera capture is 360p by default — friendly to mobile data.
 */

const CONTROL_TOPIC = 'lifeos.control';
// Anyone who starts/pauses/stops a recording pings this so the others refresh at once. It carries no data and is never trusted.
const REC_TOPIC = 'lifeos.rec';
// Same idea for chat: "a new message exists, fetch it". The text itself always comes from the server.
const CHAT_TOPIC = 'lifeos.chat';
const HEARTBEAT_MS = 20_000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

const parseMeta = (p) => {
  try {
    return JSON.parse(p?.metadata || '{}') || {};
  } catch {
    return {};
  }
};

/**
 * Browsers only expose the camera and microphone (navigator.mediaDevices) on a SECURE origin: https://… or
 * http://localhost. Opening LifeOS from a phone as http://192.168.x.x:5173 is NOT secure, so mediaDevices is
 * undefined there: joining and listening still work, but the phone can never publish its camera or microphone.
 */
export function mediaSupport() {
  if (typeof window === 'undefined') return { ok: true };
  const hasApi = Boolean(navigator.mediaDevices?.getUserMedia);
  if (window.isSecureContext && hasApi) return { ok: true };
  if (!window.isSecureContext) {
    return {
      ok: false,
      insecure: true,
      message: 'Camera and microphone are blocked because this page is not using HTTPS. Open the secure (https://) address of LifeOS to turn them on.',
    };
  }
  return { ok: false, message: 'This browser cannot access the camera or microphone. Try the latest Chrome, Safari, Edge or Firefox.' };
}

export function mediaErrorMessage(err, what = 'microphone or camera') {
  const support = mediaSupport();
  if (!support.ok) return support.message;
  const n = err?.name || err?.error?.name;
  if (n === 'NotAllowedError' || n === 'SecurityError' || n === 'PermissionDeniedError') return `Allow access to your ${what} in the browser to use it.`;
  if (n === 'NotFoundError' || n === 'DevicesNotFoundError') return `No ${what} was found.`;
  if (n === 'NotReadableError' || n === 'TrackStartError') return `Your ${what} is being used by another app.`;
  if (n === 'OverconstrainedError') return `Your ${what} doesn't support the requested settings.`;
  return `Could not start your ${what}.`;
}

/** Console diagnostics for development (never includes tokens). */
const dbg = (...args) => console.info('[room]', ...args);

export function disconnectMessage(reason) {
  if (reason === DisconnectReason.DUPLICATE_IDENTITY) return 'You joined this meeting from another device or tab, so this one was disconnected.';
  if (reason === DisconnectReason.PARTICIPANT_REMOVED) return 'You were removed from the meeting.';
  if (reason === DisconnectReason.ROOM_DELETED) return 'The meeting room was closed.';
  return null;
}

/** Turns every remote video (cameras and screen shares) off or on. Audio is never touched. */
function applySaver(room, on) {
  room.remoteParticipants.forEach((p) =>
    p.getTrackPublications().forEach((pub) => {
      if (pub.kind === Track.Kind.Video) pub.setSubscribed(!on);
    })
  );
}

export function useMeetingRoom({ ping, leave, noun = 'meeting' } = {}) {
  const roomRef = useRef(null);
  const [room, setRoom] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | connected | reconnecting | disconnected | error
  const [error, setError] = useState(null); // { code?, message }
  const [mediaError, setMediaError] = useState(null);
  const [canPlayAudio, setCanPlayAudio] = useState(true);
  // Recording as the server sees it: { recording, recorder: {name, mine, stale, paused}|null, canRecord, recordingStorage, hasAudio }
  const [recState, setRecState] = useState({ recording: false, recorder: null, canRecord: false, recordingStorage: false, hasAudio: false });
  const beatRef = useRef(null);
  const [chatTick, bumpChat] = useReducer((n) => n + 1, 0);
  const applySnapshot = useCallback((d) => {
    if (!d) return;
    setRecState({
      recording: Boolean(d.recording),
      recorder: d.recorder || null,
      canRecord: Boolean(d.canRecord),
      recordingStorage: Boolean(d.recordingStorage),
      hasAudio: Boolean(d.hasAudio),
    });
  }, []);
  const [ended, setEnded] = useState(false);
  // Data saver = audio only: you do not receive anyone's video and your own camera stays off. Saves mobile data and battery.
  const [dataSaver, setDataSaverState] = useState(false);
  const saverRef = useRef(false);
  const [notice, setNotice] = useState(null);
  const [tick, bump] = useReducer((n) => n + 1, 0);
  const pingRef = useRef(ping);
  const leaveRef = useRef(leave);
  pingRef.current = ping;
  leaveRef.current = leave;
  const leftRef = useRef(false);

  const reportLeave = useCallback(() => {
    if (leftRef.current) return;
    leftRef.current = true;
    Promise.resolve(leaveRef.current?.()).catch(() => {});
  }, []);

  const disconnect = useCallback(() => {
    reportLeave();
    roomRef.current?.disconnect();
  }, [reportLeave]);

  /**
   * getJoin = async function returning the server's room payload ({ url, token, recording, ... }).
   * Call connect() directly from the click handler: it starts audio playback synchronously (browsers only
   * allow that inside a user gesture) and only then asks the server for the token.
   * Resolves to the payload on success, or null (see `error`) when joining failed.
   */
  const connect = useCallback(
    async (getJoin, { mic = true, cam = false, dataSaver: saver = false } = {}) => {
      if (roomRef.current) return null;
      leftRef.current = false;
      saverRef.current = Boolean(saver);
      setDataSaverState(Boolean(saver));
      setStatus('connecting');
      setError(null);
      setMediaError(null);
      setEnded(false);
      setNotice(null);

      const r = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: captureOptions(loadAudioPrefs()),
        videoCaptureDefaults: { resolution: VideoPresets.h360 },
        publishDefaults: {
          ...AUDIO_PUBLISH, simulcast: true, videoSimulcastLayers: [VideoPresets.h180, VideoPresets.h360] },
      });
      roomRef.current = r;
      setRoom(r);

      const refresh = () => bump();
      [
        RoomEvent.ParticipantConnected,
        RoomEvent.ParticipantDisconnected,
        RoomEvent.TrackSubscribed,
        RoomEvent.TrackUnsubscribed,
        RoomEvent.TrackMuted,
        RoomEvent.TrackUnmuted,
        RoomEvent.LocalTrackPublished,
        RoomEvent.LocalTrackUnpublished,
        RoomEvent.ActiveSpeakersChanged,
        RoomEvent.ParticipantMetadataChanged,
        RoomEvent.ParticipantNameChanged,
      ].forEach((ev) => r.on(ev, refresh));

      r.on(RoomEvent.ConnectionStateChanged, (s) => dbg('connection state:', s));
      r.on(RoomEvent.TrackPublished, (pub) => {
        if (saverRef.current && pub.kind === Track.Kind.Video) pub.setSubscribed(false);
      });
      r.on(RoomEvent.LocalTrackPublished, (pub) => dbg('published local track:', pub.source));
      r.on(RoomEvent.TrackSubscribed, (_t, pub, p) => dbg('subscribed to', pub.source, 'from', p.identity));
      r.on(RoomEvent.Reconnecting, () => setStatus('reconnecting'));
      r.on(RoomEvent.Reconnected, () => {
        if (saverRef.current) applySaver(r, true);
        setStatus('connected');
        bump();
      });
      r.on(RoomEvent.AudioPlaybackStatusChanged, () => setCanPlayAudio(r.canPlaybackAudio));
      r.on(RoomEvent.MediaDevicesError, (e) => {
        console.error('[room] media devices error:', e?.name || e, e?.message || '');
        setMediaError(mediaErrorMessage(e));
      });
      r.on(RoomEvent.Disconnected, (reason) => {
        roomRef.current = null;
        setRoom(null);
        setStatus('disconnected');
        setNotice((prev) => disconnectMessage(reason) || prev);
        reportLeave();
        bump();
      });
      r.on(RoomEvent.DataReceived, (payload, participant, _kind, topic) => {
        if (topic === CHAT_TOPIC) { bumpChat(); return; }
        if (topic === REC_TOPIC) { beatRef.current?.(); return; } // someone changed the recording: refresh from the server
        if (topic !== CONTROL_TOPIC || !participant) return;
        // Only the server-signed host identity can control the room; anyone else's message is ignored.
        if (!parseMeta(participant).h) return;
        let msg;
        try {
          msg = JSON.parse(decoder.decode(payload));
        } catch {
          return;
        }
        if (msg?.type === 'recording') beatRef.current?.();
        if (msg?.type === 'ended') {
          setEnded(true);
          setNotice('The organizer ended the meeting.');
          r.disconnect();
        }
      });

      // Still inside the click that started the join (nothing has been awaited yet).
      r.startAudio().catch(() => setCanPlayAudio(false));

      const fail = (e, fallback) => {
        roomRef.current = null;
        setRoom(null);
        setStatus('error');
        setError({ code: e?.code, message: e?.message || fallback });
        return null;
      };

      let joinData;
      try {
        joinData = await getJoin();
      } catch (e) {
        return fail(e, 'Could not join this meeting. Please try again.');
      }
      applySnapshot(joinData);

      try {
        await r.connect(joinData.url, joinData.token);
      } catch {
        leftRef.current = false;
        reportLeave();
        return fail(null, 'Could not connect to the video room. Check your connection and try again.');
      }
      setStatus('connected');
      setCanPlayAudio(r.canPlaybackAudio);

      // Devices: a refusal must never stop you from joining the meeting (you can still listen and chat).
      const support = mediaSupport();
      if (!support.ok) {
        console.error('[room] camera/microphone unavailable:', { secureContext: window.isSecureContext, origin: window.location.origin });
        if (mic || cam) setMediaError(support.message);
      } else {
        const fail = (what) => (e) => {
          console.error(`[room] could not start ${what}:`, e?.name || e, e?.message || '');
          setMediaError(mediaErrorMessage(e, what));
        };
        if (mic) await r.localParticipant.setMicrophoneEnabled(true).catch(fail('microphone'));
        if (cam && !saverRef.current) await r.localParticipant.setCameraEnabled(true).catch(fail('camera'));
      }
      if (saverRef.current) applySaver(r, true);
      bump();
      return joinData;
    },
    [reportLeave, applySnapshot]
  );

  // Heartbeat: keeps "last seen" fresh and learns whether the meeting ended or recording state changed.
  useEffect(() => {
    if (status !== 'connected') return undefined;
    let stopped = false;
    const beat = async () => {
      try {
        const res = await pingRef.current?.();
        const data = res?.data;
        if (stopped || !data) return;
        applySnapshot(data);
        if (data.status && data.status !== 'live') {
          setEnded(true);
          setNotice(`This ${noun} has ended.`);
          roomRef.current?.disconnect();
        }
      } catch {
        /* a missed heartbeat is harmless */
      }
    };
    beatRef.current = beat;
    const id = setInterval(beat, HEARTBEAT_MS);
    return () => {
      stopped = true;
      beatRef.current = null;
      clearInterval(id);
    };
  }, [status, applySnapshot]);

  // Leaving the page always leaves the room.
  useEffect(
    () => () => {
      roomRef.current?.disconnect();
    },
    []
  );

  // ── local controls ──────────────────────────────────────────────────
  const setDevice = useCallback(async (kind, on) => {
    const lp = roomRef.current?.localParticipant;
    if (!lp) return;
    if (kind !== 'screen') {
      const support = mediaSupport();
      if (!support.ok) {
        console.error(`[room] cannot toggle ${kind}:`, support.message);
        setMediaError(support.message);
        return;
      }
    }
    try {
      if (kind === 'mic') await lp.setMicrophoneEnabled(on);
      else if (kind === 'cam') await lp.setCameraEnabled(on);
      else await lp.setScreenShareEnabled(on);
    } catch (e) {
      console.error(`[room] toggling ${kind} failed:`, e?.name || e, e?.message || '');
      // Cancelling the browser's screen-share picker is normal, not an error.
      if (kind !== 'screen' || (e?.name !== 'NotAllowedError' && e?.name !== 'AbortError')) {
        setMediaError(mediaErrorMessage(e, kind === 'screen' ? 'screen' : kind === 'mic' ? 'microphone' : 'camera'));
      }
    }
    bump();
  }, []);

  const toggleMic = useCallback(() => setDevice('mic', !roomRef.current?.localParticipant.isMicrophoneEnabled), [setDevice]);
  const toggleCam = useCallback(() => {
    if (saverRef.current) {
      setMediaError('Data saver is on, so the camera is off. Turn data saver off to use your camera.');
      return;
    }
    setDevice('cam', !roomRef.current?.localParticipant.isCameraEnabled);
  }, [setDevice]);
  const toggleScreen = useCallback(() => {
    if (saverRef.current) {
      setMediaError('Data saver is on. Turn it off to share your screen.');
      return;
    }
    setDevice('screen', !roomRef.current?.localParticipant.isScreenShareEnabled);
  }, [setDevice]);

  const setDataSaver = useCallback(async (on) => {
    const r = roomRef.current;
    saverRef.current = Boolean(on);
    setDataSaverState(Boolean(on));
    if (!r) return;
    applySaver(r, Boolean(on));
    if (on) {
      // Stop sending video too: your own camera and any screen share.
      await r.localParticipant.setCameraEnabled(false).catch(() => {});
      await r.localParticipant.setScreenShareEnabled(false).catch(() => {});
    }
    bump();
  }, []);

  /** Front/back camera on phones. */
  const flipCamera = useCallback(async () => {
    try {
      const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Camera)?.videoTrack;
      if (!track) return;
      const current = track.mediaStreamTrack?.getSettings?.().facingMode;
      await track.restartTrack({ facingMode: current === 'environment' ? 'user' : 'environment' });
      bump();
    } catch {
      setMediaError('Could not switch the camera.');
    }
  }, []);

  /** Host → everyone (recording state, meeting ended). Receivers verify the sender is the host. */
  const sendControl = useCallback(async (msg) => {
    try {
      await roomRef.current?.localParticipant.publishData(encoder.encode(JSON.stringify(msg)), { reliable: true, topic: CONTROL_TOPIC });
    } catch {
      /* best effort — the heartbeat is the fallback */
    }
  }, []);

  /** Tells everyone in the room to refresh the recording indicator now (any participant may send it). */
  const nudgeRecording = useCallback(async () => {
    try {
      await roomRef.current?.localParticipant.publishData(encoder.encode('1'), { reliable: true, topic: REC_TOPIC });
    } catch {
      /* the 20 s heartbeat is the fallback */
    }
    beatRef.current?.();
  }, []);

  /** Tells everyone a chat message was just sent so they fetch it now instead of waiting for the next poll. */
  const nudgeChat = useCallback(async () => {
    try {
      await roomRef.current?.localParticipant.publishData(encoder.encode('1'), { reliable: true, topic: CHAT_TOPIC });
    } catch {
      /* polling is the fallback */
    }
  }, []);

  const startAudio = useCallback(async () => {
    try {
      await roomRef.current?.startAudio();
      setCanPlayAudio(true);
    } catch {
      /* still blocked */
    }
  }, []);

  const participants = useMemo(() => {
    const r = roomRef.current;
    if (!r) return [];
    const all = [r.localParticipant, ...r.remoteParticipants.values()];
    return all.map((p) => {
      const cam = p.getTrackPublication(Track.Source.Camera);
      const screen = p.getTrackPublication(Track.Source.ScreenShare);
      const mic = p.getTrackPublication(Track.Source.Microphone);
      const isLocal = p === r.localParticipant;
      return {
        identity: p.identity,
        name: p.name || 'Guest',
        isLocal,
        isHost: Boolean(parseMeta(p).h),
        isSpeaking: Boolean(p.isSpeaking),
        micOn: Boolean(p.isMicrophoneEnabled),
        camOn: Boolean(cam?.track) && !cam.isMuted,
        camTrack: cam?.track && !cam.isMuted ? cam.track : null,
        screenTrack: screen?.track || null,
        audioTrack: !isLocal && mic?.track ? mic.track : null, // remote voices are played by <RemoteAudio>
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, status]);

  const recording = recState.recording ? (recState.recorder?.paused ? 'paused' : 'on') : 'off';

  return {
    room,
    status,
    error,
    mediaError,
    clearMediaError: () => setMediaError(null),
    notice,
    ended,
    canPlayAudio,
    recording,
    recorder: recState.recorder,
    canRecord: recState.canRecord,
    recordingStorage: recState.recordingStorage,
    hasAudio: recState.hasAudio,
    participants,
    mediaOk: mediaSupport().ok,
    dataSaver,
    setDataSaver,
    micOn: Boolean(room?.localParticipant?.isMicrophoneEnabled),
    camOn: Boolean(room?.localParticipant?.isCameraEnabled),
    screenOn: Boolean(room?.localParticipant?.isScreenShareEnabled),
    connect,
    disconnect,
    toggleMic,
    toggleCam,
    toggleScreen,
    flipCamera,
    sendControl,
    nudgeRecording,
    chatTick,
    nudgeChat,
    startAudio,
  };
}

/**
 * Host only: builds the mixed audio stream of the whole room for the recorder.
 * start() must be called from the click that starts recording (browsers require a user gesture).
 */
export function useRoomAudioMixer(room) {
  const mixerRef = useRef(null);
  const cleanupRef = useRef(null);

  const stop = useCallback(() => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    mixerRef.current?.close();
    mixerRef.current = null;
  }, []);

  const start = useCallback(async () => {
    if (!room) throw new Error('Join the room before recording.');
    if (mixerRef.current) return mixerRef.current.stream;
    const mixer = new AudioMixer();
    mixerRef.current = mixer;
    await mixer.resume();

    const idOf = (participant, trackSid) => `${participant.identity}:${trackSid}`;
    const addPublication = (pub, participant) => {
      if (pub?.kind === Track.Kind.Audio && pub.track?.mediaStreamTrack) mixer.add(idOf(participant, pub.trackSid), pub.track.mediaStreamTrack);
    };
    [room.localParticipant, ...room.remoteParticipants.values()].forEach((p) => p.getTrackPublications().forEach((pub) => addPublication(pub, p)));

    const onSubscribed = (track, pub, participant) => track.kind === Track.Kind.Audio && mixer.add(idOf(participant, pub.trackSid), track.mediaStreamTrack);
    const onUnsubscribed = (track, pub, participant) => track.kind === Track.Kind.Audio && mixer.remove(idOf(participant, pub.trackSid));
    const onLocalPublished = (pub, participant) => addPublication(pub, participant);
    const onLocalUnpublished = (pub, participant) => pub.kind === Track.Kind.Audio && mixer.remove(idOf(participant, pub.trackSid));
    room.on(RoomEvent.TrackSubscribed, onSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onUnsubscribed);
    room.on(RoomEvent.LocalTrackPublished, onLocalPublished);
    room.on(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
    cleanupRef.current = () => {
      room.off(RoomEvent.TrackSubscribed, onSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onUnsubscribed);
      room.off(RoomEvent.LocalTrackPublished, onLocalPublished);
      room.off(RoomEvent.LocalTrackUnpublished, onLocalUnpublished);
    };
    return mixer.stream;
  }, [room]);

  useEffect(() => stop, [stop]);
  return { start, stop };
}
