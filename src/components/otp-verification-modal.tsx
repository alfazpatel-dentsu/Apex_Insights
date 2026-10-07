'use client';

import { useState } from 'react';
import { useFirestore, useDoc, useUser } from '@/firebase';
import { verifyOtp } from '@/lib/otp-service';
import { sendOtpEmail } from '@/lib/otp-utils';
import { OtpInput } from '@/components/otp-input';
import { UserProfile } from '@/lib/types';
import { doc, updateDoc } from 'firebase/firestore';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

interface OtpVerificationModalProps {
  isOpen: boolean;
  onVerified: () => void;
}

export function OtpVerificationModal({ isOpen, onVerified }: OtpVerificationModalProps) {
  const firestore = useFirestore();
  const { user } = useUser();
  const { data: userProfile } = useDoc<UserProfile>(user ? `users/${user.uid}` : null);

  const [otp, setOtp] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [otpSent, setOtpSent] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);

  const handleSendOtp = async () => {
    if (!user?.email) return;

    setIsSendingOtp(true);
    setError(null);

    try {
      const result = await sendOtpEmail(firestore, user.email, userProfile?.displayName);
      setOtpSent(true);
      setTimeLeft(600); // 10 minutes

      const timer = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to send OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email || otp.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setIsVerifying(true);
    setError(null);

    try {
      const result = await verifyOtp(firestore, user.email, otp);
      if (result.success) {
        // Update user's lastOtpVerifiedAt in Firestore
        await updateDoc(doc(firestore, 'users', user.uid), {
          lastOtpVerifiedAt: new Date().toISOString(),
        });
        onVerified();
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

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md rounded-none glass" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase">Verify Your Email</DialogTitle>
          <DialogDescription className="text-sm">
            For security, we need to verify your email. We'll send a code to {user?.email}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleVerifyOtp} className="space-y-6 pt-6">
          {!otpSent ? (
            <div className="space-y-4">
              {userProfile?.lastOtpVerifiedAt && (
                <p className="text-sm text-secondary">
                  Last verified {new Date(userProfile.lastOtpVerifiedAt).toLocaleDateString()} ago.
                  For your security, we ask you to re-verify periodically.
                </p>
              )}
              {error && (
                <div className="bg-destructive/5 border-l-2 border-destructive p-3 rounded">
                  <p className="text-sm text-destructive font-medium">{error}</p>
                </div>
              )}
              <Button
                type="button"
                className="w-full h-12 font-bold uppercase tracking-[0.15em] text-xs"
                onClick={handleSendOtp}
                disabled={isSendingOtp}
              >
                {isSendingOtp ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Sending…
                  </>
                ) : (
                  'Send Verification Code'
                )}
              </Button>
            </div>
          ) : (
            <>
              <div>
                <OtpInput
                  value={otp}
                  onChange={setOtp}
                  disabled={isVerifying || timeLeft === 0}
                  error={error || undefined}
                  autoFocus
                />
              </div>

              <div className="text-center">
                {timeLeft > 0 ? (
                  <p className="text-xs text-secondary font-mono">
                    Code expires in {minutes}:{seconds.toString().padStart(2, '0')}
                  </p>
                ) : (
                  <p className="text-sm text-destructive font-medium">
                    Code has expired. Request a new one.
                  </p>
                )}
              </div>

              <div className="flex gap-3">
                <Button
                  type="submit"
                  className="flex-1 h-12 font-bold uppercase tracking-[0.15em] text-xs"
                  disabled={isVerifying || otp.length !== 6 || timeLeft === 0}
                >
                  {isVerifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      Verifying…
                    </>
                  ) : (
                    'Verify Code'
                  )}
                </Button>
                {timeLeft === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="flex-1 h-12 font-bold uppercase tracking-[0.15em] text-xs"
                    onClick={() => {
                      setOtpSent(false);
                      setOtp('');
                      setError(null);
                      handleSendOtp();
                    }}
                  >
                    Resend Code
                  </Button>
                )}
              </div>
            </>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
