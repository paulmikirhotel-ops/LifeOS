import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Button, EmptyState, Spinner } from '../../components/ui.jsx';
import RoomView from '../../components/meetings/room/RoomView.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import { formatApiError } from '../../utils/errors.js';

const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());

/**
 * Video room for workspace members (organizer, listed participants, workspace owner).
 * The organizer's "Start" also starts the meeting; everyone else waits (and is told) until it is live.
 */
export default function MeetingRoomPage() {
  const { id } = useParams();
  const feat = useCapabilities();
  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(
    () => meetingsApi.get(id).then((r) => setMeeting(r.data)).catch((err) => setError(err?.code === 'NOT_FOUND' ? "This meeting doesn't exist or you don't have access." : formatApiError(err))),
    [id]
  );
  useEffect(() => { load(); }, [load]);

  const manage = Boolean(meeting?.canManage);
  const getJoin = useCallback(async () => {
    // Only the organizer can start the meeting; the server enforces this too.
    if (manage && meeting.status === 'scheduled') {
      const started = await meetingsApi.start(id);
      setMeeting(started.data);
    }
    return (await meetingsApi.roomJoin(id)).data;
  }, [id, manage, meeting?.status]);
  const ping = useCallback(() => meetingsApi.roomPing(id), [id]);
  const leave = useCallback(() => meetingsApi.roomLeave(id), [id]);
  // Deliberately does NOT update the page's meeting state: marking it "completed" here would swap the room for the
  // "meeting ended" screen and unmount it before the host's "ended" message reaches the other participants.
  const end = useCallback(async (body) => { await meetingsApi.end(id, body); }, [id]);

  // Recording: any participant may record (the organizer can switch that off). Audio is saved on the organizer's meeting.
  const recorder = useMemo(() => ({
    storeKey: id,
    claim: () => meetingsApi.claimRecording(id),
    release: () => meetingsApi.releaseRecording(id),
    beat: (body) => meetingsApi.recordingBeat(id, body),
  }), [id]);

  const chat = useMemo(() => ({ list: (after) => meetingsApi.chatList(id, after), send: (text) => meetingsApi.chatSend(id, text) }), [id]);
  const back = <Link to={`/meetings/${id}`}><Button>Meeting details</Button></Link>;

  if (error) return <div className="mx-auto max-w-lg py-16"><EmptyState title="Meeting unavailable" description={error} action={<Link to="/meetings"><Button>Back to meetings</Button></Link>} /></div>;
  if (!meeting || !feat.loaded) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  if (meeting.status === 'cancelled') return <div className="mx-auto max-w-lg py-16"><EmptyState title="This meeting was cancelled" action={back} /></div>;
  if (meeting.status === 'completed') return <div className="mx-auto max-w-lg py-16"><EmptyState title="This meeting has ended" description="Open it to review the recording, transcript and summary." action={back} /></div>;

  if (!feat.video) {
    return (
      <div className="mx-auto max-w-lg py-16">
        <EmptyState
          title="Video rooms aren't set up yet"
          description={isHttpUrl(meeting.location) ? 'Use the meeting link the organizer added.' : manage ? 'Add the LiveKit settings on the server to enable video, or run this meeting in audio-recording mode.' : "The organizer hasn't set up a video room for this workspace."}
          action={
            isHttpUrl(meeting.location)
              ? <a href={meeting.location.trim()} target="_blank" rel="noopener noreferrer"><Button>Open meeting link</Button></a>
              : manage ? <Link to={`/meetings/${id}/live`}><Button>Open audio meeting room</Button></Link> : back
          }
        />
      </div>
    );
  }

  return (
    <RoomView
      title={meeting.title}
      subtitle={manage ? 'You are the host of this meeting.' : 'You are joining as a participant.'}
      getJoin={getJoin}
      ping={ping}
      leave={leave}
      exitTo={`/meetings/${id}`}
      exitLabel="Back to meeting details"
      recorder={recorder} chat={chat}
      host={manage ? {
        meetingId: id,
        status: meeting.status,
        liveTranscription: Boolean(feat.transcription),
        end,
      } : null}
    />
  );
}
