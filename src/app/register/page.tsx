'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { sendOtpEmail } from '@/lib/otp-utils';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AGENCIES, AGENCY_LABELS, DEFAULT_AGENCY, type AgencyId, isAllowedWorkEmail } from '@/lib/agencies';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const auth = useAuth();
  const firestore = useFirestore();

  const [email, setEmail] = useState(() => searchParams.get('email') || '');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [requestedAgency, setRequestedAgency] = useState<AgencyId>(DEFAULT_AGENCY);
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<'details' | 'password' | 'sending-otp'>('details');

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
      setStep('password');
    }
  }, [searchParams]);

  const handleDetailsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!isAllowedWorkEmail(normalizedEmail)) {
      setError('Access requests are limited to verified @dentsu.com and @iprospect.com email addresses.');
      return;
    }
    setError(null);
    setStep('password');
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!displayName.trim()) {
      setError('Name is required');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setIsRegistering(true);
    setError(null);
    setStep('sending-otp');

    try {
      // Create Firebase auth account
      const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);

      // Create user profile in Firestore
      const userProfile = {
        uid: userCredential.user.uid,
        email: normalizedEmail,
        displayName,
        photoURL: '',
        role: 'Client Partner',
        status: 'Pending',
        permissions: [],
        requestedAgency,
        memberships: {
          [requestedAgency]: {
            status: 'pending',
            role: 'Client Partner',
            permissions: [],
          },
        },
        groupPermissions: [],
      };

      await setDoc(doc(firestore, 'users', userCredential.user.uid), userProfile);

      // Send OTP verification email
      await sendOtpEmail(firestore, normalizedEmail, displayName);

      // Redirect to OTP verification page
      router.push(`/verify-otp?email=${encodeURIComponent(normalizedEmail)}&return_to=/awaiting-approval`);
    } catch (err: any) {
      setStep('password');
      if (err.code === 'auth/email-already-in-use') {
        setError('This account already exists. You may have already been invited. Please try logging in.');
      } else {
        setError(err.message || 'Registration failed. Please try again.');
      }
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="flex h-screen w-full">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-12 bg-white">
        <div className="w-full max-w-sm space-y-10">
          <SokratiLogo className="scale-110" />

          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase">
              {step === 'details' ? 'Request access' : step === 'password' ? 'Create password' : 'Sending code…'}
            </h1>
            <p className="text-sm text-secondary">
              {step === 'details'
                ? 'Register with your work email. An admin will approve your account.'
                : step === 'password'
                ? 'Create a secure password to continue.'
                : 'We\'re sending a verification code to your email.'}
            </p>
          </div>

          {step === 'details' && (
            <form onSubmit={handleDetailsSubmit} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="micro-label">Agency</Label>
                  <select
                    className="flex h-12 w-full border border-neutral-300 bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
                    value={requestedAgency}
                    onChange={(e) => setRequestedAgency(e.target.value as AgencyId)}
                  >
                    {AGENCIES.map((agency) => <option key={agency} value={agency}>{AGENCY_LABELS[agency]}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="micro-label">Full name</Label>
                  <Input
                    className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                    placeholder="e.g. John Doe"
                    required
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="micro-label">Work email</Label>
                  <Input
                    className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                    type="email"
                    placeholder="name@dentsu.com or name@iprospect.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>

              {error && (
                <div className="bg-destructive/5 border-l-2 border-destructive p-4">
                  <p className="text-sm font-medium text-destructive leading-relaxed">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
              >
                Continue
              </Button>
            </form>
          )}

          {step === 'password' && (
            <form onSubmit={handleRegister} className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="micro-label">Work email</Label>
                  <Input
                    className="h-12 border-neutral-300 bg-neutral-100"
                    type="email"
                    value={email}
                    disabled
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="micro-label">Password</Label>
                  <Input
                    className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                    type="password"
                    required
                    placeholder="Min. 8 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isRegistering}
                    autoFocus
                  />
                  <p className="text-xs text-secondary">Minimum 8 characters</p>
                </div>
              </div>

              {error && (
                <div className="bg-destructive/5 border-l-2 border-destructive p-4">
                  <p className="text-sm font-medium text-destructive leading-relaxed">{error}</p>
                </div>
              )}

              <Button
                type="submit"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
                disabled={isRegistering || password.length < 8}
              >
                {isRegistering ? 'Creating account…' : 'Create account'}
              </Button>

              <Button
                type="button"
                variant="ghost"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
                onClick={() => {
                  setStep('details');
                  setPassword('');
                  setError(null);
                }}
              >
                Back
              </Button>
            </form>
          )}

          {step === 'sending-otp' && (
            <div className="space-y-6">
              <div className="flex justify-center">
                <div className="animate-spin">
                  <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full" />
                </div>
              </div>
              <p className="text-center text-sm text-secondary">
                Sending verification code to {email}…
              </p>
            </div>
          )}

          {step !== 'sending-otp' && (
            <div className="pt-6 border-t border-hairline">
              <div className="flex items-center gap-2">
                <span className="text-xs text-secondary">Already have an account?</span>
                <Link href="/" className="text-xs font-bold uppercase text-brand hover:underline">Sign in</Link>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative bg-ink overflow-hidden">
        <img 
          src="https://images.pexels.com/photos/3184292/pexels-photo-3184292.jpeg" 
          alt="Team reviewing performance metrics" 
          className="absolute inset-0 w-full h-full object-cover opacity-45 mix-blend-luminosity grayscale"
        />
        <div className="absolute inset-0 bg-brand/25 mix-blend-multiply" />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="p-8 border border-white/20 bg-ink/70">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70 mb-3">Join AZTEC</p>
            <h2 className="text-white text-3xl font-black tracking-tight normal-case">Request access to the client operations console.</h2>
          </div>
        </div>
      </div>
    </div>
  );
}
