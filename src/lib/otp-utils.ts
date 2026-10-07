import { Firestore } from 'firebase/firestore';
import { enqueueMailJob } from './mail-jobs';
import { createOtp } from './otp-service';

/** Send OTP to user's email */
export async function sendOtpEmail(
  firestore: Firestore,
  email: string,
  displayName?: string
): Promise<{ otp: string; expiresAt: string }> {
  const otpRecord = await createOtp(firestore, email);

  const name = displayName || email.split('@')[0];
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background-color: #f5f5f5; padding: 40px 20px; text-align: center;">
        <h2 style="color: #333; margin-bottom: 20px;">AZTEC Control Center</h2>
        <h1 style="color: #1a1a1a; font-size: 24px; margin-bottom: 30px;">Verify Your Email</h1>

        <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
          Hi <strong>${name}</strong>,
        </p>

        <p style="color: #666; font-size: 16px; margin-bottom: 30px;">
          Use the code below to verify your email address. This code will expire in 10 minutes.
        </p>

        <div style="background-color: #fff; border: 2px solid #333; padding: 20px; margin-bottom: 30px; text-align: center;">
          <p style="font-size: 32px; letter-spacing: 4px; font-weight: bold; color: #333; margin: 0;">
            ${otpRecord.otp}
          </p>
        </div>

        <p style="color: #999; font-size: 14px; margin-bottom: 20px;">
          If you didn't request this code, you can ignore this email. If someone else is trying to access your account, please change your password immediately.
        </p>

        <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">

        <p style="color: #999; font-size: 12px;">
          This is an automated message from AZTEC Control Center. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;

  await enqueueMailJob(firestore, {
    type: 'otp',
    email: email.toLowerCase(),
    subject: `Your AZTEC Verification Code: ${otpRecord.otp}`,
    html,
  });

  return {
    otp: otpRecord.otp,
    expiresAt: otpRecord.expiresAt,
  };
}
