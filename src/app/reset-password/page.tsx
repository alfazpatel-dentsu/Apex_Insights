'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  confirmPasswordReset,
  signInWithEmailAndPassword,
  verifyPasswordResetCode,
} from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/firebase';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type ActionState = 'loading' | 'ready' | 'success' | 'error';

export default function ResetPasswordPage() {
  const auth = useAuth();
  const router = useRouter();
  const [oobCode, setOobCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [state, setState] = useState<ActionState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('oobCode');
    if (!code) {
      setError('This invitation link is missing its security code.');
      setState('error');
      return;
    }

    setOobCode(code);
    verifyPasswordResetCode(auth, code)
      .then((resolvedEmail) => {
        setEmail(resolvedEmail);
        setState('ready');
      })
      .catch(() => {
        setError('This link is invalid or has expired. Ask an administrator to resend the invitation.');
        setState('error');
      });
  }, [auth]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await confirmPasswordReset(auth, oobCode, password);
      await signInWithEmailAndPassword(auth, email, password);
      setState('success');
      router.push('/dashboard');
    } catch {
      setError('The password could not be set. This link may have expired; ask an administrator to resend it.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-white p-6">
      <div className="w-full max-w-sm space-y-10">
        <SokratiLogo className="scale-110" />
        <div className="space-y-2">
          <h1 className="text-4xl font-black tracking-tighter uppercase">Set password</h1>
          <p className="text-sm text-secondary">
            {state === 'success'
              ? 'Your password has been set. Redirecting to AZTEC Control Center...'
              : 'Use this secure invitation link to create your password and sign in.'}
          </p>
        </div>

        {state === 'loading' && (
          <p className="animate-pulse text-sm font-medium">Validating invitation...</p>
        )}

        {state === 'error' && (
          <div className="space-y-6">
            <p className="bg-destructive/5 border-l-2 border-destructive p-4 text-sm font-medium text-destructive leading-relaxed">
              {error}
            </p>
            <Link href="/" className="text-xs font-bold uppercase text-brand hover:underline">
              Back to sign in
            </Link>
          </div>
        )}

        {state === 'ready' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-1.5">
              <Label className="micro-label">Account</Label>
              <Input value={email} readOnly className="h-12 rounded-none bg-neutral-50" />
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="micro-label">New password</Label>
                <Input
                  className="h-12 rounded-none border-neutral-300"
                  type="password"
                  minLength={8}
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="micro-label">Confirm password</Label>
                <Input
                  className="h-12 rounded-none border-neutral-300"
                  type="password"
                  minLength={8}
                  required
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>
            {error && <p className="text-sm font-medium text-destructive">{error}</p>}
            <Button
              type="submit"
              className="h-12 w-full text-xs font-bold uppercase tracking-[0.15em]"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in...' : 'Set password and sign in'}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
