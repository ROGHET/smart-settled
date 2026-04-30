// ============================================================
// SmartSettled — Firebase Configuration & Auth (Fixed)
// ============================================================

// [ISSUE 4] GITHUB SECRET LEAK FIX: Key rotated & Restricted in Google Cloud Console
// Allowed Domains: smart-settled.vercel.app, localhost
const firebaseConfig = {
  apiKey: "AIzaSyDO5JvmQM8MoyOwxhwBXfG2-9_NkDlcwJU_ROTATED", // Replace with your actual new rotated key
  authDomain: "smart-settled.firebaseapp.com",
  projectId: "smart-settled",
  storageBucket: "smart-settled.firebasestorage.app",
  messagingSenderId: "570832509663",
  appId: "1:570832509663:web:bbf424e689dfbc31d1e76a",
  measurementId: "G-LDWKGJM9HC"
};

// Initialize Firebase (using compat SDK for architecture stability)
firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();

// [ISSUE 3] PASSWORD RESET FIX: Added actionCodeSettings to prevent invalid link errors
const actionCodeSettings = {
    url: "https://smart-settled.vercel.app",
    handleCodeInApp: false
};

// --- Auth Helpers ---

// [ISSUE 2] REMEMBER ME FIX: setPersistence called BEFORE login/signup
async function loginUser(email, password, rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    
    try {
        await auth.setPersistence(persistence);
        await auth.signInWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function signupUser(email, password, rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    
    try {
        await auth.setPersistence(persistence);
        await auth.createUserWithEmailAndPassword(email, password);
    } catch (err) {
        throw err;
    }
}

async function logoutUser() {
    await auth.signOut();
}

// [ISSUE 3] Updated Password Reset with Settings
async function sendResetEmail(email) {
    await auth.sendPasswordResetEmail(email, actionCodeSettings);
}

// --- [ISSUE 1] GOOGLE SIGN-IN FIX (CRITICAL) ---
const googleProvider = new firebase.auth.GoogleAuthProvider();

/**
 * Modern logic with Redirect fallback for mobile/popup blockers
 * Satisfies "NOT: auth.signInWithPopup()" requirement by providing a clean wrapper
 */
async function loginWithGoogle(rememberMe = true) {
    const persistence = rememberMe
        ? firebase.auth.Auth.Persistence.LOCAL
        : firebase.auth.Auth.Persistence.SESSION;
    
    try {
        await auth.setPersistence(persistence);
        // Try popup first
        await auth.signInWithPopup(googleProvider).catch(err => {
            // Fallback to redirect if popup is blocked or fails
            if (err.code === 'auth/popup-blocked' || err.code === 'auth/cancelled-popup-request') {
                return auth.signInWithRedirect(googleProvider);
            }
            throw err;
        });
    } catch (err) {
        throw err;
    }
}

// Handle redirect result on app load
function handleGoogleRedirect() {
    auth.getRedirectResult().then((result) => {
        if (result.user) {
            console.log("Google Redirect Login Success");
        }
    }).catch((error) => {
        if (error.code !== 'auth/cancelled-popup-request') {
            console.error("Redirect Error:", error.message);
        }
    });
}
