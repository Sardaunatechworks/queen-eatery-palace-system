// export_firestore.js
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const fs = require('fs');
const path = require('path');

// Target file locations
const serviceAccountPath = path.join(__dirname, 'serviceAccountKey.json.json');
const outputDir = path.join(__dirname, 'api', 'private', 'migration');

if (!fs.existsSync(serviceAccountPath)) {
  console.error(`[ERROR] Service account file not found. Please place your downloaded JSON at: ${serviceAccountPath}`);
  process.exit(1);
}

// Initialize Firebase Admin SDK using modern v11/v12 syntax
const serviceAccount = require(serviceAccountPath);
initializeApp({
  credential: cert(serviceAccount)
});

const db = getFirestore();
const auth = getAuth();

// Ensure output folder exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Helper to export a Firestore collection to a JSON file
async function exportCollection(collectionName, fileName) {
  console.log(`Fetching collection: ${collectionName}...`);
  try {
    const snapshot = await db.collection(collectionName).get();
    const documents = [];
    snapshot.forEach(doc => {
      documents.push({ id: doc.id, ...doc.data() });
    });
    fs.writeFileSync(
      path.join(outputDir, fileName),
      JSON.stringify(documents, null, 2)
    );
    console.log(`[SUCCESS] Saved ${documents.length} records to ${fileName}`);
  } catch (error) {
    console.error(`[ERROR] Failed to export ${collectionName}:`, error.message);
  }
}

// Helper to export Firebase Auth Users list
async function exportAuthUsers() {
  console.log("Fetching Firebase Auth users...");
  try {
    const users = [];
    let nextPageToken;
    do {
      const listUsersResult = await auth.listUsers(1000, nextPageToken);
      listUsersResult.users.forEach(userRecord => {
        users.push({
          uid: userRecord.uid,
          email: userRecord.email,
          name: userRecord.displayName || '',
          phone: userRecord.phoneNumber || '',
          status: userRecord.disabled ? 'suspended' : 'active',
          role: 'customer' // Default fallback role
        });
      });
      nextPageToken = listUsersResult.nextPageToken;
    } while (nextPageToken);

    // Merge custom roles from Firestore users collection if present
    try {
      const userSnapshot = await db.collection('users').get();
      const firestoreUsers = {};
      userSnapshot.forEach(doc => {
        firestoreUsers[doc.id] = doc.data();
      });

      users.forEach(u => {
        if (firestoreUsers[u.uid]) {
          u.role = firestoreUsers[u.uid].role || u.role;
          u.name = firestoreUsers[u.uid].name || u.name;
          u.phone = firestoreUsers[u.uid].phone || u.phone;
        }
      });
    } catch (e) {
      console.log("No custom user profile roles to merge, using defaults.");
    }

    fs.writeFileSync(
      path.join(outputDir, 'users.json'),
      JSON.stringify(users, null, 2)
    );
    console.log(`[SUCCESS] Saved ${users.length} authenticated users to users.json`);
  } catch (error) {
    console.error('[ERROR] Failed to export auth users:', error.message);
  }
}

async function start() {
  await exportCollection('categories', 'categories.json');
  await exportCollection('menu', 'menu.json');
  await exportCollection('orders', 'orders.json');
  await exportCollection('cms_content', 'cms_content.json');
  await exportAuthUsers();
  console.log("\nFinished downloading all dumps! You can now run the migration seeder script:");
  console.log("php api/migrate_firestore.php");
}

start();
