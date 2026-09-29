/*
 * Tags legacy root-level Sokrati documents and copies them to agencies/sokrati.
 *
 * Usage (dry run): npm --prefix functions run migrate:sokrati
 * Usage (write):   npm --prefix functions run migrate:sokrati -- --execute
 *
 * The script adds agencyId: "sokrati" to both the legacy and copied documents,
 * and never deletes legacy documents. Verify document counts and release the
 * agency-scoped client before disabling legacy access.
 */
const {initializeApp, applicationDefault, getApps} = require('firebase-admin/app');
const {getFirestore} = require('firebase-admin/firestore');

const collections = [
  'clients', 'leads', 'kpis', 'kpiWeeklyData', 'kpiDefinitions', 'channels',
  'monthlySpends', 'weeklySpends', 'businessSnapshots', 'actionItems',
  'wbrEntries', 'pageManagement', 'clusterInsights',
];
const execute = process.argv.includes('--execute');

if (!getApps().length) initializeApp({credential: applicationDefault()});
const db = getFirestore();

async function migrateCollection(collectionName) {
  const source = await db.collection(collectionName).get();
  console.log(`${collectionName}: ${source.size} document(s)`);

  if (!execute || source.empty) return source.size;

  const docs = source.docs;
  for (let index = 0; index < docs.length; index += 400) {
    const batch = db.batch();
    for (const snapshot of docs.slice(index, index + 400)) {
      const data = {...snapshot.data(), agencyId: "sokrati"};
      // Preserve a tenant identifier on legacy documents throughout the
      // transition, not only in the target collection path.
      batch.update(snapshot.ref, {agencyId: "sokrati"});
      batch.set(db.doc(`agencies/sokrati/${collectionName}/${snapshot.id}`), data);
    }
    await batch.commit();
  }

  const copied = await db.collection(`agencies/sokrati/${collectionName}`).count().get();
  if (copied.data().count < source.size) {
    throw new Error(`${collectionName}: copied ${copied.data().count} of ${source.size} documents`);
  }
  return source.size;
}

async function main() {
  console.log(execute ? 'Starting Sokrati migration.' : 'Dry run only; pass --execute to write.');
  let total = 0;
  for (const collectionName of collections) total += await migrateCollection(collectionName);
  console.log(`${execute ? 'Copied' : 'Found'} ${total} document(s) across ${collections.length} collections.`);
}

main().catch((error) => {
  console.error('Migration failed:', error);
  process.exitCode = 1;
});
