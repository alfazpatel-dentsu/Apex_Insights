'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useAuth, useFirestore } from '@/firebase';
import { registerUser } from '@/lib/firestore-actions';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function RegisterPage() {
  const router = useRouter();
  const auth = useAuth();
  const firestore = useFirestore();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsRegistering(true);
    setError(null);
    try {
      await registerUser(firestore, auth, {
        email,
        displayName,
        password
      });
      router.push('/awaiting-approval');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('This account already exists. You may have already been invited. Please check your inbox for an activation link or try logging in.');
      } else {
        setError(err.message || 'Access request failed. Please verify your details.');
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
            <h1 className="text-4xl font-black tracking-tighter uppercase">Request Access</h1>
            <p className="text-[10px] text-neutral-500 font-black uppercase tracking-[0.2em]">New user identity registration process.</p>
          </div>

          <form onSubmit={handleRegister} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Full Legal Name</Label>
                <Input
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  placeholder="e.g. John Doe"
                  required
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  disabled={isRegistering}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Official Email ID</Label>
                <Input
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  type="email"
                  placeholder="name@dentsu.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isRegistering}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Create Password</Label>
                <Input
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  type="password"
                  required
                  placeholder="Min. 8 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isRegistering}
                />
              </div>
            </div>

            {error && (
              <div className="bg-destructive/5 border-l-2 border-destructive p-4">
                <p className="text-xs font-bold text-destructive uppercase tracking-wide leading-relaxed">{error}</p>
              </div>
            )}
            
            <Button 
              type="submit" 
              className="w-full h-14 bg-primary text-white hover:bg-black font-black uppercase tracking-[0.2em] text-[10px] transition-colors shadow-2xl shadow-primary/20"
              disabled={isRegistering}
            >
              {isRegistering ? 'Verifying Details...' : 'Request Access'}
            </Button>
          </form>

          <div className="pt-6 border-t border-neutral-100">
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-neutral-400 uppercase">Already registered?</span>
               <Link href="/" className="text-[10px] font-black uppercase text-primary hover:underline">Return to Login</Link>
             </div>
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative bg-black overflow-hidden grayscale">
        <img 
          src="https://picsum.photos/seed/reg/1200/1000" 
          alt="Abstract" 
          className="absolute inset-0 w-full h-full object-cover opacity-40"
          data-ai-hint="brutalist architecture"
        />
        <div className="absolute inset-0 bg-primary/10" />
      </div>
    </div>
  );
}
