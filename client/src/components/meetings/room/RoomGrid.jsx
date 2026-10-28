import React, { useMemo } from 'react';
import VideoTile from './VideoTile.jsx';

const MAX_TILES = 12; // adaptive streaming keeps hidden people cheap, but a phone can't show 40 faces anyway

const gridCols = (n) => {
  if (n <= 1) return 'grid-cols-1';
  if (n <= 2) return 'grid-cols-1 sm:grid-cols-2';
  if (n <= 4) return 'grid-cols-2';
  if (n <= 6) return 'grid-cols-2 lg:grid-cols-3';
  return 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4';
};

/**
 * Speaker-first layout. With no screen share: an even grid (active speakers and cameras first).
 * With a screen share: the screen is the stage and people sit in a strip beside / under it.
 */
export default function RoomGrid({ participants }) {
  const sharing = participants.find((p) => p.screenTrack);

  const ordered = useMemo(() => {
    const score = (p) => (p.isLocal ? 3 : 0) + (p.isSpeaking ? 4 : 0) + (p.camOn ? 2 : 0) + (p.isHost ? 1 : 0);
    return [...participants].sort((a, b) => score(b) - score(a));
  }, [participants]);

  if (sharing) {
    const strip = ordered.slice(0, 8);
    return (
      <div className="flex h-full min-h-0 flex-col gap-2 lg:flex-row">
        <VideoTile participant={sharing} screen className="min-h-0 flex-1" />
        <div className="flex gap-2 overflow-x-auto lg:w-56 lg:flex-col lg:overflow-y-auto lg:overflow-x-visible">
          {strip.map((p) => <VideoTile key={p.identity} participant={p} className="h-24 w-36 shrink-0 lg:h-32 lg:w-full" />)}
        </div>
      </div>
    );
  }

  const shown = ordered.slice(0, MAX_TILES);
  const extra = ordered.length - shown.length;
  return (
    <div className={`grid h-full min-h-0 auto-rows-fr gap-2 sm:gap-3 ${gridCols(shown.length)}`}>
      {shown.map((p) => <VideoTile key={p.identity} participant={p} className="min-h-[140px]" />)}
      {extra > 0 && <div className="flex items-center justify-center rounded-2xl bg-slate-800 text-sm font-semibold text-slate-300">+{extra} more in the participant list</div>}
    </div>
  );
}
