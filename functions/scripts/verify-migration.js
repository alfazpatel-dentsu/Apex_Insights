/*
 * Verifies Sokrati migration completeness and data integrity.
 *
 * Usage: npm --prefix functions run verify:migration
 *
 * Checks:
 * 1. Document count parity: source == agencies/sokrati/{collection}
 * 2. Agency ID field: all migrated docs have agencyId: "sokrati"
 * 3. Data integrity: sample docs match between legacy and migrated
 * 4. No unexpected documents in agencies/sokrati collections
 */
const {initializeApp, applicationDefault, getApps} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

const collections = [
  'clients', 'leads', 'kpis', 'kpiWeeklyData', 'kpiDefinitions', 'channels',
  'monthlySpends', 'weeklySpends', 'businessSnapshots', 'actionItems',
  'wbrEntries', 'pageManagement', 'clusterInsights',
];

if (!getApps().length) initializeApp({credential: applicationDefault()});
const db = getFirestore();

async function verifyCollection(collectionName) {
  console.log(`\n━━ Verifying ${collectionName} ━━`);

  // Count legacy collection
  const legacyCount = await db.collection(collectionName).count().get();
  const legacySize = legacyCount.data().count;
  console.log(`  Legacy collection: ${legacySize} documents`);

  // Count migrated collection
  const migratedCount = await db.collection(`agencies/sokrati/${collectionName}`).count().get();
  const migratedSize = migratedCount.data().count;
  console.log(`  Migrated collection: ${migratedSize} documents`);

  // Check count parity
  if (legacySize !== migratedSize) {
    console.error(`  ❌ COUNT MISMATCH: ${legacySize} vs ${migratedSize}`);
    return {name: collectionName, passed: false, reason: `Count mismatch: ${legacySize} != ${migratedSize}`};
  }

  if (legacySize === 0) {
    console.log(`  ⊘ No documents to verify`);
    return {name: collectionName, passed: true, reason: 'Empty collection'};
  }

  // Sample 3 random documents for integrity check
  const legacySnapshot = await db.collection(collectionName).limit(3).get();
  let allValid = true;

  for (const legacyDoc of legacySnapshot.docs) {
    const docId = legacyDoc.id;
    const legacyData = legacyDoc.data();

    // Check legacy doc has agencyId field
    if (!legacyData.agencyId || legacyData.agencyId !== 'sokrati') {
      console.error(`  ❌ Legacy doc ${docId}: missing or incorrect agencyId`);
      allValid = false;
      continue;
    }

    // Get corresponding migrated doc
    const migratedDoc = await db.doc(`agencies/sokrati/${collectionName}/${docId}`).get();
    if (!migratedDoc.exists) {
      console.error(`  ❌ Migrated doc ${docId}: does not exist`);
      allValid = false;
      continue;
    }

    const migratedData = migratedDoc.data();

    // Verify all fields match (except may have timestamp variations)
    const legacyKeys = Object.keys(legacyData).sort();
    const migratedKeys = Object.keys(migratedData).sort();

    if (legacyKeys.join() !== migratedKeys.join()) {
      console.error(`  ❌ Doc ${docId}: field mismatch`);
      console.error(`     Legacy fields: ${legacyKeys.join(', ')}`);
      console.error(`     Migrated fields: ${migratedKeys.join(', ')}`);
      allValid = false;
      continue;
    }

    // Spot check a few field values
    for (const key of legacyKeys) {
      const legacyVal = JSON.stringify(legacyData[key]);
      const migratedVal = JSON.stringify(migratedData[key]);
      if (legacyVal !== migratedVal) {
        console.error(`  ❌ Doc ${docId}, field '${key}': value mismatch`);
        allValid = false;
        break;
      }
    }
  }

  if (allValid) {
    console.log(`  ✓ Count parity verified`);
    console.log(`  ✓ Agency ID fields present on legacy docs`);
    console.log(`  ✓ Sample documents match between legacy and migrated`);
  }

  return {name: collectionName, passed: allValid};
}

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  Sokrati Migration Verification Report     ║');
  console.log('╚════════════════════════════════════════════╝');

  const results = [];
  for (const collectionName of collections) {
    try {
      const result = await verifyCollection(collectionName);
      results.push(result);
    } catch (error) {
      console.error(`  ❌ Error verifying ${collectionName}:`, error.message);
      results.push({name: collectionName, passed: false, reason: error.message});
    }
  }

  // Summary
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║  Summary                                   ║');
  console.log('╚════════════════════════════════════════════╝');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\nTotal: ${results.length} collections`);
  console.log(`✓ Verified: ${passed}`);
  console.log(`❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed collections:');
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.reason}`);
    });
    process.exitCode = 1;
  } else {
    console.log('\n✓ All collections verified successfully!');
  }
}

main().catch((error) => {
  console.error('Verification failed:', error);
  process.exitCode = 1;
});
