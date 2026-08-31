'use client';

import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  type Firestore,
} from 'firebase/firestore';

export type MailJobType = 'test' | 'reset' | 'invite' | 'mom';

export type MailJobPayload = {
  type: MailJobType;
  email?: string;
  emails?: string[];
  subject?: string;
  html?: string;
  text?: string;
  resend?: boolean;
};

export async function enqueueMailJob(
  db: Firestore,
  typeOrPayload: MailJobType | MailJobPayload,
  email?: string,
  options?: {wait?: boolean}
): Promise<{id: string; status: string}> {
  const payload: MailJobPayload =
    typeof typeOrPayload === 'string'
      ? {type: typeOrPayload, email: (email || '').trim().toLowerCase()}
      : typeOrPayload;

  const record: Record<string, unknown> = {
    type: payload.type,
    status: 'queued',
    createdAt: serverTimestamp(),
  };
  if (payload.email) record.email = payload.email.trim().toLowerCase();
  if (payload.emails?.length) {
    record.emails = payload.emails.map((e) => e.trim().toLowerCase()).filter((e) => e.includes('@'));
  }
  if (payload.subject) record.subject = payload.subject;
  if (payload.html) record.html = payload.html;
  if (payload.text) record.text = payload.text;
  if (payload.resend) record.resend = true;

  const ref = await addDoc(collection(db, 'mailJobs'), record);

  if (!options?.wait) {
    return {id: ref.id, status: 'queued'};
  }

  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 800));
    const snap = await getDoc(doc(db, 'mailJobs', ref.id));
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
