// Run once from the client folder:  node scripts/apply-audio-patch.mjs
// Better voice settings for Meetings AND Connect calls, plus the Audio panel inside the room.
import fs from 'node:fs';
const edit = (file, fn) => {
  if (!fs.existsSync(file)) return console.log('MISSING:', file);
  const a = fs.readFileSync(file, 'utf8'), b = fn(a);
  if (a === b) return console.log('unchanged:', file);
  fs.writeFileSync(file, b); console.log('patched:  ', file);
};
edit('src/hooks/useMeetingRoom.js', (s) => {
  if (s.includes('captureOptions')) return s;
  let ok = true;
  s = s.replace(/(import \{ AudioMixer \} from '\.\.\/utils\/audioMixer\.js';)/, `$1\nimport { captureOptions, loadAudioPrefs, AUDIO_PUBLISH } from '../utils/audioConfig.js';`);
  const a = s.replace(/audioCaptureDefaults: \{ echoCancellation: true, noiseSuppression: true, autoGainControl: true \},/, 'audioCaptureDefaults: captureOptions(loadAudioPrefs()),');
  if (a === s) ok = false;
  const b = a.replace(/publishDefaults: \{/, 'publishDefaults: {\n          ...AUDIO_PUBLISH,');
  if (b === a) ok = false;
  if (!ok) console.log('WARNING: could not update the voice settings in useMeetingRoom.js - tell Claude');
  return b;
});
edit('src/components/meetings/room/RoomView.jsx', (s) => {
  if (s.includes('RoomAudioPanel')) return s;
  s = s.replace(/(import RemoteAudio from '\.\/RemoteAudio\.jsx';)/, `$1\nimport RoomAudioPanel from './RoomAudioPanel.jsx';`);
  const r = s.replace(/(\n\s*)(<RemoteAudio participants=\{people\} \/>)/, `$1$2$1<RoomAudioPanel room={room.room} connected={room.status === 'connected'} dataSaver={room.dataSaver} setDataSaver={room.setDataSaver} />`);
  if (r === s) console.log('WARNING: could not place the Audio panel in RoomView.jsx - tell Claude');
  return r;
});
