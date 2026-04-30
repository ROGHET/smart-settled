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

async function loginUser(email, password, rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
    try {
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function signupUser(email, password, rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
    try {
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function logoutUser() {
    await auth.signOut();
}

// --- Password Reset ---
async function sendResetEmail(email) {
    await auth.sendPasswordResetEmail(email);
}

// --- Google Sign-In ---
const googleProvider = new firebase.auth.GoogleAuthProvider();

async function loginWithGoogle(rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    await auth.setPersistence(persistence);
    await auth.signInWithPopup(googleProvider);
}
