/*
 * Fixes existing iProspect user profiles to remove status field
 * that was causing them to get backward-compat Sokrati access.
 *
 * Usage: npm --prefix functions run node scripts/fix-iprospect-profiles.js
 */
const {initializeApp, applicationDefault, getApps} = require('firebase-admin/app');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');

if (!getApps().length) initializeApp({credential: applicationDefault()});
const db = getFirestore();
const auth = getAuth();

const testUserEmails = [
  'iprospect-admin@dentsu.com',
  'iprospect-user@dentsu.com',
];

async function fixProfiles() {
  console.log('Fixing iProspect user profiles...\n');

  for (const email of testUserEmails) {
    try {
      // Get user by email
      const userRecord = await auth.getUserByEmail(email);
      console.log(`Found user: ${email} (UID: ${userRecord.uid})`);

      // Update Firestore profile - REMOVE status field, keep ONLY iprospect membership
      const userProfileRef = db.doc(`users/${userRecord.uid}`);
      await userProfileRef.update({
        memberships: {
          'iprospect': {
            agencyId: 'iprospect',
            role: email.includes('admin') ? 'Admin' : 'User',
            joinedAt: Timestamp.now(),
            permissions: ['read', 'write'],
            status: 'active',
          },
        },
        activeAgency: 'iprospect',
      });

      console.log(`✓ Updated profile: removed status field, set iprospect-only membership\n`);
    } catch (error) {
      console.error(`✗ Error updating ${email}:`, error.message, '\n');
    }
  }

  console.log('✓ Profile fixes complete!');
  console.log('\nNext: Logout and login again to see the blank app.');
}

fixProfiles().catch((error) => {
  console.error('Fix failed:', error);
  process.exitCode = 1;
});
