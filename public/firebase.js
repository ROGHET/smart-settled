// ============================================================
// SmartSettled — Firebase Configuration & Auth
// ============================================================

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDO5JvmQM8MoyOwxhwBXfG2-9_NkDlcwJU",
  authDomain: "smart-settled.firebaseapp.com",
  projectId: "smart-settled",
  storageBucket: "smart-settled.firebasestorage.app",
  messagingSenderId: "570832509663",
  appId: "1:570832509663:web:bbf424e689dfbc31d1e76a",
  measurementId: "G-LDWKGJM9HC"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

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
