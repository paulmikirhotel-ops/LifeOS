import React, { useEffect, useRef } from 'react';

/** Plays one remote participant's voice. Invisible; one <audio> element per speaker. */
function AudioSink({ track }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return undefined;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return <audio ref={ref} autoPlay playsInline />;
}

export default function RemoteAudio({ participants }) {
  return (
    <div className="hidden" aria-hidden="true">
      {participants.filter((p) => p.audioTrack).map((p) => <AudioSink key={p.identity} track={p.audioTrack} />)}
    </div>
  );
}
