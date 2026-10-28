import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Book, Sun, Star, 
  Trash2, Lock, Unlock, Hash, Save, ArrowLeft
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import {
  Button, Card, ErrorState, SkeletonList, IconButton, ConfirmDialog
} from '../components/ui.jsx';
import { formatDate, todayStr } from '../utils/format.js';

// The API stores sections as [{ key, text }]; the editor uses { key: text }.
const toSectionsObject = (arr) => {
  const out = {};
  (arr || []).forEach((s) => { if (s && s.key) out[s.key] = s.text || ''; });
  return out;
};
const toSectionsArray = (obj) => {
  if (!obj || Array.isArray(obj)) return obj || undefined;
  return Object.entries(obj)
    .map(([key, text]) => ({ key, text: text || '' }))
    .filter((s) => s.text && s.text.trim());
};
const noteToEditor = (note) => ({
  ...note,
  mood: note.mood || 'ok',
  sections: toSectionsObject(note.sections),
});

export default function JournalPage() {
  const [activeTab, setActiveTab] = useState('journal'); // journal, myday, review
  const [selectedNote, setSelectedNote] = useState(null);
  const [search, setSearch] = useState('');
  const [filterTag, setFilterTag] = useState('');
  const [date, setDate] = useState(todayStr());
  const { addToast } = useToast();
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const { data: notes, loading, error, reload } = useApi(`/journal?type=${activeTab}&search=${search}&tag=${filterTag}`);

  useEffect(() => {
    if (notes?.items?.length > 0 && !selectedNote) {
      // setSelectedNote(notes.items[0]);
    }
  }, [notes, selectedNote]);

  const handleCreate = async () => {
    try {
      const res = await api.post('/journal', {
        title: 'New Note',
        content: '',
        type: activeTab,
        entryDate: todayStr(),
        isPrivate: true
      });
      if (res.success) {
        reload();
        setSelectedNote(noteToEditor(res.data));
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleSave = async (updatedNote) => {
    try {
      const payload = { ...updatedNote, sections: toSectionsArray(updatedNote.sections) };
      const res = await api.patch(`/journal/${updatedNote._id}`, payload);
      if (res.success) {
        addToast('Saved');
        reload();
      }
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/journal/${toDelete}`);
      addToast('Deleted');
      setSelectedNote(null);
      setToDelete(null);
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const TABS = [{ id: 'journal', label: 'Journal' }, { id: 'myday', label: 'My Day' }, { id: 'review', label: 'Review' }];
  const noteItems = Array.isArray(notes?.items) ? notes.items : [];
  const areaCls = 'w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl p-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 min-h-[96px]';

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 lg:h-[calc(100dvh-8.5rem)]">
      {/* Entry list: on phones it is replaced by the editor once a note is open */}
      <aside className={`w-full lg:w-80 flex-shrink-0 flex-col gap-4 min-h-0 ${selectedNote ? 'hidden lg:flex' : 'flex'}`} aria-label="Entries">
        <header className="flex flex-col gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-white lg:sr-only">Journal</h1>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl" role="tablist" aria-label="Entry type">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                role="tab"
                aria-selected={activeTab === tab.id}
                onClick={() => { setActiveTab(tab.id); setSelectedNote(null); }}
                className={`flex-1 min-h-9 px-3 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/60 ${activeTab === tab.id ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" aria-hidden="true" />
            <input
              type="search"
              aria-label="Search notes"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ui-radius-control w-full pl-10 pr-4 min-h-11 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30 transition-colors text-slate-900 dark:text-white"
            />
          </div>
          <Button icon={Plus} onClick={handleCreate} className="w-full">New Entry</Button>
        </header>

        <Card className="flex-1 overflow-y-auto min-h-48">
          {loading && !notes ? (
            <div className="p-3"><SkeletonList rows={4} /></div>
          ) : error && !notes ? (
            <ErrorState compact title="Entries couldn't load" description="Please try again." details={error} onRetry={reload} />
          ) : noteItems.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {noteItems.map((note) => (
                <li key={note._id}>
                  <button
                    onClick={() => setSelectedNote(noteToEditor(note))}
                    aria-current={selectedNote?._id === note._id}
                    className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors focus-visible:outline-none focus-visible:bg-slate-50 dark:focus-visible:bg-slate-800/60 ${selectedNote?._id === note._id ? 'bg-indigo-50/60 dark:bg-indigo-500/10' : ''}`}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{formatDate(note.entryDate, 'MMM d, yyyy')}</span>
                      {note.isPrivate && <Lock className="w-3 h-3 text-slate-400" aria-label="Private" />}
                    </div>
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white truncate mb-1">{note.title || 'Untitled'}</h2>
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">{note.content?.substring(0, 100) || 'No content...'}</p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <Book className="w-8 h-8 text-slate-300 mb-2" aria-hidden="true" />
              <p className="text-sm text-slate-500">No entries yet</p>
            </div>
          )}
        </Card>
      </aside>

      {/* Editor */}
      <section className={`flex-1 min-w-0 min-h-0 ${selectedNote ? 'block' : 'hidden lg:block'}`} aria-label="Editor">
        {selectedNote ? (
          <Card className="lg:h-full flex flex-col overflow-hidden">
            <header className="p-3 sm:p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/60 dark:bg-slate-900/50">
              <div className="flex items-center gap-1 flex-1 min-w-0">
                <IconButton icon={ArrowLeft} label="Back to entries" className="lg:hidden flex-shrink-0 !text-slate-500" onClick={() => setSelectedNote(null)} />
                <input
                  aria-label="Note title"
                  className="w-full min-w-0 bg-transparent text-xl font-bold text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none truncate"
                  value={selectedNote.title}
                  onChange={(e) => setSelectedNote({ ...selectedNote, title: e.target.value })}
                  placeholder="Note Title"
                />
              </div>
              <div className="flex items-center gap-1 sm:gap-2">
                <IconButton
                  icon={selectedNote.isPrivate ? Lock : Unlock}
                  label={selectedNote.isPrivate ? 'Private. Click to make shareable' : 'Not private. Click to make private'}
                  aria-pressed={!!selectedNote.isPrivate}
                  className={selectedNote.isPrivate ? '!text-indigo-600 bg-indigo-50 dark:bg-indigo-500/10' : ''}
                  onClick={() => setSelectedNote({ ...selectedNote, isPrivate: !selectedNote.isPrivate })}
                />
                <IconButton icon={Trash2} tone="danger" label="Delete entry" onClick={() => setToDelete(selectedNote._id)} />
                <Button size="sm" icon={Save} onClick={() => handleSave(selectedNote)} className="ml-auto sm:ml-0">Save</Button>
              </div>
            </header>

            <div className="p-4 sm:p-6 flex-1 flex flex-col gap-4 min-h-0">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-3 text-xs font-medium border-b border-slate-100 dark:border-slate-800 pb-4">
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Date</span>
                  <input
                    type="date"
                    value={String(selectedNote.entryDate || todayStr()).split('T')[0]}
                    onChange={(e) => setSelectedNote({ ...selectedNote, entryDate: e.target.value })}
                    className="bg-transparent text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded min-h-8"
                  />
                </label>
                <label className="flex items-center gap-2">
                  <span className="text-slate-400 uppercase tracking-wider text-[10px] font-bold">Mood</span>
                  <select
                    value={selectedNote.mood}
                    onChange={(e) => setSelectedNote({ ...selectedNote, mood: e.target.value })}
                    className="bg-transparent text-slate-900 dark:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/50 rounded font-bold min-h-8"
                  >
                    {[
                      { value: 'great', label: 'Excited' },
                      { value: 'good', label: 'Happy' },
                      { value: 'ok', label: 'Neutral' },
                      { value: 'low', label: 'Tired' },
                      { value: 'bad', label: 'Sad' },
                    ].map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-2 flex-1 min-w-[10rem]">
                  <Hash className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" aria-hidden="true" />
                  <input
                    aria-label="Tags, comma separated"
                    placeholder="Tags (comma separated)..."
                    value={selectedNote.tags?.join(', ') || ''}
                    onChange={(e) => setSelectedNote({ ...selectedNote, tags: e.target.value.split(',').map((t) => t.trim()) })}
                    className="bg-transparent text-slate-900 dark:text-white focus:outline-none w-full truncate min-h-8"
                  />
                </label>
              </div>

              {activeTab === 'journal' ? (
                <textarea
                  aria-label="Entry"
                  className="flex-1 w-full min-h-[50dvh] lg:min-h-0 resize-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none leading-relaxed text-base"
                  placeholder="Start writing..."
                  value={selectedNote.content}
                  onChange={(e) => setSelectedNote({ ...selectedNote, content: e.target.value })}
                />
              ) : activeTab === 'myday' ? (
                <div className="flex-1 lg:overflow-y-auto space-y-5 py-1">
                  {['Morning', 'Work', 'Study', 'Personal', 'Evening'].map((section) => (
                    <div key={section} className="space-y-2">
                      <label htmlFor={`sec-${section}`} className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 flex items-center gap-2">
                        <Sun className="w-3.5 h-3.5" aria-hidden="true" /> {section}
                      </label>
                      <textarea
                        id={`sec-${section}`}
                        className={areaCls}
                        placeholder={`What happened during ${section.toLowerCase()}?`}
                        value={selectedNote.sections?.[section] || ''}
                        onChange={(e) => setSelectedNote({ ...selectedNote, sections: { ...selectedNote.sections, [section]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 lg:overflow-y-auto space-y-5 py-1">
                  {[
                    { key: 'accomplished', label: 'What did I accomplish today?' },
                    { key: 'notFinished', label: "What didn't I get to?" },
                    { key: 'timeSpent', label: 'How did I spend my time?' },
                    { key: 'distractions', label: 'What were my biggest distractions?' },
                    { key: 'improvement', label: 'How can I improve tomorrow?' },
                  ].map((field) => (
                    <div key={field.key} className="space-y-2">
                      <label htmlFor={`rev-${field.key}`} className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                        <Star className="w-3.5 h-3.5" aria-hidden="true" /> {field.label}
                      </label>
                      <textarea
                        id={`rev-${field.key}`}
                        className={areaCls}
                        value={selectedNote.sections?.[field.key] || ''}
                        onChange={(e) => setSelectedNote({ ...selectedNote, sections: { ...selectedNote.sections, [field.key]: e.target.value } })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="h-full min-h-72 flex flex-col items-center justify-center text-center p-8 sm:p-12 bg-white dark:bg-slate-900 border border-dashed border-slate-300 dark:border-slate-700 rounded-3xl">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-50 to-fuchsia-50 dark:from-indigo-500/10 dark:to-fuchsia-500/10 flex items-center justify-center mb-5">
              <Book className="w-8 h-8 text-indigo-400" aria-hidden="true" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Select an entry</h2>
            <p className="text-sm text-slate-500 max-w-xs mb-6">Choose a note from the list or create a new one to start writing.</p>
            <Button icon={Plus} onClick={handleCreate}>Create New Note</Button>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={!!toDelete}
        title="Delete this entry?"
        description="This entry will be removed. This can't be undone."
        confirmLabel="Delete entry"
        danger
        busy={deleting}
        onConfirm={handleDelete}
        onClose={() => !deleting && setToDelete(null)}
      />
    </div>
  );
}
