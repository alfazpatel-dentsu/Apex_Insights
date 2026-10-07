import { Firestore, collection, doc, setDoc, updateDoc, getDoc, deleteDoc, query, where, getDocs, Timestamp } from 'firebase/firestore';

export interface OtpRecord {
  id: string;
  email: string;
  otp: string;
  createdAt: string;
  expiresAt: string;
  attempts: number;
  maxAttempts: number;
  verified: boolean;
}

const OTP_EXPIRY_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const OTP_COLLECTION = 'pendingOtps';

/** Generate a 6-digit OTP */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Create and store OTP in Firestore */
export async function createOtp(firestore: Firestore, email: string): Promise<OtpRecord> {
  const otp = generateOtp();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60000);

  const otpId = `${email.toLowerCase()}-${Date.now()}`;
  const otpRecord: OtpRecord = {
    id: otpId,
    email: email.toLowerCase(),
    otp,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    attempts: 0,
    maxAttempts: OTP_MAX_ATTEMPTS,
    verified: false,
  };

  await setDoc(doc(firestore, OTP_COLLECTION, otpId), otpRecord);
  return otpRecord;
}

/** Get active OTP for an email */
export async function getActiveOtp(firestore: Firestore, email: string): Promise<OtpRecord | null> {
  const q = query(
    collection(firestore, OTP_COLLECTION),
    where('email', '==', email.toLowerCase()),
    where('verified', '==', false)
  );

  const snapshot = await getDocs(q);
  if (snapshot.empty) return null;

  const docs = snapshot.docs
    .map(doc => doc.data() as OtpRecord)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const latestOtp = docs[0];
  if (new Date(latestOtp.expiresAt) < new Date()) {
    await deleteDoc(doc(firestore, OTP_COLLECTION, latestOtp.id));
    return null;
  }

  return latestOtp;
}

/** Verify OTP */
export async function verifyOtp(
  firestore: Firestore,
  email: string,
  otpCode: string
): Promise<{ success: boolean; message: string; remaining: number }> {
  const otpRecord = await getActiveOtp(firestore, email);

  if (!otpRecord) {
    return {
      success: false,
      message: 'No active OTP found. Request a new one.',
      remaining: 0,
    };
  }

  if (otpRecord.attempts >= otpRecord.maxAttempts) {
    await deleteDoc(doc(firestore, OTP_COLLECTION, otpRecord.id));
    return {
      success: false,
      message: 'Maximum attempts exceeded. Request a new OTP.',
      remaining: 0,
    };
  }

  if (otpRecord.otp !== otpCode) {
    const newAttempts = otpRecord.attempts + 1;
    const remaining = otpRecord.maxAttempts - newAttempts;

    await updateDoc(doc(firestore, OTP_COLLECTION, otpRecord.id), {
      attempts: newAttempts,
    });

    return {
      success: false,
      message: `Invalid OTP. ${remaining} attempts remaining.`,
      remaining,
    };
  }

  await updateDoc(doc(firestore, OTP_COLLECTION, otpRecord.id), {
    verified: true,
  });

  return {
    success: true,
    message: 'OTP verified successfully.',
    remaining: 0,
  };
}

/** Clean up verified/expired OTPs */
export async function cleanupExpiredOtps(firestore: Firestore): Promise<number> {
  const q = query(collection(firestore, OTP_COLLECTION));
  const snapshot = await getDocs(q);

  const now = new Date();
  let deletedCount = 0;

  for (const doc of snapshot.docs) {
    const otpRecord = doc.data() as OtpRecord;
    if (new Date(otpRecord.expiresAt) < now || otpRecord.verified) {
      await deleteDoc(doc.ref);
      deletedCount++;
    }
  }

  return deletedCount;
}

/** Check if user needs OTP re-verification (30+ days since last verification) */
export function needsOtpReVerification(lastOtpVerifiedAt?: string): boolean {
  if (!lastOtpVerifiedAt) return true;

  const lastVerified = new Date(lastOtpVerifiedAt);
  const now = new Date();
  const daysSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);

  return daysSinceVerification >= 30;
}

/** Get time remaining until next re-verification required (in days) */
export function daysUntilReVerification(lastOtpVerifiedAt?: string): number {
  if (!lastOtpVerifiedAt) return 0;

  const lastVerified = new Date(lastOtpVerifiedAt);
  const now = new Date();
  const daysSinceVerification = (now.getTime() - lastVerified.getTime()) / (1000 * 60 * 60 * 24);
  const remainingDays = 30 - daysSinceVerification;

  return Math.max(0, Math.ceil(remainingDays));
}
