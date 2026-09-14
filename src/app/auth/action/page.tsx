'use client';

import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function AuthActionRedirect() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const mode = params.get('mode') || '';
    const oobCode = params.get('oobCode') || '';
    const qs = new URLSearchParams();
    if (oobCode) qs.set('oobCode', oobCode);
    if (mode === 'resetPassword' || mode === 'recoverEmail') qs.set('mode', 'reset');
    if (mode === 'invite') qs.set('mode', 'invite');
    router.replace(`/reset-password?${qs.toString()}`);
  }, [params, router]);

  return null;
}

export default function AuthActionPage() {
  return (
    <Suspense fallback={null}>
      <AuthActionRedirect />
    </Suspense>
  );
}
