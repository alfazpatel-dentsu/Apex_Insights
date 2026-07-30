
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function LoginPage() {
  const router = useRouter();
  const auth = useAuth();
  const { user, loading } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) router.push('/dashboard');
  }, [user, router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setError(null);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push('/dashboard');
    } catch (error: any) {
      setError('Invalid credentials or unauthorized account.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  if (loading || user) return null;

  return (
    <div className="flex h-screen w-full">
      <div className="w-full lg:w-1/2 flex flex-col items-center justify-center p-12 bg-white">
        <div className="w-full max-w-sm space-y-10">
          <SokratiLogo className="scale-110" />
          
          <div className="space-y-2">
            <h1 className="text-4xl font-black tracking-tighter uppercase">Terminal Access</h1>
            <p className="text-xs text-neutral-500 font-bold uppercase tracking-widest">Authenticate with corporate credentials.</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Official Identity</Label>
                <Input
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  type="email"
                  placeholder="name@dentsu.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoggingIn}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] font-black uppercase tracking-widest opacity-60">Password</Label>
                <Input
                  className="h-12 border-neutral-300 focus:border-primary focus:border-2 transition-all rounded-none"
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoggingIn}
                />
              </div>
            </div>

            {error && <p className="text-xs font-black text-destructive uppercase tracking-widest">{error}</p>}
            
            <Button 
              type="submit" 
              className="w-full h-14 bg-primary text-white hover:bg-black font-black uppercase tracking-[0.2em] text-[10px] transition-colors"
              disabled={isLoggingIn}
            >
              {isLoggingIn ? 'Verifying...' : 'Login'}
            </Button>
          </form>

          <div className="flex flex-col gap-4 pt-6 border-t border-neutral-100">
             <div className="flex items-center gap-2">
               <span className="text-[10px] font-bold text-neutral-400 uppercase">New identity?</span>
               <Link href="/register" className="text-[10px] font-black uppercase text-primary hover:underline">Request access</Link>
             </div>
             <p className="text-[10px] text-neutral-400 font-mono">SECURE END-TO-END // AZTEC_V2.5</p>
          </div>
        </div>
      </div>

      <div className="hidden lg:block lg:w-1/2 relative bg-black overflow-hidden">
        <img 
          src="https://images.pexels.com/photos/18069241/pexels-photo-18069241.png" 
          alt="Abstract Architecture" 
          className="absolute inset-0 w-full h-full object-cover opacity-60 mix-blend-luminosity scale-110 grayscale"
        />
        <div className="absolute inset-0 bg-primary/20 mix-blend-multiply" />
        <div className="absolute bottom-12 left-12 right-12">
            <div className="p-8 border border-white/20 backdrop-blur-xl bg-black/40">
              <h2 className="text-white text-3xl font-black tracking-tight mb-2 italic">"Precision is the currency of intelligence."</h2>
              <p className="text-white/60 text-xs font-mono tracking-widest uppercase">System Operational // All Clusters Green</p>
            </div>
        </div>
      </div>
    </div>
  );
}
