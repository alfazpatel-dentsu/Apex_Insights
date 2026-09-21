const { getApps, initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const APPLY = process.argv.includes("--apply");
const EMAIL_PATTERN = /^[^@]+@dentsu\.com$/i;

async function listUnauthorizedAuthUsers() {
  const auth = getAuth();
  const users = [];
  let pageToken;

  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.filter((user) => !EMAIL_PATTERN.test(user.email || "")));
    pageToken = page.pageToken;
  } while (pageToken);

  return users;
}

async function listUnauthorizedProfiles() {
  const snapshot = await getFirestore().collection("users").get();
  return snapshot.docs.filter((doc) => !EMAIL_PATTERN.test(String(doc.data().email || "")));
}

async function deleteProfileDocs(docs) {
  const db = getFirestore();
  for (let index = 0; index < docs.length; index += 400) {
    const batch = db.batch();
    docs.slice(index, index + 400).forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }
}

async function main() {
  if (!getApps().length) initializeApp();

  const [authUsers, profileDocs] = await Promise.all([
    listUnauthorizedAuthUsers(),
    listUnauthorizedProfiles(),
  ]);

  console.log(`Unauthorized Auth users: ${authUsers.length}`);
  authUsers.forEach((user) => console.log(`  ${user.uid} ${user.email || "(no email)"}`));
  console.log(`Unauthorized Firestore user profiles: ${profileDocs.length}`);
  profileDocs.forEach((doc) => console.log(`  ${doc.id} ${doc.data().email || "(no email)"}`));

  if (!APPLY) {
    console.log("\nDry run only. Re-run with --apply to delete these records.");
    return;
  }

  if (authUsers.length) {
    const result = await getAuth().deleteUsers(authUsers.map((user) => user.uid));
    if (result.failureCount) {
      throw new Error(`Failed to delete ${result.failureCount} Auth users.`);
    }
  }
  await deleteProfileDocs(profileDocs);
  console.log("\nDeletion complete.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
