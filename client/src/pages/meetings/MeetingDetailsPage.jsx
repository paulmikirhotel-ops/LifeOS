import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Play, Pencil, XCircle, Trash2, Download, Share2, RefreshCw, Clock, MapPin, Users, Pause, ExternalLink, Save, Sparkles } from 'lucide-react';
import { Button, Card, Badge, EmptyState, Spinner, Textarea, Input } from '../../components/ui.jsx';
import StatusBadge from '../../components/meetings/StatusBadge.jsx';
import ProcessingPanel from '../../components/meetings/ProcessingPanel.jsx';
import TranscriptView from '../../components/meetings/TranscriptView.jsx';
import AudioPlayer from '../../components/meetings/AudioPlayer.jsx';
import ActionItemsList from '../../components/meetings/ActionItemsList.jsx';
import AskMeeting from '../../components/meetings/AskMeeting.jsx';
import ExportMenu from '../../components/meetings/ExportMenu.jsx';
import ShareDialog from '../../components/meetings/ShareDialog.jsx';
import ConfirmDialog from '../../components/meetings/ConfirmDialog.jsx';
import MiniMarkdown from '../../components/meetings/MiniMarkdown.jsx';
import { meetingsApi } from '../../api/meetings.js';
import { typeLabel, rangeLabel, formatDuration, clock } from '../../utils/meetingFormat.js';
import { useTenant } from '../../context/TenantContext.jsx';
import { useToast } from '../../context/ToastContext.jsx';
import { formatApiError } from '../../utils/errors.js';
import { useCapabilities } from '../../hooks/useCapabilities.js';
import { downloadBlob } from '../../utils/meetingFormat.js';

const TABS = [
  ['overview', 'Overview'],
  ['transcript', 'Transcript'],
  ['recording', 'Recording'],
  ['summary', 'Summary'],
  ['minutes', 'Minutes'],
  ['actions', 'Action Items'],
  ['notes', 'Notes'],
  ['participants', 'Participants'],
];
const isActive = (v) => ['pending', 'processing'].includes(v);
const isUrl = (v) => /^https?:\/\//i.test(v || '');

export default function MeetingDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = useTenant();
  const { addToast } = useToast();
  const feat = useCapabilities();

  const [meeting, setMeeting] = useState(null);
  const [error, setError] = useState(null);
  const [tab, setTab] = useState(params.get('tab') || 'overview');
  const [exportOpen, setExportOpen] = useState(params.get('export') === '1');
  const [shareOpen, setShareOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const [scope, setScope] = useState('one');
  const [busy, setBusy] = useState(false);

  // transcript
  const [segments, setSegments] = useState([]);
  const [tLoading, setTLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [jumpSeq, setJumpSeq] = useState(null);
  const [activeMs, setActiveMs] = useState(null);
  const nextAfter = useRef(null);
  const segRef = useRef([]);
  const jumpingRef = useRef(false);
  segRef.current = segments;

  // audio
  const audioRef = useRef(null);
  const [audio, setAudio] = useState(null); // { url, ... }
  const [actionItems, setActionItems] = useState([]);
  const [speakers, setSpeakers] = useState([]);
  const [notes, setNotes] = useState('');
  const [minutesDraft, setMinutesDraft] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await meetingsApi.get(id);
      setMeeting(res.data);
      setError(null);
      return res.data;
    } catch (err) {
      setError(err?.code === 'NOT_FOUND' ? 'This meeting doesn’t exist or you don’t have access to it.' : formatApiError(err));
      return null;
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (meeting) setNotes(meeting.notes || ''); }, [meeting?.notes]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while background processing is running.
  const processing = meeting && (['transcript', 'summary', 'minutes', 'actionItems'].some((k) => isActive(meeting.processing?.[k])) || meeting.recording?.status === 'uploading');
  useEffect(() => {
    if (!processing) return undefined;
    const t = setInterval(() => document.visibilityState === 'visible' && load(), 4000);
    return () => clearInterval(t);
  }, [processing, load]);

  const changeTab = (t) => { setTab(t); setParams((p) => { p.set('tab', t); p.delete('export'); return p; }, { replace: true }); };

  // ── transcript loading ───────────────────────────────────────────────
  const loadTranscript = useCallback(async ({ reset = true, search = q } = {}) => {
    setTLoading(true);
    try {
      const res = await meetingsApi.transcript(id, { limit: 200, q: search || undefined, afterSeq: reset || nextAfter.current == null ? undefined : nextAfter.current });
      setSegments((cur) => (reset ? res.data.items : [...cur, ...res.data.items]));
      setHasMore(res.data.hasMore);
      nextAfter.current = res.data.nextAfterSeq;
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setTLoading(false);
    }
  }, [id, q]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = useCallback((s) => { setQ(s); loadTranscript({ reset: true, search: s }); }, [loadTranscript]);
  const transcriptStage = meeting?.processing?.transcript;
  useEffect(() => { if (meeting && tab === 'transcript' && !q && !jumpingRef.current) loadTranscript({ reset: true, search: '' }); }, [tab, transcriptStage, meeting?.stats?.segmentCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── audio ────────────────────────────────────────────────────────────
  const recReady = meeting?.recording?.status === 'ready';
  const fetchAudio = useCallback(async () => {
    try {
      const res = await meetingsApi.recordingUrl(id);
      setAudio(res.data);
    } catch (err) {
      setAudio({ error: formatApiError(err) });
    }
  }, [id]);
  useEffect(() => { if (recReady && !audio) fetchAudio(); }, [recReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const seekTo = (ms) => {
    const el = audioRef.current;
    if (!el || !audio?.url) return addToast('No recording is available for this meeting', 'error');
    el.currentTime = ms / 1000;
    el.play().catch(() => addToast('Press play in the Recording tab to start audio', 'error'));
  };

  // ── other tabs' data ────────────────────────────────────────────────
  const loadItems = useCallback(async () => {
    try { setActionItems((await meetingsApi.actionItems(id)).data.items); } catch { /* shown empty */ }
  }, [id]);
  useEffect(() => { if (meeting && (tab === 'actions' || tab === 'overview')) loadItems(); }, [tab, meeting?.processing?.actionItems]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (meeting && tab === 'participants') meetingsApi.speakers(id).then((r) => setSpeakers(r.data.items)).catch(() => {}); }, [tab, id, !!meeting]); // eslint-disable-line react-hooks/exhaustive-deps

  const jumpToSeq = async (seq) => {
    jumpingRef.current = true;
    changeTab('transcript');
    try {
      // Load consecutive pages until the cited line is present (bounded), then scroll to it.
      let acc = q ? [] : [...segRef.current];
      let after = acc.length ? acc[acc.length - 1].seq : undefined;
      let more = true;
      let guard = 0;
      if (!acc.some((x) => x.seq === seq)) {
        setTLoading(true);
        while (more && guard < 40 && !(acc.length && acc[acc.length - 1].seq >= seq)) {
          guard += 1;
          // eslint-disable-next-line no-await-in-loop
          const r = await meetingsApi.transcript(id, { limit: 500, afterSeq: after });
          if (!r.data.items.length) break;
          acc = acc.concat(r.data.items);
          more = r.data.hasMore;
          after = r.data.nextAfterSeq;
        }
        setSegments(acc);
        setHasMore(more);
        nextAfter.current = after ?? nextAfter.current;
      }
    } catch (err) {
      addToast(formatApiError(err), 'error');
    } finally {
      setTLoading(false);
      jumpingRef.current = false;
    }
    setJumpSeq(null);
    setTimeout(() => setJumpSeq(seq), 100);
  };

  const onCitation = (c) => { jumpToSeq(c.seq); if (audio?.url) seekTo(c.startMs); };

  // ── actions ─────────────────────────────────────────────────────────
  const run = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) addToast(okMsg); await load(); } catch (err) { addToast(err?.code === 'AI_NOT_CONFIGURED' ? 'AI is not set up on the server yet.' : err?.code === 'STT_NOT_CONFIGURED' ? 'Speech-to-text is not set up on the server yet.' : formatApiError(err), 'error'); } finally { setBusy(false); }
  };

  const doConfirm = () => run(async () => {
    if (confirm === 'cancel') await meetingsApi.cancel(id);
    else { await meetingsApi.remove(id, scope === 'series' ? 'series' : undefined); navigate('/meetings/history', { replace: true }); }
    setConfirm(null);
  }, confirm === 'cancel' ? 'Meeting cancelled' : 'Meeting deleted');

  const exportNow = async (kind, format) => {
    try { await downloadBlob(await meetingsApi.exportFile(id, kind, format), `${kind}-${id.slice(-6)}.${format}`); }
    catch (err) { addToast(formatApiError(err), 'error'); }
  };

  if (error) return (<div className="mx-auto max-w-lg py-16"><EmptyState title="Meeting unavailable" description={error} action={<Link to="/meetings"><Button>Back to meetings</Button></Link>} /></div>);
  if (!meeting) return <div className="flex justify-center py-24"><Spinner size="lg" /></div>;

  const m = meeting;
  const manage = m.canManage;
  const ai = feat.ai;

  // Show only what can work here, or what this meeting already has.
  const hasRecording = m.recording?.status && m.recording.status !== 'none';
  const hasTranscript = (m.stats?.segmentCount || 0) > 0 || (m.processing?.transcript && m.processing.transcript !== 'idle');
  const hasSummary = Boolean(m.summary?.executiveSummary);
  const hasMinutes = Boolean(m.minutes?.content);
  const visible = {
    overview: true,
    transcript: feat.transcription || hasTranscript,
    recording: feat.recording || hasRecording,
    summary: feat.ai || hasSummary,
    minutes: feat.ai || hasMinutes,
    actions: true,
    notes: true,
    participants: true,
  };
  const tabs = TABS.filter(([k]) => visible[k]);
  const showAsk = m.status === 'completed' && feat.ai;
  const showShare = manage && m.status === 'completed' && (hasSummary || hasMinutes || (m.stats?.actionItemCount || 0) > 0);
  const exportKinds = ['action-items', ...(hasTranscript ? ['transcript'] : []), ...(hasSummary ? ['summary'] : []), ...(hasMinutes ? ['minutes'] : [])];
  const activeTab = visible[tab] ? tab : 'overview';

  return (
    <div className="space-y-5 pb-28 md:pb-8">
      <Link to="/meetings" className="inline-flex items-center gap-1 text-sm font-semibold text-slate-500 hover:text-indigo-600"><ChevronLeft className="w-4 h-4" aria-hidden="true" /> Meetings</Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white break-words">{m.title}</h1><StatusBadge meeting={m} /></div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="inline-flex items-center gap-1"><Clock className="w-4 h-4" aria-hidden="true" />{rangeLabel(m)}</span>
              <span className="inline-flex items-center gap-1"><Users className="w-4 h-4" aria-hidden="true" />{m.participants?.length || 0} participants</span>
              {m.durationSec != null && <span>Duration {formatDuration(m.durationSec)}</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {manage && ['scheduled', 'live'].includes(m.status) && <Button icon={Play} className="min-h-[44px]" onClick={() => navigate(`/meetings/${id}/live`)}>{m.status === 'live' ? 'Join' : 'Start'}</Button>}
            {manage && m.status === 'scheduled' && <Link to={`/meetings/${id}/edit`}><Button variant="secondary" icon={Pencil} className="min-h-[44px]">Edit</Button></Link>}
            {manage && m.status === 'scheduled' && <Button variant="secondary" icon={XCircle} onClick={() => setConfirm('cancel')} className="min-h-[44px]">Cancel</Button>}
            {m.status === 'completed' && <Button variant="secondary" icon={Download} onClick={() => setExportOpen(true)} className="min-h-[44px]">Download</Button>}
            {showShare && <Button variant="secondary" icon={Share2} onClick={() => setShareOpen(true)} className="min-h-[44px]">Share</Button>}
            {manage && m.status !== 'live' && can('meetings.delete') && <Button variant="ghost" icon={Trash2} className="text-red-600 min-h-[44px]" onClick={() => { setScope('one'); setConfirm('delete'); }}>Delete</Button>}
          </div>
        </div>
        <ProcessingPanel meeting={m} canManage={manage} onRetry={(stage) => run(() => meetingsApi.process(id, stage), 'Processing restarted')} />
      </header>

      <div role="tablist" aria-label="Meeting sections" className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-800">
        {tabs.map(([k, label]) => (
          <button key={k} role="tab" id={`tab-${k}`} aria-selected={activeTab === k} aria-controls={`panel-${k}`} onClick={() => changeTab(k)}
            className={`whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 -mb-px ${activeTab === k ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'}`}>
            {label}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`} className="min-h-[200px]">
        {activeTab === 'overview' && (
          <div className="grid gap-5 lg:grid-cols-[1fr_24rem]">
            <div className="space-y-5">
              <Card className="p-5 space-y-3 text-sm">
                <div className="flex flex-wrap gap-2"><Badge variant="info">{typeLabel(m.type)}</Badge><Badge variant="info">{m.timezone}</Badge></div>
                {m.description && <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{m.description}</p>}
                {m.location && <p className="flex items-center gap-2 break-all"><MapPin className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />{isUrl(m.location) ? <a href={m.location} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline inline-flex items-center gap-1">{m.location}<ExternalLink className="w-3 h-3" /></a> : m.location}</p>}
                {m.agenda && <div><p className="font-bold text-slate-900 dark:text-white mb-1">Agenda</p><p className="whitespace-pre-wrap text-slate-700 dark:text-slate-300">{m.agenda}</p></div>}
              </Card>
              {(feat.ai || hasSummary) && <Card className="p-5">
                <div className="mb-2 flex items-center justify-between"><h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white"><Sparkles className="w-4 h-4 text-indigo-500" aria-hidden="true" /> AI summary</h2><button type="button" className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => changeTab('summary')}>Full summary</button></div>
                {m.summary?.executiveSummary ? <p className="text-sm text-slate-700 dark:text-slate-300">{m.summary.executiveSummary}</p> : <p className="text-sm text-slate-500">{m.status === 'completed' ? 'No summary yet.' : 'A summary is generated after the meeting ends.'}</p>}
              </Card>}
              {m.notes && (
                <Card className="p-5"><div className="mb-2 flex items-center justify-between"><h2 className="text-sm font-bold text-slate-900 dark:text-white">Notes</h2><button type="button" className="text-xs font-semibold text-indigo-600 hover:underline" onClick={() => changeTab('notes')}>Open notes</button></div><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 line-clamp-6">{m.notes}</p></Card>
              )}
              {actionItems.length > 0 && (
                <Card className="p-5"><h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Action items</h2>
                  <ul className="space-y-1.5 text-sm">{actionItems.slice(0, 5).map((i) => <li key={i.id} className="flex justify-between gap-3"><span className={i.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-700 dark:text-slate-300'}>{i.task}</span><span className="text-xs text-slate-500 shrink-0">{i.assigneeName || 'Unassigned'}</span></li>)}</ul></Card>
              )}
            </div>
            {showAsk && <AskMeeting meetingId={id} aiReady={ai} onCitation={onCitation} />}
          </div>
        )}

        {activeTab === 'transcript' && (
          <div className="space-y-3">
            {activeMs != null && audio?.url && (
              <div className="flex items-center justify-between rounded-xl bg-indigo-50 dark:bg-indigo-900/20 px-3 py-2 text-sm text-indigo-700 dark:text-indigo-300">
                <span>Recording position · {clock(activeMs)}</span>
                <button type="button" className="inline-flex items-center gap-1 font-semibold" onClick={() => audioRef.current?.paused ? audioRef.current.play() : audioRef.current?.pause()}><Pause className="w-4 h-4" aria-hidden="true" /> Play / pause</button>
              </div>
            )}
            <TranscriptView
              segments={segments} loading={tLoading} startedAt={m.startedAt} activeMs={activeMs} jumpSeq={jumpSeq}
              canEdit={manage} hasMore={hasMore} onLoadMore={() => loadTranscript({ reset: false })} onSearch={onSearch}
              onSeek={recReady ? seekTo : undefined}
              onEdit={async (seq, patch) => { try { const r = await meetingsApi.editSegment(id, seq, patch); setSegments((cur) => cur.map((s) => (s.seq === seq ? { ...s, ...r.data } : s))); } catch (err) { addToast(formatApiError(err), 'error'); throw err; } }}
              onImport={manage && ['live', 'completed'].includes(m.status) ? async (text) => { try { const r = await meetingsApi.importTranscript(id, text); addToast(`${r.data.imported} lines imported`); await load(); loadTranscript({ reset: true, search: '' }); } catch (err) { addToast(formatApiError(err), 'error'); } } : undefined}
              emptyHint={m.status === 'completed' ? 'No speech was transcribed for this meeting. If you have a transcript from elsewhere you can paste it in.' : 'The transcript appears after the meeting starts.'}
            />
          </div>
        )}

        <div className={activeTab === 'recording' ? '' : 'hidden'} aria-hidden={activeTab !== 'recording'}>
          {recReady && audio?.url ? (
            <div className="space-y-3">
              <AudioPlayer audioRef={audioRef} src={audio.url} durationHintSec={audio.durationSec} onTime={setActiveMs} onExpired={fetchAudio} />
              <p className="text-xs text-slate-500">Recording is private to people with access to this meeting. Size {(audio.sizeBytes / 1048576).toFixed(1)} MB.{m.recording?.missingChunks > 0 ? ` ${m.recording.missingChunks} short segment(s) were lost because of connection problems.` : ''}</p>
            </div>
          ) : recReady && audio?.error ? (
            <p role="alert" className="text-sm text-red-600">{audio.error}</p>
          ) : recReady ? <div className="flex justify-center py-10"><Spinner /></div> : (
            <EmptyState title={m.recording?.status === 'uploading' ? 'Saving the recording…' : m.recording?.status === 'failed' ? 'Recording could not be finalised' : 'No recording'} description={m.recording?.status === 'failed' ? 'The audio pieces are kept. Use “Try again” above.' : 'Recordings appear here after a meeting that was recorded ends.'} />
          )}
        </div>

        {activeTab === 'summary' && (
          <div className="space-y-4">
            {manage && m.status === 'completed' && <div className="flex justify-end"><Button variant="secondary" icon={RefreshCw} loading={busy} onClick={() => run(() => meetingsApi.generateSummary(id), 'Generating summary…')}>{m.summary?.executiveSummary ? 'Regenerate' : 'Generate summary'}</Button></div>}
            {m.summary?.executiveSummary ? (
              <div className="space-y-4">
                <Card className="p-5"><h2 className="text-sm font-bold mb-1 text-slate-900 dark:text-white">Executive summary</h2><p className="text-sm text-slate-700 dark:text-slate-300">{m.summary.executiveSummary}</p></Card>
                {[['Key discussion points', 'keyPoints'], ['Decisions', 'decisions'], ['Questions for follow-up', 'questions'], ['Next steps', 'nextSteps']].map(([label, k]) => (
                  <Card key={k} className="p-5"><h2 className="text-sm font-bold mb-2 text-slate-900 dark:text-white">{label}</h2>{m.summary[k]?.length ? <ul className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">{m.summary[k].map((t, i) => <li key={i}>{t}</li>)}</ul> : <p className="text-sm text-slate-400">None recorded.</p>}</Card>
                ))}
                {m.summary.topics?.length > 0 && <div className="flex flex-wrap gap-2">{m.summary.topics.map((t) => <Badge key={t}>{t}</Badge>)}</div>}
                <p className="text-xs text-slate-400">Generated by AI from the transcript{m.summary.generatedAt ? ` on ${new Date(m.summary.generatedAt).toLocaleString()}` : ''}. Review before relying on it.</p>
                <div className="flex gap-2"><Button variant="secondary" size="sm" icon={Download} onClick={() => exportNow('summary', 'pdf')}>PDF</Button><Button variant="secondary" size="sm" icon={Download} onClick={() => exportNow('summary', 'docx')}>DOCX</Button></div>
              </div>
            ) : <EmptyState icon={Sparkles} title="No summary yet" description={ai ? 'A summary is generated automatically once there is a transcript.' : 'AI summaries turn on once an AI provider is configured on the server.'} />}
          </div>
        )}

        {activeTab === 'minutes' && (
          <div className="space-y-4">
            {m.minutes?.content ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">{m.minutes.editedAt ? 'Edited' : 'AI-generated'} draft — review before circulating.</p>
                  <div className="flex flex-wrap gap-2">
                    {manage && minutesDraft == null && <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setMinutesDraft(m.minutes.content)}>Edit</Button>}
                    {manage && <Button variant="secondary" size="sm" icon={RefreshCw} loading={busy} onClick={() => run(() => meetingsApi.generateMinutes(id), 'Regenerating minutes…')}>Regenerate</Button>}
                    <Button variant="secondary" size="sm" icon={Download} onClick={() => exportNow('minutes', 'pdf')}>PDF</Button>
                    <Button variant="secondary" size="sm" icon={Download} onClick={() => exportNow('minutes', 'docx')}>DOCX</Button>
                  </div>
                </div>
                {minutesDraft != null ? (
                  <div className="space-y-2">
                    <Textarea rows={22} value={minutesDraft} onChange={(e) => setMinutesDraft(e.target.value)} className="font-mono" aria-label="Edit minutes (Markdown)" />
                    <div className="flex gap-2"><Button icon={Save} loading={busy} onClick={() => run(async () => { await meetingsApi.saveMinutes(id, minutesDraft); setMinutesDraft(null); }, 'Minutes saved')}>Save</Button><Button variant="secondary" onClick={() => setMinutesDraft(null)}>Cancel</Button></div>
                  </div>
                ) : <Card className="p-5 sm:p-6"><MiniMarkdown text={m.minutes.content} /></Card>}
              </>
            ) : <EmptyState title="No minutes yet" description={ai ? 'Minutes are generated after the AI summary is ready.' : 'Minutes need an AI provider configured on the server.'} action={manage && m.status === 'completed' && ai ? <Button loading={busy} onClick={() => run(() => meetingsApi.generateMinutes(id), 'Generating minutes…')}>Generate meeting minutes</Button> : null} />}
          </div>
        )}

        {activeTab === 'actions' && <ActionItemsList meetingId={id} items={actionItems} canManage={manage} canCreateTasks={can('tasks.create')} onChange={async () => { await loadItems(); }} onJumpToSeq={jumpToSeq} />}

        {activeTab === 'notes' && (
          <div className="space-y-3">
            {manage ? (
              <>
                <Textarea label="Meeting notes" rows={12} value={notes} maxLength={20000} onChange={(e) => setNotes(e.target.value)} />
                <Button icon={Save} loading={busy} disabled={notes === (m.notes || '')} onClick={() => run(() => meetingsApi.update(id, { notes }), 'Notes saved')}>Save notes</Button>
              </>
            ) : m.notes ? <Card className="p-5"><p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{m.notes}</p></Card> : <EmptyState title="No notes" description="The organizer hasn’t added notes." />}
          </div>
        )}

        {activeTab === 'participants' && (
          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-5"><h2 className="text-sm font-bold mb-3 text-slate-900 dark:text-white">Invited</h2>
              <ul className="space-y-2 text-sm">{(m.participants || []).map((p) => <li key={p._id || p.name} className="flex items-center justify-between gap-2"><span className="dark:text-slate-200">{p.name}{p.email ? <span className="text-xs text-slate-400"> · {p.email}</span> : null}</span><span className="text-xs text-slate-500">{p.role === 'chair' ? 'Chair' : p.userId ? 'Member' : 'Guest'}</span></li>)}</ul>
              <p className="mt-3 text-xs text-slate-400">Attendance isn’t verified from audio.</p>
            </Card>
            {hasTranscript && <Card className="p-5"><h2 className="text-sm font-bold mb-1 text-slate-900 dark:text-white">Voices in the recording</h2>
              <p className="mb-3 text-xs text-slate-500">Speakers are detected automatically as “Speaker 1, 2…”. Name them if you know who is who — LifeOS never guesses identities from voices.</p>
              {speakers.length === 0 ? <p className="text-sm text-slate-400">No speakers detected yet.</p> : (
                <ul className="space-y-3">{speakers.map((s) => <SpeakerRow key={s.label} s={s} disabled={!manage} onSave={async (name) => { try { await meetingsApi.renameSpeaker(id, s.label, name); addToast('Speaker renamed'); setSpeakers((cur) => cur.map((x) => (x.label === s.label ? { ...x, name: name || null } : x))); setSegments([]); } catch (err) { addToast(formatApiError(err), 'error'); } }} />)}</ul>
              )}
            </Card>}
          </div>
        )}
      </div>

      <ExportMenu meetingId={id} open={exportOpen} onClose={() => setExportOpen(false)} kinds={exportKinds} />
      <ShareDialog meetingId={id} open={shareOpen} onClose={() => setShareOpen(false)} />
      <ConfirmDialog open={Boolean(confirm)} danger loading={busy} title={confirm === 'cancel' ? 'Cancel this meeting?' : 'Delete this meeting?'}
        message={confirm === 'cancel' ? 'Participants are notified and it is removed from the calendar.' : 'This permanently deletes the meeting, its transcript, action items and recording.'}
        confirmLabel={confirm === 'cancel' ? 'Cancel meeting' : 'Delete'} onConfirm={doConfirm} onClose={() => setConfirm(null)}>
        {confirm === 'delete' && m.seriesId && (
          <fieldset className="mt-4 space-y-2 text-sm">
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> Only this meeting</label>
            <label className="flex items-center gap-2"><input type="radio" name="scope" checked={scope === 'series'} onChange={() => setScope('series')} /> This and all later scheduled meetings in the series</label>
          </fieldset>
        )}
      </ConfirmDialog>
    </div>
  );
}

function SpeakerRow({ s, onSave, disabled }) {
  const [v, setV] = useState(s.name || '');
  useEffect(() => setV(s.name || ''), [s.name]);
  return (
    <li className="flex items-end gap-2">
      <Input label={`${s.label} · ${s.segments} lines`} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)} placeholder="Name (optional)" maxLength={120} />
      {!disabled && <Button size="sm" variant="secondary" onClick={() => onSave(v.trim())} disabled={v.trim() === (s.name || '')}>Save</Button>}
    </li>
  );
}
