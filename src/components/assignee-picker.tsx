'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ActionAssignee, assigneeKey } from '@/lib/assignees';
import type { AssigneeOption } from '@/lib/assignee-options';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';

export function AssigneePicker({
  options,
  value,
  onChange,
  loading,
}: {
  options: AssigneeOption[];
  value: ActionAssignee[];
  onChange: (next: ActionAssignee[]) => void;
  loading?: boolean;
}) {
  const [query, setQuery] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');

  const selectedKeys = useMemo(() => new Set(value.map(assigneeKey)), [value]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return options
      .filter((opt) => {
        if (!q) return true;
        return (
          opt.name.toLowerCase().includes(q) ||
          (opt.email || '').toLowerCase().includes(q)
        );
      })
      .filter((opt) => {
        if (opt.userId && selectedKeys.has(`uid:${opt.userId}`)) return false;
        if (opt.email && selectedKeys.has(`email:${opt.email.toLowerCase()}`)) return false;
        return true;
      });
  }, [options, query, selectedKeys]);

  const addOption = (opt: AssigneeOption) => {
    const next: ActionAssignee = {
      name: opt.name || opt.email,
      email: (opt.email || '').toLowerCase(),
    };
    if (opt.userId) next.userId = opt.userId;
    if (value.some((a) => assigneeKey(a) === assigneeKey(next))) return;
    onChange([...value, next]);
    setQuery('');
  };

  const addGuest = () => {
    const name = guestName.trim() || guestEmail.trim().split('@')[0] || '';
    const email = guestEmail.trim().toLowerCase();
    if (!name && !email) return;
    const next: ActionAssignee = { name: name || email, email };
    if (value.some((a) => assigneeKey(a) === assigneeKey(next))) return;
    onChange([...value, next]);
    setGuestName('');
    setGuestEmail('');
  };

  const removeAt = (key: string) => {
    onChange(value.filter((a) => assigneeKey(a) !== key));
    if (editingKey === key) setEditingKey(null);
  };

  const saveEmail = (key: string) => {
    const email = emailDraft.trim().toLowerCase();
    onChange(value.map((a) => (assigneeKey(a) === key ? { ...a, email } : a)));
    setEditingKey(null);
    setEmailDraft('');
  };

  return (
    <div className="relative z-[60] space-y-3">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {value.map((a) => {
            const key = assigneeKey(a);
            const missing = !a.email;
            return (
              <li
                key={key}
                className={cn(
                  'flex flex-col gap-1 border border-ink px-2 py-1.5 bg-white min-w-[140px] max-w-full',
                  missing && 'border-warning'
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold truncate">{a.name || a.email}</span>
                  <button
                    type="button"
                    className="ml-auto text-secondary hover:text-destructive"
                    aria-label={`Remove ${a.name}`}
                    onClick={() => removeAt(key)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                {a.email ? (
                  <span className="text-[10px] font-mono text-secondary truncate">{a.email}</span>
                ) : editingKey === key ? (
                  <div className="flex gap-1">
                    <Input
                      type="email"
                      value={emailDraft}
                      onChange={(e) => setEmailDraft(e.target.value)}
                      placeholder="name@dentsu.com"
                      className="h-8 rounded-none text-[11px]"
                    />
                    <Button type="button" size="sm" className="h-8 rounded-none text-[10px]" onClick={() => saveEmail(key)}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="text-[10px] font-black uppercase tracking-widest text-brand text-left"
                    onClick={() => {
                      setEditingKey(key);
                      setEmailDraft('');
                    }}
                  >
                    Add email later
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <Input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={loading ? 'Loading people…' : 'Search registered users…'}
        className="rounded-none bg-background/50 border-none h-12 shadow-inner px-4 font-bold"
      />

      <div className="border border-ink/10 bg-white">
        <ScrollArea className="h-64">
          <ul className="divide-y divide-ink/5">
            {matches.map((opt) => (
              <li key={`${opt.userId || ''}|${opt.name}|${opt.email}`}>
                <button
                  type="button"
                  className="w-full text-left px-3 py-2 hover:bg-cream"
                  onClick={() => addOption(opt)}
                >
                  <div className="text-xs font-bold">{opt.name || opt.email}</div>
                  <div className="text-[10px] font-mono text-secondary">{opt.email}</div>
                </button>
              </li>
            ))}
            {matches.length === 0 ? (
              <li className="px-3 py-6 text-center text-[10px] font-bold uppercase tracking-widest text-secondary">
                {loading ? 'Loading people…' : 'No matching people'}
              </li>
            ) : null}
          </ul>
        </ScrollArea>
        <p className="px-3 py-2 text-[10px] font-mono text-secondary border-t border-ink/10">
          {options.length} registered {options.length === 1 ? 'user' : 'users'} · click to add
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2">
        <Input
          value={guestName}
          onChange={(e) => setGuestName(e.target.value)}
          placeholder="Name (not in app)"
          className="rounded-none h-10 text-xs"
        />
        <Input
          type="email"
          value={guestEmail}
          onChange={(e) => setGuestEmail(e.target.value)}
          placeholder="Email (optional now)"
          className="rounded-none h-10 text-xs"
        />
        <Button type="button" variant="outline" className="h-10 rounded-none text-[10px] font-black uppercase" onClick={addGuest}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>
      <p className="text-[10px] text-secondary leading-relaxed">
        The list is registered app users only (invite sent or signed in). For anyone outside the app, add a name here and an email when you have it.
      </p>
    </div>
  );
}
