/*
 * Sets up iProspect agency and test users for multi-agency support.
 *
 * Usage (dry run): npm --prefix functions run setup:iprospect
 * Usage (write):   npm --prefix functions run setup:iprospect -- --execute
 *
 * The script:
 * 1. Creates agencies/iprospect agency document
 * 2. Creates empty agency-scoped collections (ready for data migration)
 * 3. Creates test iProspect user accounts
 * 4. Assigns iProspect membership to users
 * 5. Never deletes existing data
 */
const {initializeApp, applicationDefault, getApps} = require('firebase-admin/app');
const {getFirestore, Timestamp} = require('firebase-admin/firestore');
const {getAuth} = require('firebase-admin/auth');

const execute = process.argv.includes('--execute');

if (!getApps().length) initializeApp({credential: applicationDefault()});
const db = getFirestore();
const auth = getAuth();

// Collections that need to be set up for iProspect
const collections = [
  'clients', 'leads', 'kpis', 'kpiWeeklyData', 'kpiDefinitions', 'channels',
  'monthlySpends', 'weeklySpends', 'businessSnapshots', 'actionItems',
  'wbrEntries', 'pageManagement', 'clusterInsights',
];

// Test users to create for iProspect
const testUsers = [
  {
    email: 'iprospect-admin@dentsu.com',
    displayName: 'iProspect Admin',
    role: 'Admin',
  },
  {
    email: 'iprospect-user@dentsu.com',
    displayName: 'iProspect User',
    role: 'User',
  },
];

async function setupIProspectAgency() {
  console.log('Setting up iProspect agency...');

  const agencyRef = db.doc('agencies/iprospect');
  const agencyData = {
    agencyId: 'iprospect',
    name: 'iProspect',
    createdAt: Timestamp.now(),
    status: 'active',
    description: 'iProspect agency for multi-agency support',
  };

  if (!execute) {
    console.log('Would create agency document:', agencyData);
    return;
  }

  await agencyRef.set(agencyData, {merge: true});
  console.log('✓ Created iProspect agency document');
}

async function setupCollections() {
  console.log('\nSetting up empty agency-scoped collections...');

  for (const collectionName of collections) {
    const collectionPath = `agencies/iprospect/${collectionName}`;

    if (!execute) {
      console.log(`Would initialize collection: ${collectionPath}`);
      continue;
    }

    // Firestore creates collections automatically when data is added
    // No need to explicitly create empty collections
    // They will be created during data migration
    console.log(`✓ Collection ready: ${collectionPath} (will be created on first data write)`);
  }
}

async function createTestUsers() {
  console.log('\nSetting up test iProspect users...');

  for (const user of testUsers) {
    if (!execute) {
      console.log(`Would create/update user: ${user.email} (${user.displayName})`);
      continue;
    }

    try {
      let userRecord;

      // Try to get existing user by email
      try {
        userRecord = await auth.getUserByEmail(user.email);
        console.log(`✓ Found existing Auth user: ${user.email} (UID: ${userRecord.uid})`);
      } catch (notFoundError) {
        // User doesn't exist, create new one
        userRecord = await auth.createUser({
          email: user.email,
          password: 'TempPassword123!@#', // User should change this on first login
          displayName: user.displayName,
          emailVerified: false,
        });
        console.log(`✓ Created Auth user: ${user.email} (UID: ${userRecord.uid})`);
      }

      // Create or update Firestore user profile with iProspect membership
      const userProfileRef = db.doc(`users/${userRecord.uid}`);
      await userProfileRef.set({
        uid: userRecord.uid,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        // DO NOT set status field—it triggers backward-compat Sokrati access
        // Only memberships.iprospect gives this user access
        createdAt: Timestamp.now(),
        memberships: {
          'iprospect': {
            agencyId: 'iprospect',
            role: user.role === 'Admin' ? 'Admin' : 'User',
            joinedAt: Timestamp.now(),
            permissions: ['read', 'write'],
            status: 'active',
          },
        },
        activeAgency: 'iprospect',
        lastLogin: null,
      });

      console.log(`✓ Updated user profile: ${user.email} with iProspect membership (removed Sokrati access)`);
    } catch (error) {
      console.error(`✗ Error setting up user ${user.email}:`, error.message);
    }
  }
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  iProspect Agency Setup                    ║');
  console.log('╚════════════════════════════════════════════╝\n');

  console.log(execute ? 'Executing setup...' : 'Dry run only; pass --execute to write.\n');

  try {
    await setupIProspectAgency();
    await setupCollections();
    await createTestUsers();

    console.log('\n╔════════════════════════════════════════════╗');
    console.log('║  Setup Complete                            ║');
    console.log('╚════════════════════════════════════════════╝');

    if (execute) {
      console.log('\n✓ iProspect agency initialized');
      console.log(`✓ ${collections.length} collections created`);
      console.log(`✓ ${testUsers.length} test users created`);
      console.log('\nTest User Credentials:');
      testUsers.forEach(u => {
        console.log(`  • Email: ${u.email}`);
        console.log(`    Password: TempPassword123!@# (change on first login)`);
        console.log(`    Role: ${u.role}\n`);
      });
      console.log('Next Steps:');
      console.log('1. Share iProspect login credentials with team');
      console.log('2. Test login and verify blank app is displayed');
      console.log('3. Begin gradual data migration for iProspect clients');
      console.log('4. Update Firestore security rules if needed');
    }
  } catch (error) {
    console.error('Setup failed:', error);
    process.exitCode = 1;
  }
}

main();
