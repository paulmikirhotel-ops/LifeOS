import React from 'react';

/**
 * The LifeOS logo as a faded background watermark.
 *
 * - Uses the existing LifeOS artwork (/logo-watermark.png is /logo-mark.png with its black tile made transparent,
 *   so it fades into any page background instead of showing a grey square).
 * - Pure CSS background on a fixed layer: `pointer-events: none`, hidden from assistive tech, and `z-index: -1`, so
 *   it always sits BEHIND the page. The parent layout must create its own stacking context (add `relative isolate`)
 *   so "behind the page" means behind the content, not behind the page background.
 * - Size, opacity and position adapt to desktop, tablet, phones and landscape (see index.css).
 *
 * variant="room" is the quieter version for the dark meeting screen. `shift` nudges the centre sideways, used to
 * keep the mark centred in the content area beside the sidebar.
 */
export default function Watermark({ variant = 'page', shift }) {
  return (
    <div
      aria-hidden="true"
      className={`lifeos-watermark${variant === 'room' ? ' lifeos-watermark--room' : ''}`}
      style={shift ? { '--wm-shift': shift } : undefined}
    />
  );
}
