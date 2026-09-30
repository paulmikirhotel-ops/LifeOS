import React from 'react';

/** Renders the small Markdown subset the minutes use (headings, bullets, **bold**, _italic_). Text only — no HTML injection. */
function inline(text) {
  const parts = [];
  const re = /(\*\*[^*]+\*\*|_[^_]+_)/g;
  let last = 0;
  let m;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const tok = m[0];
    parts.push(tok.startsWith('**') ? <strong key={i++}>{tok.slice(2, -2)}</strong> : <em key={i++}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

export default function MiniMarkdown({ text = '' }) {
  const out = [];
  let bullets = [];
  const flush = () => {
    if (bullets.length) {
      out.push(
        <ul key={`ul${out.length}`} className="list-disc pl-5 space-y-1 text-sm text-slate-700 dark:text-slate-300">
          {bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}
        </ul>
      );
      bullets = [];
    }
  };
  text.split('\n').forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (!line.trim()) return flush();
    if (/^[-*]\s+/.test(line)) return bullets.push(line.replace(/^[-*]\s+/, ''));
    flush();
    if (line.startsWith('### ')) out.push(<h4 key={idx} className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-100">{inline(line.slice(4))}</h4>);
    else if (line.startsWith('## ')) out.push(<h3 key={idx} className="mt-6 mb-1 text-base font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-1">{inline(line.slice(3))}</h3>);
    else if (line.startsWith('# ')) out.push(<h2 key={idx} className="text-xl font-black text-slate-900 dark:text-white">{inline(line.slice(2))}</h2>);
    else out.push(<p key={idx} className="text-sm text-slate-700 dark:text-slate-300">{inline(line)}</p>);
  });
  flush();
  return <div className="space-y-1.5">{out}</div>;
}
