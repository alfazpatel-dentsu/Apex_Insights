
'use client';

import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { useAuth, useUser } from '@/firebase';
import { SokratiLogo } from '@/components/sokrati-logo';
import { Button } from '@/components/ui/button';
import { Clock, ShieldAlert } from 'lucide-react';

export default function AwaitingApprovalPage() {
  const router = useRouter();
  const auth = useAuth();
  const { user } = useUser();

  const handleSignOut = async () => {
    await signOut(auth);
    router.push('/');
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-cream tactical-grid">
      <div className="max-w-md w-full p-12 bg-white border border-ink shadow-2xl space-y-10 text-center animate-in fade-in zoom-in-95 duration-500">
        <SokratiLogo className="mx-auto scale-125 mb-4" />
        
        <div className="space-y-4">
           <div className="flex justify-center">
             <div className="h-16 w-16 bg-warning/10 text-warning flex items-center justify-center rounded-full">
               <Clock className="h-8 w-8" />
             </div>
           </div>
           <h1 className="text-3xl font-black uppercase tracking-tighter">Awaiting Approval</h1>
           <p className="text-xs font-bold text-neutral-500 leading-relaxed uppercase tracking-widest">
             Your access request has been received and is currently under review by the administration.
           </p>
        </div>

        <div className="bg-foreground/[0.03] p-6 border-l-[3px] border-warning text-left space-y-2">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-40">Status Update</span>
            <p className="text-[11px] font-bold leading-none">Account: {user?.email}</p>
            <p className="text-[11px] font-bold leading-none">Status: PENDING_REVIEW</p>
        </div>

        <div className="space-y-4 pt-4">
            <p className="text-[9px] font-black text-neutral-400 uppercase tracking-[0.2em]">You will receive an email once your account is approved.</p>
            <Button 
                variant="outline"
                className="w-full h-12 border-ink font-black uppercase tracking-widest text-[10px] hover:bg-ink hover:text-white transition-all"
                onClick={handleSignOut}
            >
                Return to Login
            </Button>
        </div>
      </div>
    </div>
  );
}
