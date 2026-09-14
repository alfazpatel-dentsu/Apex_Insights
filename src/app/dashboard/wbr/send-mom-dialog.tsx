'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Loader2, Mail, FileText, FileDown, Copy, Send } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCollection, useDoc, useFirestore, useUser } from '@/firebase';
import {
  assembleMomReport,
  buildMomHtml,
  copyMomHtml,
  downloadMomHtml,
  downloadMomEml,
  exportMomPdf,
  momPlainText,
  PUBLIC_APP_ORIGIN,
  MOM_SECTIONS,
  defaultMomSections,
  type MomReportData,
  type MomSectionId,
} from '@/lib/mom-report';
import { enqueueMailJob } from '@/lib/mail-jobs';
import { UserProfile } from '@/lib/types';

export function SendMomDialog({
  open,
  onOpenChange,
  wbrDate,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wbrDate: Date;
}) {
  const firestore = useFirestore();
  const { data: users } = useCollection<UserProfile>('users');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<'html' | 'pdf' | 'copy' | 'send' | 'graph' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<MomReportData | null>(null);
  const [guestEmail, setGuestEmail] = useState('');
  const [selectedEmails, setSelectedEmails] = useState<string[]>([]);
  const [sections, setSections] = useState<Record<MomSectionId, boolean>>(defaultMomSections());

  const wbrKey = format(wbrDate, 'yyyy-MM-dd');

  const registered = useMemo(
    () =>
      (users || [])
        .filter((u) => u.status !== 'Pending' && (u.email || '').includes('@'))
        .sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email)),
    [users]
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);

    assembleMomReport(firestore, wbrDate)
      .then((report) => {
        if (cancelled) return;
        setData(report);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : 'Failed to assemble MoM.';
        setError(message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, firestore, wbrKey]);

  const html = useMemo(() => (data ? buildMomHtml(data, sections) : ''), [data, sections]);

  const subject = useMemo(
    () => `Weekly Business Review : ${format(wbrDate, 'do MMM yyyy')}-MoM`,
    [wbrDate]
  );

  const toggleEmail = (email: string, on: boolean) => {
    const needle = email.trim().toLowerCase();
    setSelectedEmails((prev) => {
      const set = new Set(prev);
      if (on) set.add(needle);
      else set.delete(needle);
      return [...set];
    });
  };

  const addGuest = () => {
    const email = guestEmail.trim().toLowerCase();
    if (!email.includes('@')) return;
    toggleEmail(email, true);
    setGuestEmail('');
  };

  const run = async (kind: typeof busy, fn: () => Promise<void> | void) => {
    if (!html || !data) return;
    setBusy(kind);
    try {
      await fn();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Action failed.';
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl w-[calc(100vw-2rem)] max-h-[90vh] overflow-hidden grid-rows-[auto_1fr_auto] p-0 gap-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b border-ink pr-12">
          <DialogTitle className="uppercase tracking-tight">Send meeting MoM</DialogTitle>
          <DialogDescription>
            Choose sections and recipients. Unchecked sections are omitted from the HTML. Mail is sent from aztec_alerts@dentsu.com. Dashboard links always point to {PUBLIC_APP_ORIGIN}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid md:grid-cols-[280px_1fr] min-h-0">
          <ScrollArea className="h-[58vh] border-b md:border-b-0 md:border-r border-ink">
            <div className="p-5 space-y-6">
              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-secondary">
                  Sections to include
                </Label>
                <ul className="space-y-2">
                  {MOM_SECTIONS.map((section) => (
                    <li key={section.id}>
                      <label className="flex items-start gap-2 cursor-pointer">
                        <Checkbox
                          className="mt-0.5"
                          checked={sections[section.id] !== false}
                          onCheckedChange={(v) =>
                            setSections((prev) => ({ ...prev, [section.id]: v === true }))
                          }
                        />
                        <span>
                          <span className="block text-xs font-bold">{section.label}</span>
                          <span className="block text-[10px] text-secondary leading-snug">{section.hint}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="space-y-2">
                <Label className="text-[10px] font-black uppercase tracking-widest text-secondary">
                  Recipients
                </Label>
                <ul className="max-h-48 overflow-y-auto border border-ink/10 divide-y divide-ink/5">
                  {registered.map((u) => {
                    const email = (u.email || '').toLowerCase();
                    return (
                      <li key={u.uid || u.id || email} className="flex items-center gap-2 px-2 py-1.5">
                        <Checkbox
                          checked={selectedEmails.includes(email)}
                          onCheckedChange={(v) => toggleEmail(email, v === true)}
                        />
                        <span className="min-w-0">
                          <span className="block text-[11px] font-bold truncate">{u.displayName || email}</span>
                          <span className="block text-[10px] font-mono text-secondary truncate">{email}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
                {selectedEmails
                  .filter((e) => !registered.some((u) => (u.email || '').toLowerCase() === e))
                  .map((email) => (
                    <label key={email} className="flex items-center gap-2 text-[11px]">
                      <Checkbox checked onCheckedChange={(v) => toggleEmail(email, v === true)} />
                      <span className="font-mono">{email}</span>
                    </label>
                  ))}
                <div className="flex gap-2">
                  <Input
                    type="email"
                    placeholder="Add another email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    className="h-10 text-xs"
                  />
                  <Button type="button" variant="outline" className="h-10 rounded-none text-[10px] font-black uppercase" onClick={addGuest}>
                    Add
                  </Button>
                </div>
                <p className="text-[10px] text-secondary">{selectedEmails.length} selected</p>
              </div>

              {data && (
                <div className="space-y-1 text-[11px] font-medium text-secondary">
                  <p>{data.riskClients.length} Amber/Red accounts</p>
                  <p>{data.closedActions.length} actions closed this cycle</p>
                  <p>{data.updatedActions.length} actions updated this cycle</p>
                </div>
              )}
            </div>
          </ScrollArea>

          <div className="min-h-0 bg-cream/40">
            {loading ? (
              <div className="flex flex-col items-center justify-center gap-3 py-24">
                <Loader2 className="h-8 w-8 animate-spin text-brand" />
                <span className="text-[10px] font-black uppercase tracking-widest text-secondary">
                  Assembling MoM…
                </span>
              </div>
            ) : error ? (
              <div className="p-8 text-sm text-destructive">{error}</div>
            ) : (
              <ScrollArea className="h-[58vh]">
                <iframe
                  title="Weekly MoM preview"
                  className="w-full min-h-[58vh] bg-white border-0"
                  sandbox=""
                  srcDoc={html}
                />
              </ScrollArea>
            )}
          </div>
        </div>

        <DialogFooter className="px-6 py-4 border-t border-ink gap-2 sm:justify-between flex-wrap">
          <p className="text-[10px] uppercase tracking-widest text-secondary font-bold mr-auto">
            Send uses Graph from aztec_alerts@dentsu.com · Outlook download remains available
          </p>
          <Button
            variant="outline"
            disabled={!html || !!busy}
            onClick={() =>
              run('copy', async () => {
                await copyMomHtml(html, momPlainText(data!));
                toast.success('HTML copied — paste into the Outlook message body');
              })
            }
          >
            {busy === 'copy' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Copy className="h-4 w-4 mr-2" />}
            Copy HTML
          </Button>
          <Button
            variant="outline"
            disabled={!html || !!busy}
            onClick={() =>
              run('html', () => {
                downloadMomHtml(html, data!.wbrDate);
                toast.success('HTML downloaded');
              })
            }
          >
            {busy === 'html' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileDown className="h-4 w-4 mr-2" />}
            Download HTML
          </Button>
          <Button
            variant="outline"
            disabled={!html || !!busy}
            onClick={() =>
              run('pdf', async () => {
                await exportMomPdf(html, data!.wbrDate);
                toast.success('PDF downloaded');
              })
            }
          >
            {busy === 'pdf' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button
            variant="outline"
            disabled={!html || !!busy}
            onClick={() =>
              run('send', () => {
                downloadMomEml(html, data!.wbrDate, subject, selectedEmails.join(', '));
                toast.success('Outlook draft downloaded — open the .eml file to send');
              })
            }
          >
            {busy === 'send' ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Outlook draft
          </Button>
          <Button
            className="bg-brand text-white hover:bg-ink"
            disabled={!html || !!busy || selectedEmails.length === 0}
            onClick={() =>
              run('graph', async () => {
                const result = await enqueueMailJob(
                  firestore,
                  {
                    type: 'mom',
                    emails: selectedEmails,
                    subject,
                    html,
                    text: momPlainText(data!),
                  },
                  undefined,
                  { wait: true }
                );
                toast.success(
                  result.status === 'sent'
                    ? `MoM sent to ${selectedEmails.length} recipient${selectedEmails.length === 1 ? '' : 's'}`
                    : `Queued (${result.status}). Check inboxes in a minute.`
                );
              })
            }
          >
            {busy === 'graph' ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Mail className="h-4 w-4 mr-2" />}
            Send email
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SendMomButton({ wbrDate }: { wbrDate: Date }) {
  const { user } = useUser();
  const { data: profile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);
  const [open, setOpen] = useState(false);
  if (profile?.role !== 'Admin') return null;
  return (
    <>
      <Button
        className="h-14 px-6 rounded-3xl bg-brand text-white hover:bg-ink gap-2 font-bold shadow-lg"
        onClick={() => setOpen(true)}
      >
        <Mail className="h-5 w-5" />
        Send MoM
      </Button>
      <SendMomDialog open={open} onOpenChange={setOpen} wbrDate={wbrDate} />
    </>
  );
}
