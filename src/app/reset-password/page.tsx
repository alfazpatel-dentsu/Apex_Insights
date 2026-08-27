'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { confirmPasswordReset, verifyPasswordResetCode } from 'firebase/auth';
import { useAuth } from '@/firebase';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function ResetPasswordForm() {
  const auth = useAuth();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get('oobCode') || '';
  const mode = searchParams.get('mode') || 'reset';
  const isInvite = mode === 'invite';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [emailHint, setEmailHint] = useState<string | null>(null);

  useEffect(() => {
    if (!oobCode) return;
    let cancelled = false;
    verifyPasswordResetCode(auth, oobCode)
      .then((email) => {
        if (!cancelled) setEmailHint(email);
      })
      .catch(() => {
        if (!cancelled) setEmailHint(null);
      });
    return () => {
      cancelled = true;
    };
  }, [auth, oobCode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!oobCode) {
      setError('This reset link is missing a code. Request a new email from the sign-in page.');
      return;
    }
    setBusy(true);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      setDone(true);
    } catch (err: unknown) {
      const code = typeof err === 'object' && err && 'code' in err ? String((err as {code: string}).code) : '';
      if (code.includes('expired') || code.includes('invalid-action')) {
        setError('This link has expired or was already used. Request a new email from sign-in.');
      } else {
        setError('Could not update the password. Request a new link from the sign-in page.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-screen w-full">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-12 bg-white">
        <div className="w-full max-w-sm space-y-10">
          <SokratiLogo className="scale-110" />
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase">
              {isInvite ? 'Set password' : 'Reset password'}
            </h1>
            <p className="text-sm text-secondary">
              {done
                ? 'You can now sign in with your new password.'
                : emailHint
                  ? `Choose a new password for ${emailHint}.`
                  : 'Choose a new password for AZTEC Control Center.'}
            </p>
          </div>

          {done ? (
            <Button asChild className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs">
              <Link href="/">Sign in</Link>
            </Button>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-1.5">
                <Label className="micro-label">New password</Label>
                <Input
                  type="password"
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={busy}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="micro-label">Confirm password</Label>
                <Input
                  type="password"
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  required
                  minLength={8}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  disabled={busy}
                />
              </div>
              {error && <p className="text-sm font-medium text-destructive">{error}</p>}
              <Button
                type="submit"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
                disabled={busy}
              >
                {busy ? 'Saving…' : isInvite ? 'Set password' : 'Update password'}
              </Button>
              <Link href="/" className="block text-xs font-bold uppercase text-brand hover:underline">
                Back to sign in
              </Link>
            </form>
          )}
        </div>
      </div>
      <div className="hidden lg:block w-1/2 bg-ink" />
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ResetPasswordForm />
    </Suspense>
  );
}
