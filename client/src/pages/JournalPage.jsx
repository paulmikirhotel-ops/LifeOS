import React, { useState, useEffect } from 'react';
import { 
  Search, Plus, Book, Sun, Star, 
  Trash2, Lock, Unlock, Hash, Save,
  ChevronLeft, ChevronRight, MessageSquare
} from 'lucide-react';
import { useApi } from '../hooks/useApi.js';
import api from '../api/client.js';
import { formatApiError } from '../utils/errors.js';
import { useToast } from '../context/ToastContext.jsx';
import { 
  Button, Input, Card, Badge, Spinner, 
  EmptyState, Textarea, Select 
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

  const { data: notes, loading, reload } = useApi(`/journal?type=${activeTab}&search=${search}&tag=${filterTag}`);

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

  const handleDelete = async (id) => {
    if (!confirm('Delete this entry?')) return;
    try {
      await api.delete(`/journal/${id}`);
      addToast('Deleted');
      setSelectedNote(null);
      reload();
    } catch (e) {
      addToast(formatApiError(e), 'error');
    }
  };

  return (
    <div className="flex flex-col lg:flex-row gap-8 h-[calc(100vh-160px)] animate-in fade-in duration-500">
      {/* Sidebar List */}
      <aside className="w-full lg:w-80 flex flex-col gap-4">
        <header className="flex flex-col gap-3">
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl flex-wrap">
            {['journal', 'myday', 'review'].map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setSelectedNote(null); }}
                className={`flex-1 min-w-[60px] px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${activeTab === tab ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
            <input 
              placeholder="Search notes..." 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all dark:text-white"
            />
          </div>
          <Button icon={Plus} size="sm" onClick={handleCreate} className="w-full">New Entry</Button>
        </header>

        <Card className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-10 flex justify-center"><Spinner size="sm" /></div>
          ) : notes?.items?.length > 0 ? (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {notes.items.map(note => (
                <button
                  key={note._id}
                  onClick={() => setSelectedNote(noteToEditor(note))}
                  className={`w-full text-left p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedNote?._id === note._id ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{formatDate(note.entryDate, 'MMM d, yyyy')}</span>
                    {note.isPrivate && <Lock className="w-3 h-3 text-slate-400" />}
                  </div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white truncate mb-1">{note.title || 'Untitled'}</h4>
                  <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                    {note.content?.substring(0, 100) || 'No content...'}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8 text-center">
              <Book className="w-8 h-8 text-slate-200 mb-2" />
              <p className="text-xs text-slate-400">No entries yet</p>
            </div>
          )}
        </Card>
      </aside>

      {/* Main Editor */}
      <main className="flex-1 min-w-0">
        {selectedNote ? (
          <Card className="h-full flex flex-col overflow-hidden">
            <header className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/50 dark:bg-slate-900/50">
              <div className="flex-1 min-w-0">
                <Input 
                  className="w-full !border-none !bg-transparent !p-0 !text-xl !font-bold !shadow-none !ring-0 focus:!ring-0 truncate" 
                  value={selectedNote.title}
                  onChange={(e) => setSelectedNote({ ...selectedNote, title: e.target.value })}
                  placeholder="Note Title"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                <button 
                  onClick={() => setSelectedNote({ ...selectedNote, isPrivate: !selectedNote.isPrivate })}
                  className={`p-2 rounded-lg transition-colors ${selectedNote.isPrivate ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:bg-slate-100'}`}
                >
                  {selectedNote.isPrivate ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                </button>
                <button 
                  onClick={() => handleDelete(selectedNote._id)}
                  className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
                <Button size="sm" icon={Save} onClick={() => handleSave(selectedNote)}>Save</Button>
              </div>
            </header>

            <div className="p-6 flex-1 flex flex-col space-y-4">
              <div className="flex flex-wrap items-center gap-4 text-xs font-medium border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 uppercase tracking-widest text-[10px] font-bold">Date:</span>
                  <input 
                    type="date" 
                    value={String(selectedNote.entryDate || todayStr()).split('T')[0]} 
                    onChange={(e) => setSelectedNote({ ...selectedNote, entryDate: e.target.value })}
                    className="bg-transparent dark:text-white focus:outline-none"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 uppercase tracking-widest text-[10px] font-bold">Mood:</span>
                  <select 
                    value={selectedNote.mood}
                    onChange={(e) => setSelectedNote({ ...selectedNote, mood: e.target.value })}
                    className="bg-transparent dark:text-white focus:outline-none font-bold"
                  >
                    {[
                      { value: 'great', label: 'Excited' },
                      { value: 'good', label: 'Happy' },
                      { value: 'ok', label: 'Neutral' },
                      { value: 'low', label: 'Tired' },
                      { value: 'bad', label: 'Sad' },
                    ].map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Hash className="w-3 h-3 text-slate-400 flex-shrink-0" />
                  <input 
                    placeholder="Tags (comma separated)..." 
                    value={selectedNote.tags?.join(', ') || ''}
                    onChange={(e) => setSelectedNote({ ...selectedNote, tags: e.target.value.split(',').map(t => t.trim()) })}
                    className="bg-transparent dark:text-white focus:outline-none w-full truncate"
                  />
                </div>
              </div>

              {activeTab === 'journal' ? (
                <textarea 
                  className="flex-1 w-full resize-none bg-transparent dark:text-white focus:outline-none leading-relaxed text-sm md:text-base"
                  placeholder="Start writing..."
                  value={selectedNote.content}
                  onChange={(e) => setSelectedNote({ ...selectedNote, content: e.target.value })}
                />
              ) : activeTab === 'myday' ? (
                <div className="flex-1 overflow-y-auto space-y-6 py-2">
                  {['Morning', 'Work', 'Study', 'Personal', 'Evening'].map(section => (
                    <div key={section} className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-indigo-600 flex items-center gap-2">
                        <Sun className="w-3 h-3" /> {section}
                      </h4>
                      <textarea 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                        placeholder={`What happened during ${section.toLowerCase()}?`}
                        value={selectedNote.sections?.[section] || ''}
                        onChange={(e) => setSelectedNote({ 
                          ...selectedNote, 
                          sections: { ...selectedNote.sections, [section]: e.target.value } 
                        })}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex-1 overflow-y-auto space-y-6 py-2">
                  {[
                    { key: 'accomplished', label: 'What did I accomplish today?' },
                    { key: 'notFinished', label: "What didn't I get to?" },
                    { key: 'timeSpent', label: 'How did I spend my time?' },
                    { key: 'distractions', label: 'What were my biggest distractions?' },
                    { key: 'improvement', label: 'How can I improve tomorrow?' }
                  ].map(field => (
                    <div key={field.key} className="space-y-2">
                      <h4 className="text-xs font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2">
                        <Star className="w-3 h-3" /> {field.label}
                      </h4>
                      <textarea 
                        className="w-full bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-xl p-3 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 min-h-[80px]"
                        value={selectedNote.sections?.[field.key] || ''}
                        onChange={(e) => setSelectedNote({ 
                          ...selectedNote, 
                          sections: { ...selectedNote.sections, [field.key]: e.target.value } 
                        })}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl border-dashed">
            <div className="w-20 h-20 rounded-full bg-slate-50 dark:bg-slate-800 flex items-center justify-center mb-6">
              <Book className="w-10 h-10 text-slate-200" />
            </div>
            <h3 className="text-lg font-bold dark:text-white mb-2">Select an entry</h3>
            <p className="text-sm text-slate-500 max-w-xs mb-8">Choose a note from the list or create a new one to start writing.</p>
            <Button icon={Plus} onClick={handleCreate}>Create New Note</Button>
          </div>
        )}
      </main>
    </div>
  );
}
