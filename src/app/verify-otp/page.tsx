'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useFirestore, useUser } from '@/firebase';
import { verifyOtp } from '@/lib/otp-service';
import { OtpInput } from '@/components/otp-input';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { doc, updateDoc } from 'firebase/firestore';

export default function VerifyOtpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const firestore = useFirestore();
  const { user } = useUser();

  const email = searchParams.get('email');
  const returnTo = searchParams.get('return_to') || '/dashboard';

  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes in seconds

  useEffect(() => {
    if (!email) {
      router.push('/');
      return;
    }

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [email, router]);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length !== 6) {
      setError('Please enter a 6-digit code');
      return;
    }

    if (!email) {
      setError('Email not found');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const result = await verifyOtp(firestore, email, otp);
      if (result.success) {
        // Update user's lastOtpVerifiedAt if user is logged in
        if (user) {
          await updateDoc(doc(firestore, 'users', user.uid), {
            lastOtpVerifiedAt: new Date().toISOString(),
          });
        }
        router.push(returnTo);
      } else {
        setError(result.message);
        setOtp('');
      }
    } catch (err: any) {
      setError(err.message || 'Verification failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  if (!email) {
    return null;
  }

  return (
    <div className="flex h-screen w-full">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-12 bg-white">
        <div className="w-full max-w-sm space-y-10">
          <SokratiLogo className="scale-110" />

          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase">Verify Email</h1>
            <p className="text-sm text-secondary">
              We sent a code to <strong>{email}</strong>
            </p>
          </div>

          <form onSubmit={handleVerify} className="space-y-6">
            <div className="space-y-6">
              <OtpInput
                value={otp}
                onChange={setOtp}
                disabled={isVerifying || timeLeft === 0}
                error={error || undefined}
                autoFocus
              />

              <div className="text-center">
                {timeLeft > 0 ? (
                  <p className="text-xs text-secondary font-mono">
                    Code expires in {minutes}:{seconds.toString().padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-sm text-destructive font-medium">
                    Code has expired. Please request a new one.
                  </p>
                )}
              </div>
            </div>

            <Button
              type="submit"
              className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
              disabled={isVerifying || otp.length !== 6 || timeLeft === 0}
            >
              {isVerifying ? 'Verifying…' : 'Verify Code'}
            </Button>

            {timeLeft === 0 && (
              <Button
                type="button"
                variant="outline"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
                onClick={() => router.push(`/register?email=${encodeURIComponent(email)}`)}
              >
                Request New Code
              </Button>
            )}
          </form>

          <div className="pt-6 border-t border-hairline">
            <p className="text-xs text-secondary">
              Didn't receive a code?{' '}
              <button
                type="button"
                className="font-bold uppercase text-brand hover:underline"
                onClick={() => router.push(`/register?email=${encodeURIComponent(email)}`)}
              >
                Request again
              </button>
            </p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative bg-ink overflow-hidden">
        <img
          src="https://images.pexels.com/photos/669610/pexels-photo-669610.jpeg"
          alt="Performance analytics workspace"
          className="absolute inset-0 w-full h-full object-cover opacity-50 mix-blend-luminosity grayscale"
        />
        <div className="absolute inset-0 bg-brand/30 mix-blend-multiply" />
        <div className="absolute bottom-12 left-12 right-12">
          <div className="p-8 border border-white/20 bg-ink/70">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-white/70 mb-3">
              AZTEC Control Center
            </p>
            <h2 className="text-white text-3xl font-black tracking-tight mb-3 normal-case">
              Secure email verification ensures only active employees have access.
            </h2>
            <p className="text-white/60 text-xs font-mono tracking-widest uppercase">
              Ops console for media &amp; performance teams
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
