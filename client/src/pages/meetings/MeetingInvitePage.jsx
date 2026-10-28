import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { CalendarPlus, CalendarDays, Clock, Users, Lock, Eye, EyeOff, Video, CheckCircle2, AlertTriangle, LogIn, ShieldCheck, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { Button, Spinner } from '../../components/ui.jsx';
import { LogoMark } from '../../components/Logo.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { meetInviteApi, passStore, touchSession } from '../../api/meetInvite.js';
import { buildIcs, downloadIcs } from '../../utils/ics.js';
import Watermark from '../../components/Watermark.jsx';

const PHASE = {
  upcoming: { label: 'Upcoming', cls: 'bg-blue-500/15 text-blue-300 ring-blue-400/30' },
  live: { label: 'Live now', cls: 'bg-red-500/15 text-red-300 ring-red-400/30' },
  ended: { label: 'Ended', cls: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
  cancelled: { label: 'Cancelled', cls: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' },
};

const isHttpUrl = (s) => /^https?:\/\/\S+$/i.test(String(s || '').trim());
const localZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return ''; } };

function Shell({ children }) {
  return (
    <div className="relative isolate min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col items-center px-4 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))]">
      <Watermark variant="room" />
      <header className="w-full max-w-xl flex items-center gap-3 py-4">
        <LogoMark size={44} />
        <div className="leading-tight">
          <p className="text-lg font-black tracking-tight text-white">LifeOS</p>
          <p className="text-xs text-slate-400">Organize · Focus · Achieve</p>
        </div>
      </header>
      <main className="w-full max-w-xl flex-1">{children}</main>
      <footer className="w-full max-w-xl pt-6 text-center text-xs text-slate-500">Meeting invitation · powered by LifeOS</footer>
    </div>
  );
}

function Notice({ icon: Icon = AlertTriangle, title, children, actions }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8 text-center space-y-3" role="alert">
      <div className="mx-auto w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center"><Icon className="w-6 h-6 text-slate-200" aria-hidden="true" /></div>
      <h1 className="text-xl font-extrabold text-white">{title}</h1>
      <p className="text-sm text-slate-300">{children}</p>
      {actions && <div className="pt-2 flex flex-col sm:flex-row gap-2 justify-center">{actions}</div>}
    </div>
  );
}

const lightBtn = 'min-h-[48px] w-full sm:w-auto bg-white/10 text-white border border-white/15 hover:bg-white/15 dark:bg-white/10 dark:text-white dark:border-white/15 dark:hover:bg-white/15';

function Fact({ icon: Icon, children }) {
  return (
    <li className="flex items-start gap-3 text-sm sm:text-base text-slate-200">
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </li>
  );
}

/** Shown to visitors who are not signed in: people who already have an account are asked to continue in it. */
function AccountPrompt({ from, compact }) {
  return (
    <div className="rounded-2xl bg-sky-500/10 ring-1 ring-sky-400/30 p-4 space-y-3">
      <div className="flex items-start gap-3">
        <LogIn className="w-5 h-5 mt-0.5 shrink-0 text-sky-300" aria-hidden="true" />
        <div className="text-sm text-sky-50">
          <p className="font-bold">Already have a LifeOS account?</p>
          <p className="text-sky-100/80">Sign in to continue in your own account — your meeting history, minutes and action items stay with you.{compact ? '' : ' No account? You can join as a guest below.'}</p>
        </div>
      </div>
      <Link to="/login" state={{ from }} className="block"><Button className="w-full min-h-[48px]" icon={LogIn}>Sign in to continue</Button></Link>
    </div>
  );
}

export default function MeetingInvitePage() {
  const { token } = useParams();
  const location = useLocation();
  const { user, loading: authLoading } = useAuth();

  const [state, setState] = useState('loading'); // loading | ready | error
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [session, setSession] = useState(null); // { participant, meeting } once unlocked
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const load = useCallback(async () => {
    setState('loading');
    try {
      if (user) await touchSession();
      const res = await meetInviteApi.info(token);
      setInfo(res.data);
      const pass = passStore.get(token);
      if (pass) {
        try {
          const s = await meetInviteApi.session(token, pass);
          // They signed in after joining as a guest: drop the guest pass so they continue as themselves
          // (the auto-join below links them to their account, no duplicate row).
          if (user && s.data.participant?.isGuest) passStore.clear(token);
          else setSession(s.data);
        } catch {
          passStore.clear(token);
        }
      }
      setState('ready');
    } catch (err) {
      setError(err);
      setState('error');
    }
  }, [token, user]);

  useEffect(() => {
    if (!authLoading) load();
  }, [authLoading, load]);

  // Organizer, or a signed-in person who already joined with this link: no password needed, so continue
  // automatically (this is what happens when they tap a "Join Meeting" notification).
  const autoTried = useRef(false);
  useEffect(() => {
    if (state !== 'ready' || session || autoTried.current) return;
    if (info?.canJoin && info.viewer?.signedIn && !info.requiresPassword && !info.requiresLogin) {
      autoTried.current = true;
      meetInviteApi.join(token, {})
        .then((res) => { passStore.set(token, res.data.pass); setSession({ participant: res.data.participant, meeting: res.data.meeting }); })
        .catch((err) => setFormError(err));
    }
  }, [state, session, info, token]);

  const submit = async (e) => {
    e.preventDefault();
    setFormError(null);
    setBusy(true);
    try {
      if (user) await touchSession();
      const res = await meetInviteApi.join(token, { password: password || undefined, name: user ? undefined : name.trim(), email: user || !email.trim() ? undefined : email.trim() });
      passStore.set(token, res.data.pass);
      setSession({ participant: res.data.participant, meeting: res.data.meeting });
      setPassword('');
    } catch (err) {
      setFormError(err);
    } finally {
      setBusy(false);
    }
  };

  // ── error states ─────────────────────────────────────────────────────
  if (state === 'loading') {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-3 py-24 text-slate-300" role="status" aria-live="polite"><Spinner size="lg" /><span className="text-sm">Opening your invitation…</span></div>
      </Shell>
    );
  }
  if (state === 'error') {
    const code = error?.code;
    const disabled = code === 'LINK_DISABLED';
    const network = code === 'NETWORK_ERROR' || code === 'RATE_LIMITED';
    return (
      <Shell>
        <Notice
          title={disabled ? 'This invitation is turned off' : network ? "We couldn't open this invitation" : 'Meeting Not Found'}
          actions={
            <>
              {network && <Button onClick={load} className="min-h-[48px] w-full sm:w-auto">Try again</Button>}
              <Link to="/" className="w-full sm:w-auto"><Button className={lightBtn}>Back to LifeOS</Button></Link>
            </>
          }
        >
          {disabled
            ? 'The organizer has turned this meeting link off. Ask them for a new link.'
            : network
              ? error?.message || 'Please check your connection and try again.'
              : 'This meeting link is invalid or has been replaced. Ask the organizer to send you the latest link.'}
        </Notice>
      </Shell>
    );
  }

  const d = session?.meeting || info; // full details after unlock, minimal card before
  const phase = d.phase;
  const meta = PHASE[phase] || PHASE.upcoming;
  const start = new Date(d.startAt);
  const end = new Date(d.endAt);
  const unlocked = Boolean(session);
  const joinUrl = unlocked && isHttpUrl(d.location) ? d.location.trim() : null;

  const addToCalendar = () => {
    downloadIcs(`${d.title}.ics`, buildIcs({
      uid: token.slice(0, 24),
      title: d.title,
      description: unlocked ? [d.description, d.agenda && `Agenda:\n${d.agenda}`].filter(Boolean).join('\n\n') : '',
      location: unlocked ? d.location : '',
      startAt: d.startAt,
      endAt: d.endAt,
      url: window.location.href,
    }));
  };

  return (
    <Shell>
      <article className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur p-5 sm:p-8 shadow-2xl shadow-black/30 space-y-6">
        <div className="space-y-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-bold ring-1 ${meta.cls}`}>
            {phase === 'live' && <span className="w-2 h-2 rounded-full bg-red-400 animate-pulse" aria-hidden="true" />}
            {meta.label}
          </span>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white break-words">{d.title}</h1>
          <p className="text-sm text-slate-400">Organized by <span className="font-semibold text-slate-200">{d.organizerName}</span></p>
        </div>

        <ul className="space-y-3">
          <Fact icon={CalendarDays}>{format(start, 'EEEE, MMMM d, yyyy')}</Fact>
          <Fact icon={Clock}>{format(start, 'h:mm a')} – {format(end, 'h:mm a')}{localZone() && <span className="block text-xs text-slate-400">Shown in your time zone ({localZone().replace(/_/g, ' ')})</span>}</Fact>
          <Fact icon={Users}>{d.participantCount} {d.participantCount === 1 ? 'participant' : 'participants'}</Fact>
        </ul>

        {unlocked && (d.description || d.agenda) && (
          <div className="space-y-4 border-t border-white/10 pt-5">
            {d.description && <p className="text-sm text-slate-300 whitespace-pre-line break-words">{d.description}</p>}
            {d.agenda && (
              <section aria-labelledby="agenda-h">
                <h2 id="agenda-h" className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Agenda</h2>
                <ul className="space-y-1.5">
                  {d.agenda.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l, i) => (
                    <li key={i} className="flex gap-2 text-sm text-slate-200 break-words"><span className="text-sky-300" aria-hidden="true">•</span><span className="min-w-0">{l.replace(/^[-*•\d.)\s]+/, '')}</span></li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {/* ── state-specific action area ── */}
        {!info.canJoin ? (
          <div className="space-y-3" role="status">
            <p className="rounded-2xl bg-amber-500/10 ring-1 ring-amber-400/30 p-4 text-sm text-amber-100">{info.message || 'This meeting is no longer open.'}</p>
            {phase === 'ended' && <Link to={`/meet/${token}/minutes`} className="block"><Button className="w-full min-h-[52px] text-base" icon={FileText}>View meeting minutes</Button></Link>}
            <Link to="/"><Button className={lightBtn}>Back to LifeOS</Button></Link>
          </div>
        ) : unlocked ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-2xl bg-emerald-500/10 ring-1 ring-emerald-400/30 p-3 text-sm text-emerald-100" role="status">
              <CheckCircle2 className="w-5 h-5 shrink-0" aria-hidden="true" />
              <span>You're in, {session.participant.name}. {phase === 'live' ? 'The meeting is live.' : 'We saved your spot.'}</span>
            </p>
            {joinUrl ? (
              <a href={joinUrl} target="_blank" rel="noopener noreferrer" className="block">
                <Button className="w-full min-h-[52px] text-base" icon={Video}>Join Meeting</Button>
              </a>
            ) : d.videoRoom ? (
              <Link to={`/meet/${token}/room`} className="block">
                <Button className="w-full min-h-[52px] text-base" icon={Video}>Join Meeting</Button>
              </Link>
            ) : (
              <>
                <Button className="w-full min-h-[52px] text-base" icon={Video} disabled aria-describedby="join-help">Join Meeting</Button>
                <p id="join-help" className="text-xs text-slate-400 text-center">The organizer hasn't added a meeting room yet. Keep this page — the Join button will open it once it's set up.</p>
              </>
            )}
            <Button className={lightBtn} icon={CalendarPlus} onClick={addToCalendar}>Add to Calendar</Button>
            {!user && <AccountPrompt from={{ pathname: location.pathname }} compact />}
          </div>
        ) : info.requiresLogin ? (
          <div className="space-y-3">
            <p className="flex items-center gap-2 rounded-2xl bg-white/5 ring-1 ring-white/10 p-4 text-sm text-slate-200"><Lock className="w-5 h-5 shrink-0 text-sky-300" aria-hidden="true" /> You need a LifeOS account to join this meeting.</p>
            <Link to="/login" state={{ from: { pathname: location.pathname } }} className="block"><Button className="w-full min-h-[52px] text-base" icon={LogIn}>Sign in to join</Button></Link>
            <Link to="/register" state={{ from: { pathname: location.pathname } }} className="block"><Button className={`${lightBtn} w-full`}>Create a free account</Button></Link>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-4 border-t border-white/10 pt-5" noValidate>
            {!user && <AccountPrompt from={{ pathname: location.pathname }} />}
            <div className="flex items-start gap-2 text-sm text-slate-300"><ShieldCheck className="w-5 h-5 shrink-0 text-sky-300 mt-0.5" aria-hidden="true" /><p>{info.viewer?.isOrganizer ? 'You are the organizer.' : 'This meeting is protected. Enter the password the organizer shared with you.'}</p></div>
            {!user && (
              <div>
                <label htmlFor="guest-name" className="block text-sm font-medium text-slate-200 mb-1.5">Your name</label>
                <input id="guest-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoComplete="name" required
                  className="w-full min-h-[48px] rounded-xl bg-slate-900/70 border border-white/15 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400" placeholder="e.g. Mary Johnson" />
              </div>
            )}
            {!user && (
              <div>
                <label htmlFor="guest-email" className="block text-sm font-medium text-slate-200 mb-1.5">Email <span className="text-slate-400 font-normal">(optional — we'll send you the meeting minutes)</span></label>
                <input id="guest-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={254} autoComplete="email" inputMode="email"
                  className="w-full min-h-[48px] rounded-xl bg-slate-900/70 border border-white/15 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400" placeholder="you@example.com" />
              </div>
            )}
            {info.requiresPassword && (
              <div>
                <label htmlFor="meet-pw" className="block text-sm font-medium text-slate-200 mb-1.5">Meeting password</label>
                <div className="relative">
                  <input id="meet-pw" type={showPw ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} maxLength={64}
                    autoComplete="off" autoCapitalize="off" spellCheck="false" required
                    className="w-full min-h-[48px] rounded-xl bg-slate-900/70 border border-white/15 pl-4 pr-12 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-400" placeholder="Password" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Hide password' : 'Show password'} aria-pressed={showPw}
                    className="absolute inset-y-0 right-0 w-12 flex items-center justify-center text-slate-400 hover:text-white">{showPw ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}</button>
                </div>
              </div>
            )}
            {formError && <p className="rounded-xl bg-red-500/10 ring-1 ring-red-400/30 p-3 text-sm text-red-200" role="alert">{formError.message || 'Something went wrong. Please try again.'}</p>}
            <Button type="submit" loading={busy} className="w-full min-h-[52px] text-base" icon={Video}>{info.requiresPassword ? 'Join Meeting' : 'Continue'}</Button>
            <Button type="button" className={`${lightBtn} w-full`} icon={CalendarPlus} onClick={addToCalendar}>Add to Calendar</Button>
          </form>
        )}
      </article>
    </Shell>
  );
}
