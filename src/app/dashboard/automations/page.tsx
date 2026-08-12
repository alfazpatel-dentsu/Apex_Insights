'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CircleNotch,
  EnvelopeSimple,
  Lightning,
  PaperPlaneTilt,
  WarningCircle,
} from '@phosphor-icons/react';
import { doc, setDoc } from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { PageHeader } from '@/components/page-header';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { useDoc, useFirestore, useUser, useFirebaseApp } from '@/firebase';
import { UserProfile } from '@/lib/types';
import {
  DEFAULT_EMAIL_AUTOMATIONS,
  EMAIL_AUTOMATION_META,
  EMAIL_AUTOMATIONS_DOC,
  EmailAutomationKey,
  EmailAutomationSettings,
} from '@/lib/email-automations';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const AUTOMATION_KEYS = Object.keys(EMAIL_AUTOMATION_META) as EmailAutomationKey[];

export default function AutomationsPage() {
  const firestore = useFirestore();
  const app = useFirebaseApp();
  const { toast } = useToast();
  const { user } = useUser();
  const { data: profile, loading: profileLoading } = useDoc<UserProfile>(
    user ? `users/${user.uid}` : null
  );
  const { data: remoteSettings, loading: settingsLoading } = useDoc<EmailAutomationSettings>(
    EMAIL_AUTOMATIONS_DOC
  );

  const [draft, setDraft] = useState<EmailAutomationSettings>(DEFAULT_EMAIL_AUTOMATIONS);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const isAdmin = !profileLoading && profile?.role === 'Admin';

  useEffect(() => {
    if (settingsLoading) return;
    setDraft({
      ...DEFAULT_EMAIL_AUTOMATIONS,
      ...(remoteSettings || {}),
      enabled: {
        ...DEFAULT_EMAIL_AUTOMATIONS.enabled,
        ...(remoteSettings?.enabled || {}),
      },
    });
    setHydrated(true);
  }, [remoteSettings, settingsLoading]);

  const dirty = useMemo(() => {
    if (!hydrated) return false;
    const baseline = {
      ...DEFAULT_EMAIL_AUTOMATIONS,
      ...(remoteSettings || {}),
      enabled: {
        ...DEFAULT_EMAIL_AUTOMATIONS.enabled,
        ...(remoteSettings?.enabled || {}),
      },
    };
    return JSON.stringify(baseline.enabled) !== JSON.stringify(draft.enabled);
  }, [draft.enabled, hydrated, remoteSettings]);

  const toggle = (key: EmailAutomationKey, value: boolean) => {
    setDraft((prev) => ({
      ...prev,
      enabled: { ...prev.enabled, [key]: value },
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const payload: EmailAutomationSettings = {
        fromEmail: draft.fromEmail || DEFAULT_EMAIL_AUTOMATIONS.fromEmail,
        fromName: draft.fromName || DEFAULT_EMAIL_AUTOMATIONS.fromName,
        appBaseUrl: draft.appBaseUrl || DEFAULT_EMAIL_AUTOMATIONS.appBaseUrl,
        enabled: draft.enabled,
        updatedAt: new Date().toISOString(),
        updatedBy: user.uid,
      };
      await setDoc(doc(firestore, 'settings', 'emailAutomations'), payload, { merge: true });
      toast({
        title: 'Automations saved',
        description: 'Email alert toggles are live for Cloud Functions.',
      });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: 'Save failed',
        description: error?.message || 'Could not update automation settings.',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTesting(true);
    try {
      const functions = getFunctions(app, 'us-central1');
      const sendTest = httpsCallable(functions, 'sendTestAlertEmail');
      const result = await sendTest({ to: profile?.email || user?.email });
      const data = result.data as { sent?: boolean; from?: string; to?: string; skipped?: string };
      toast({
        title: data.sent ? 'Test email sent' : 'Test email skipped',
        description: data.sent
          ? `Sent from ${data.from} to ${data.to}. Check inbox/spam.`
          : data.skipped || 'No message was sent.',
      });
    } catch (error: any) {
      const detail =
        error?.details ||
        error?.message ||
        'Deploy email functions and set SMTP_PASS for aztec_alerts@dentsu.com.';
      toast({
        variant: 'destructive',
        title: 'Test email failed',
        description: typeof detail === 'string' ? detail : String(detail),
      });
    } finally {
      setTesting(false);
    }
  };

  if (profileLoading || settingsLoading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 gap-4">
        <CircleNotch className="h-8 w-8 animate-spin text-primary/40" />
        <span className="text-xs font-black uppercase tracking-widest text-secondary">
          Loading automations…
        </span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Automations"
          description="Email alert settings are restricted to administrators."
        />
        <div className="border border-ink bg-cream p-8 flex items-start gap-3">
          <WarningCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <p className="text-sm text-secondary">
            You need the Admin role to configure outbound email automations.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <PageHeader
        title="Automations"
        description="Configure product alert emails sent from the shared mailbox aztec_alerts@dentsu.com."
      >
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
      </PageHeader>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_0.8fr]">
        <section className="border border-ink bg-white">
          <div className="border-b border-ink px-6 py-4 flex items-center gap-2">
            <EnvelopeSimple className="h-5 w-5 text-brand" weight="fill" />
            <h2 className="font-headline text-lg font-black uppercase tracking-tighter">
              Email automations
            </h2>
          </div>
          <ul className="divide-y divide-ink/10">
            {AUTOMATION_KEYS.map((key) => {
              const meta = EMAIL_AUTOMATION_META[key];
              const enabled = draft.enabled[key] !== false;
              return (
                <li
                  key={key}
                  className="px-6 py-5 flex flex-col sm:flex-row sm:items-center gap-4 justify-between"
                >
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
                <dt className="text-[10px] font-black uppercase tracking-widest text-secondary">
                  From
                </dt>
                <dd className="font-mono text-xs mt-1 break-all">
                  {draft.fromName} &lt;{draft.fromEmail}&gt;
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-secondary">
                  App links
                </dt>
                <dd className="font-mono text-xs mt-1 break-all">{draft.appBaseUrl}</dd>
              </div>
            </dl>
            <p className="text-[11px] text-secondary leading-relaxed">
              Outbound alerts use Microsoft 365 SMTP (<code className="font-mono">smtp.office365.com</code>) for the shared mailbox. Set the{' '}
              <code className="font-mono">SMTP_PASS</code> Functions secret, then deploy. See{' '}
              <code className="font-mono">functions/README.md</code>.
            </p>
          </div>

          <div className="border border-ink bg-white p-6 space-y-3">
            <h3 className="text-sm font-black uppercase tracking-widest">Notes</h3>
            <ul className="text-sm text-secondary space-y-2 list-disc pl-4 leading-relaxed">
              <li>Assignee emails match Action Item &quot;Assigned To&quot; to a user display name or email.</li>
              <li>Access-granted fires when a Pending user is approved in Administration.</li>
              <li>Firebase Auth invite/reset emails are separate; brand those via Auth SMTP in Firebase Console if needed.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
