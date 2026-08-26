'use client';

import {
  addDoc,
  collection,
  getDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

export type MailJobType = 'test' | 'reset' | 'invite';

export async function enqueueMailJob(
  db: Firestore,
  type: MailJobType,
  email: string,
  options?: {wait?: boolean}
): Promise<{id: string; status: string}> {
  const ref = await addDoc(collection(db, 'mailJobs'), {
    type,
    email: email.trim().toLowerCase(),
    status: 'queued',
    createdAt: serverTimestamp(),
  });

  if (!options?.wait) {
    return {id: ref.id, status: 'queued'};
  }

  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const snap = await getDoc(ref);
    const status = String(snap.data()?.status || 'queued');
    if (status !== 'queued') {
      const error = snap.data()?.error ? String(snap.data()?.error) : undefined;
      if (status === 'failed') {
        throw new Error(error || 'Mail job failed');
      }
      return {id: ref.id, status};
    }
  }

  return {id: ref.id, status: 'queued'};
}
