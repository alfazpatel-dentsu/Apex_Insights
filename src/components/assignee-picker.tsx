'use client';

import { useMemo, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { ActionAssignee, assigneeKey } from '@/lib/assignees';
import { UserProfile } from '@/lib/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export function AssigneePicker({
  users,
  value,
  onChange,
}: {
  users: UserProfile[];
  value: ActionAssignee[];
  onChange: (next: ActionAssignee[]) => void;
}) {
  const [query, setQuery] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [emailDraft, setEmailDraft] = useState('');

  const selectedKeys = useMemo(() => new Set(value.map(assigneeKey)), [value]);

  const registered = useMemo(
    () =>
      users.filter(
        (u) =>
          u.status !== 'Pending' &&
          ((u.email || '').trim() || (u.displayName || '').trim())
      ),
    [users]
  );

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    return registered
      .filter((u) => {
        if (!q) return true;
        return (
          (u.displayName || '').toLowerCase().includes(q) ||
          (u.email || '').toLowerCase().includes(q)
        );
      })
      .filter((u) => {
        const uid = u.uid || u.id;
        if (uid && selectedKeys.has(`uid:${uid}`)) return false;
        if (u.email && selectedKeys.has(`email:${u.email.toLowerCase()}`)) return false;
        return true;
      })
      .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email))
      .slice(0, 8);
  }, [registered, query, selectedKeys]);

  const addRegistered = (user: UserProfile) => {
    const next: ActionAssignee = {
      name: user.displayName || user.email,
      email: (user.email || '').toLowerCase(),
      userId: user.uid || user.id,
    };
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
    onChange(
      value.map((a) => (assigneeKey(a) === key ? { ...a, email } : a))
    );
    setEditingKey(null);
    setEmailDraft('');
  };

  return (
    <div className="space-y-3">
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
        placeholder="Search registered users…"
        className="rounded-none bg-background/50 border-none h-12 shadow-inner px-4 font-bold"
      />

      {matches.length > 0 && (
        <ul className="border border-ink/10 divide-y divide-ink/5 max-h-40 overflow-y-auto bg-white">
          {matches.map((u) => (
            <li key={u.uid || u.id || u.email}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 hover:bg-cream"
                onClick={() => addRegistered(u)}
              >
                <div className="text-xs font-bold">{u.displayName || u.email}</div>
                <div className="text-[10px] font-mono text-secondary">{u.email}</div>
              </button>
            </li>
          ))}
        </ul>
      )}

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
        Registered people include their app email automatically. For anyone not in the app, add a name now and an email whenever you have it — alerts only send when an email is present.
      </p>
    </div>
  );
}
