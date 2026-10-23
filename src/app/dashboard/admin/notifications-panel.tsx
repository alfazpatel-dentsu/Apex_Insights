'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CircleNotch,
  EnvelopeSimple,
  Lightning,
  PaperPlaneTilt,
  UsersThree,
  Eye,
} from '@phosphor-icons/react';
import { addDoc, collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useCollection, useDoc, useFirestore, useUser } from '@/firebase';
import {
  DEFAULT_CC_ENABLED,
  DEFAULT_EMAIL_AUTOMATIONS,
  EMAIL_AUTOMATION_KEYS,
  EMAIL_AUTOMATION_META,
  EMAIL_AUTOMATIONS_DOC,
  EmailAutomationKey,
  EmailAutomationSettings,
  ProductAnnouncement,
} from '@/lib/email-automations';
import { sampleEmailFor } from '@/lib/email-previews';
import { enqueueMailJob } from '@/lib/mail-jobs';
import { UserProfile } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const INITIAL_PRODUCT_UPDATE_KEY = 'recent-product-updates-2026-10';
const INITIAL_PRODUCT_UPDATE_TITLE = 'Three recent improvements';
const INITIAL_PRODUCT_UPDATE_BODY = [
  'OTP-based user authentication: Sign in with a one-time email code for added account verification.',
  'Guided Tour: Explore key areas and workflows in the Control Center with an interactive walkthrough.',
  'Dark Mode Support: Switch between light and dark themes from the dashboard header; your choice is remembered.',
].join('\n\n');

function mergeSettings(remote?: EmailAutomationSettings | null): EmailAutomationSettings {
  const defaultCcEmails = Array.isArray(remote?.defaultCcEmails)
    ? remote.defaultCcEmails.filter((email): email is string => typeof email === 'string')
    : [];

  return {
    ...DEFAULT_EMAIL_AUTOMATIONS,
    ...(remote || {}),
    enabled: {
      ...DEFAULT_EMAIL_AUTOMATIONS.enabled,
      ...(remote?.enabled || {}),
    },
    ccEnabled: {
      ...DEFAULT_CC_ENABLED,
      ...(remote?.ccEnabled || {}),
    },
    defaultCcEmails,
  };
}

export function NotificationsPanel() {
  const firestore = useFirestore();
  const { toast } = useToast();
  const { user } = useUser();
  const { data: remoteSettings, loading: settingsLoading } = useDoc<EmailAutomationSettings>(
    EMAIL_AUTOMATIONS_DOC
  );
  const { data: users, loading: usersLoading } = useCollection<UserProfile>('users');
  const { data: announcements, loading: announcementsLoading } =
    useCollection<ProductAnnouncement>('productAnnouncements');

  const [draft, setDraft] = useState<EmailAutomationSettings>(DEFAULT_EMAIL_AUTOMATIONS);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [previewKey, setPreviewKey] = useState<EmailAutomationKey>('taskAssigned');
  const [guestCc, setGuestCc] = useState('');
  const [announcementTitle, setAnnouncementTitle] = useState(INITIAL_PRODUCT_UPDATE_TITLE);
  const [announcementBody, setAnnouncementBody] = useState(INITIAL_PRODUCT_UPDATE_BODY);
  const [announcementHref, setAnnouncementHref] = useState('/dashboard');
  const [publishingAnnouncement, setPublishingAnnouncement] = useState(false);

  useEffect(() => {
    if (settingsLoading) return;
    setDraft(mergeSettings(remoteSettings));
    setHydrated(true);
  }, [remoteSettings, settingsLoading]);

  const registeredUsers = useMemo(
    () =>
      (users || [])
        .filter((u) => u.status !== 'Pending' && typeof u.email === 'string' && u.email.includes('@'))
        .sort((a, b) =>
          (typeof a.displayName === 'string' ? a.displayName : a.email).localeCompare(
            typeof b.displayName === 'string' ? b.displayName : b.email
          )
        ),
    [users]
  );
  const activeUserCount = new Set(
    registeredUsers
      .filter(
        (registeredUser) =>
          ['Active', 'Invite sent', 'User Registered'].includes(String(registeredUser.status)) &&
          /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(registeredUser.email)
      )
      .map((registeredUser) => registeredUser.email.trim().toLowerCase())
  ).size;
  const hasInitialAnnouncement = (announcements || []).some(
    (announcement) => announcement.key === INITIAL_PRODUCT_UPDATE_KEY
  );

  const handlePublishAnnouncement = async () => {
    if (!user) return;
    const title = announcementTitle.trim();
    const body = announcementBody.trim();
    const href = announcementHref.trim();
    if (!title || title.length > 120 || !body || body.length > 4000) {
      toast({
        variant: 'destructive',
        title: 'Announcement needs attention',
        description: 'Add a title (up to 120 characters) and message (up to 4,000 characters).',
      });
      return;
    }
    if (!href.startsWith('/') || href.startsWith('//')) {
      toast({
        variant: 'destructive',
        title: 'Invalid destination',
        description: 'Use an in-app path such as /dashboard.',
      });
      return;
    }
    const isInitialAnnouncement =
      title === INITIAL_PRODUCT_UPDATE_TITLE && body === INITIAL_PRODUCT_UPDATE_BODY;
    if (isInitialAnnouncement && hasInitialAnnouncement) {
      toast({
        variant: 'destructive',
        title: 'Already published',
        description: 'These recent improvements have already been announced.',
      });
      return;
    }

    setPublishingAnnouncement(true);
    try {
      await addDoc(collection(firestore, 'productAnnouncements'), {
        title,
        body,
        href,
        ...(isInitialAnnouncement ? { key: INITIAL_PRODUCT_UPDATE_KEY } : {}),
        createdBy: user.uid,
        createdAt: serverTimestamp(),
      });
      setAnnouncementTitle('');
      setAnnouncementBody('');
      setAnnouncementHref('/dashboard');
      toast({
        title: 'Announcement published',
        description: `Queued for ${activeUserCount} approved users by email and in-app notification.`,
      });
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Announcement failed',
        description: error instanceof Error ? error.message : 'Could not publish this announcement.',
      });
    } finally {
      setPublishingAnnouncement(false);
    }
  };

  const dirty = useMemo(() => {
    if (!hydrated) return false;
    const baseline = mergeSettings(remoteSettings);
    return JSON.stringify({
      enabled: baseline.enabled,
      ccEnabled: baseline.ccEnabled,
      defaultCcEmails: [...(baseline.defaultCcEmails || [])].sort(),
      teamsWebhookUrl: baseline.teamsWebhookUrl || '',
    }) !== JSON.stringify({
      enabled: draft.enabled,
      ccEnabled: draft.ccEnabled,
      defaultCcEmails: [...(draft.defaultCcEmails || [])].sort(),
      teamsWebhookUrl: draft.teamsWebhookUrl || '',
    });
  }, [draft, hydrated, remoteSettings]);

  const toggle = (key: EmailAutomationKey, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [key]: value },
    }));
  };

  const toggleCc = (key: EmailAutomationKey, value: boolean) => {
    if (!EMAIL_AUTOMATION_META[key].allowsCc) return;
    setDraft((prev) => ({
      ...prev,
      ccEnabled: { ...prev.ccEnabled, [key]: value },
    }));
  };

  const toggleDefaultCc = (email: string, on: boolean) => {
    const needle = email.trim().toLowerCase();
    setDraft((prev) => {
      const current = new Set((prev.defaultCcEmails || []).map((e) => e.toLowerCase()));
      if (on) current.add(needle);
      else current.delete(needle);
      return { ...prev, defaultCcEmails: [...current] };
    });
  };

  const addGuestCc = () => {
    const email = guestCc.trim().toLowerCase();
    if (!email.includes('@')) return;
    toggleDefaultCc(email, true);
    setGuestCc('');
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: EmailAutomationSettings = {
        fromEmail: draft.fromEmail || DEFAULT_EMAIL_AUTOMATIONS.fromEmail,
        fromName: draft.fromName || DEFAULT_EMAIL_AUTOMATIONS.fromName,
        appBaseUrl: draft.appBaseUrl || DEFAULT_EMAIL_AUTOMATIONS.appBaseUrl,
        teamsWebhookUrl: (draft.teamsWebhookUrl || '').trim(),
        defaultCcEmails: [...new Set((draft.defaultCcEmails || []).map((e) => e.toLowerCase()))],
        ccEnabled: { ...DEFAULT_CC_ENABLED, ...(draft.ccEnabled || {}) },
        enabled: draft.enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      await setDoc(doc(firestore, 'settings', 'emailAutomations'), payload, { merge: true });
      toast({
        title: 'Notifications saved',
        description: 'Toggles, default CC, and previews now match what Cloud Functions will send.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error?.message || 'Could not update notification settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    const to = (user?.email || '').trim();
    if (!to) {
      toast({
        variant: 'destructive',
        title: 'Test email failed',
        description: 'No email on the signed-in account.',
      });
      return;
    }
    setTesting(true);
    try {
      const result = await enqueueMailJob(firestore, 'test', to, { wait: true });
      toast({
        title: result.status === 'sent' ? 'Test email sent' : 'Test email queued',
        description:
          result.status === 'sent'
            ? `Sent from aztec_alerts@dentsu.com to ${to}. Check inbox/spam and the header bell.`
            : `Status: ${result.status}. Check inbox in a minute, or Firebase logs for onMailJobCreated.`,
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Test email failed',
        description: error?.message || 'Could not queue the test email.',
      });
    } finally {
      setTesting(false);
    }
  };

  const preview = useMemo(() => sampleEmailFor(previewKey), [previewKey]);
  const selectedCc = new Set(
    (Array.isArray(draft.defaultCcEmails) ? draft.defaultCcEmails : [])
      .filter((email): email is string => typeof email === 'string')
      .map((email) => email.toLowerCase())
  );

  if (settingsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-4">
        <CircleNotch className="h-8 w-8 animate-spin text-primary/40" />
        <span className="text-xs font-black uppercase tracking-widest text-secondary">
          Loading notifications…
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <section className="border border-ink bg-surface">
        <div className="border-b border-ink px-6 py-4 flex items-center gap-2">
          <PaperPlaneTilt className="h-5 w-5 text-brand" />
          <div>
            <h2 className="font-headline text-lg font-black uppercase tracking-tighter">
              Product announcements
            </h2>
            <p className="text-[11px] text-secondary">
              {usersLoading
                ? 'Loading active user audience…'
                : `Publish to ${activeUserCount} approved users by individual email and the header notification bell.`}
            </p>
          </div>
        </div>
        <div className="p-6 space-y-4">
          {!announcementsLoading && hasInitialAnnouncement && (
            <p className="border border-success/30 bg-success/5 p-3 text-xs font-bold text-success">
              The recent improvements digest has already been published.
            </p>
          )}
          <div className="space-y-2">
            <Label htmlFor="announcement-title" className="text-[10px] font-black uppercase tracking-widest text-secondary">
              Title
            </Label>
            <Input
              id="announcement-title"
              value={announcementTitle}
              maxLength={120}
              onChange={(event) => setAnnouncementTitle(event.target.value)}
              placeholder="What’s new in the Control Center?"
              className="rounded-none"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="announcement-body" className="text-[10px] font-black uppercase tracking-widest text-secondary">
              Update
            </Label>
            <Textarea
              id="announcement-body"
              value={announcementBody}
              maxLength={4000}
              onChange={(event) => setAnnouncementBody(event.target.value)}
              placeholder="Describe the new functionality."
              className="min-h-36 rounded-none"
            />
            <p className="text-right text-[10px] font-mono text-secondary">
              {announcementBody.length}/4000
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex-1 space-y-2">
              <Label htmlFor="announcement-href" className="text-[10px] font-black uppercase tracking-widest text-secondary">
                In-app destination
              </Label>
              <Input
                id="announcement-href"
                value={announcementHref}
                onChange={(event) => setAnnouncementHref(event.target.value)}
                placeholder="/dashboard"
                className="rounded-none"
              />
            </div>
            <Button
              type="button"
              onClick={handlePublishAnnouncement}
              disabled={
                publishingAnnouncement ||
                usersLoading ||
                announcementsLoading ||
                !announcementTitle.trim() ||
                !announcementBody.trim()
              }
              className="h-10 rounded-none gap-2 font-black uppercase tracking-widest text-[10px]"
            >
              {publishingAnnouncement ? <CircleNotch className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
              {publishingAnnouncement ? 'Publishing…' : 'Publish to all users'}
            </Button>
          </div>
          {(announcements || []).length > 0 && (
            <div className="border-t border-ink/10 pt-4 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-secondary">Published updates</p>
              <ul className="space-y-2">
                {[...(announcements || [])]
                  .sort((a, b) => {
                    const timestamp = (value: ProductAnnouncement['createdAt']) =>
                      typeof value === 'string' ? Date.parse(value) : (value?.seconds || 0) * 1000;
                    return timestamp(b.createdAt) - timestamp(a.createdAt);
                  })
                  .slice(0, 5)
                  .map((announcement) => (
                    <li key={announcement.id} className="border-l-2 border-brand pl-3">
                      <p className="text-xs font-bold">{announcement.title}</p>
                      <p className="text-[10px] font-mono text-secondary">
                        {announcement.createdAt && typeof announcement.createdAt !== 'string'
                          ? new Date(announcement.createdAt.seconds * 1000).toLocaleDateString()
                          : 'Recently published'}
                      </p>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          variant="outline"
          className="rounded-none h-11 px-5 font-black uppercase tracking-widest text-[10px] gap-2"
          onClick={handleTestEmail}
          disabled={testing}
        >
          {testing ? <CircleNotch className="h-4 w-4 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4" />}
          {testing ? 'Sending…' : 'Send test email'}
        </Button>
        <Button
          className="rounded-none h-11 px-5 font-black uppercase tracking-widest text-[10px] gap-2"
          onClick={handleSave}
          disabled={saving || !dirty}
        >
          {saving ? <CircleNotch className="h-4 w-4 animate-spin" /> : <Lightning className="h-4 w-4" />}
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="border border-ink bg-white">
          <div className="border-b border-ink px-6 py-4 flex items-center gap-2">
            <EnvelopeSimple className="h-5 w-5 text-brand" weight="fill" />
            <h2 className="font-headline text-lg font-black uppercase tracking-tighter">
              Email automations
            </h2>
          </div>
          <ul className="divide-y divide-ink/10">
            {EMAIL_AUTOMATION_KEYS.map((key) => {
              const meta = EMAIL_AUTOMATION_META[key];
              const enabled = draft.enabled[key] !== false;
              const ccOn = meta.allowsCc && (draft.ccEnabled?.[key] ?? DEFAULT_CC_ENABLED[key]) !== false;
              return (
                <li key={key} className="px-6 py-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-sm font-black uppercase tracking-wide">{meta.title}</h3>
                        <span
                          className={cn(
                            'text-[9px] font-black uppercase tracking-widest px-2 py-0.5 border',
                            enabled
                              ? 'border-success/40 text-success bg-success/5'
                              : 'border-ink/20 text-secondary bg-cream'
                          )}
                        >
                          {enabled ? 'On' : 'Off'}
                        </span>
                      </div>
                      <p className="text-sm text-secondary leading-relaxed">{meta.description}</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-secondary/80">
                        To: {meta.recipients}
                      </p>
                    </div>
                    <Switch
                      checked={enabled}
                      onCheckedChange={(v) => toggle(key, v)}
                      aria-label={`Toggle ${meta.title}`}
                    />
                  </div>
                  {meta.allowsCc ? (
                    <label className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-widest text-secondary">
                      <Checkbox
                        checked={ccOn}
                        onCheckedChange={(v) => toggleCc(key, v === true)}
                      />
                      Include default CC list
                    </label>
                  ) : (
                    <p className="text-[11px] text-secondary">Default CC is never added (private link).</p>
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <aside className="space-y-6">
          <div className="border border-ink bg-cream p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest">Sender</h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-secondary">From</dt>
                <dd className="font-mono text-xs mt-1 break-all">
                  {draft.fromName} &lt;{draft.fromEmail}&gt;
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-secondary">App links</dt>
                <dd className="font-mono text-xs mt-1 break-all">{draft.appBaseUrl}</dd>
              </div>
            </dl>
          </div>

          <div className="border border-ink bg-white p-6 space-y-4">
            <div className="flex items-center gap-2">
              <UsersThree className="h-5 w-5 text-brand" weight="fill" />
              <h3 className="text-sm font-black uppercase tracking-widest">Default CC</h3>
            </div>
            <p className="text-[11px] text-secondary leading-relaxed">
              These people are copied on every automation that has “Include default CC list” turned on
              (managers, CEO, etc.). Turn CC off per email type above if you do not want them on that
              message. Password-reset mail never uses CC.
            </p>
            <ul className="max-h-56 overflow-y-auto border border-ink/10 divide-y divide-ink/5">
              {registeredUsers.map((u) => {
                const email = (u.email || '').toLowerCase();
                return (
                  <li key={u.uid || u.id || email} className="flex items-center gap-2 px-3 py-2">
                    <Checkbox
                      checked={selectedCc.has(email)}
                      onCheckedChange={(v) => toggleDefaultCc(email, v === true)}
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">{u.displayName || email}</div>
                      <div className="text-[10px] font-mono text-secondary truncate">{email}</div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {(Array.isArray(draft.defaultCcEmails) ? draft.defaultCcEmails : [])
              .filter((email): email is string => typeof email === 'string')
              .filter((e) => !registeredUsers.some((u) => (u.email || '').toLowerCase() === e))
              .map((email) => (
                <label key={email} className="flex items-center gap-2 text-xs">
                  <Checkbox checked onCheckedChange={(v) => toggleDefaultCc(email, v === true)} />
                  <span className="font-mono">{email}</span>
                  <span className="text-[10px] uppercase text-secondary">not in app</span>
                </label>
              ))}
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Add email not in the list"
                value={guestCc}
                onChange={(e) => setGuestCc(e.target.value)}
                className="h-10 rounded-none text-xs"
              />
              <Button type="button" variant="outline" className="h-10 rounded-none text-[10px] font-black uppercase" onClick={addGuestCc}>
                Add
              </Button>
            </div>
          </div>

          <div className="border border-ink bg-white p-6 space-y-4">
            <h3 className="text-sm font-black uppercase tracking-widest">Microsoft Teams</h3>
            <p className="text-[11px] text-secondary leading-relaxed">
              Optional incoming webhook. Operational alerts (not password-reset links) can post to the channel.
            </p>
            <div className="space-y-2">
              <Label htmlFor="teams-webhook" className="text-[10px] font-black uppercase tracking-widest text-secondary">
                Webhook URL
              </Label>
              <Input
                id="teams-webhook"
                type="url"
                placeholder="https://..."
                value={draft.teamsWebhookUrl || ''}
                onChange={(e) =>
                  setDraft((prev) => ({ ...prev, teamsWebhookUrl: e.target.value }))
                }
                className="h-11 rounded-none"
              />
            </div>
          </div>
        </aside>
      </div>

      <section className="border border-ink bg-white">
        <div className="border-b border-ink px-6 py-4 flex items-center gap-2">
          <Eye className="h-5 w-5 text-brand" />
          <h2 className="font-headline text-lg font-black uppercase tracking-tighter">
            Email format preview
          </h2>
        </div>
        <div className="grid md:grid-cols-[240px_1fr] min-h-[420px]">
          <ul className="border-b md:border-b-0 md:border-r border-ink/10">
            {EMAIL_AUTOMATION_KEYS.map((key) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => setPreviewKey(key)}
                  className={cn(
                    'w-full text-left px-4 py-3 text-[11px] font-black uppercase tracking-wide',
                    previewKey === key ? 'bg-cream text-brand' : 'hover:bg-cream/60'
                  )}
                >
                  {EMAIL_AUTOMATION_META[key].title}
                </button>
              </li>
            ))}
          </ul>
          <div className="p-4 space-y-3 bg-cream/40">
            <p className="text-[10px] font-mono text-secondary break-all">Subject: {preview.subject}</p>
            <iframe
              title="Email preview"
              className="w-full h-[520px] bg-white border border-ink/10"
              sandbox=""
              srcDoc={preview.html}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
