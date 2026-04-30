// ============================================================
// SmartSettled — Firebase Configuration & Auth
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyDO5JvmQM8MoyOwxhwBXfG2-9_NkDlcwJU",
  authDomain: "smart-settled.firebaseapp.com",
  projectId: "smart-settled",
  storageBucket: "smart-settled.firebasestorage.app",
  messagingSenderId: "570832509663",
  appId: "1:570832509663:web:bbf424e689dfbc31d1e76a",
  measurementId: "G-LDWKGJM9HC"
};

// Initialize Firebase (compat SDK — loaded via CDN in index.html)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// --- Auth Helpers ---

async function loginUser(email, password) {
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function signupUser(email, password) {
    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function logoutUser() {
    await auth.signOut();
}
