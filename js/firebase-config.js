// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAh5FHHP919hepEDcviC1OmfYMuoIojTag",
  authDomain: "recipe-book-dca28.firebaseapp.com",
  projectId: "recipe-book-dca28",
  storageBucket: "recipe-book-dca28.firebasestorage.app",
  messagingSenderId: "300909653566",
  appId: "1:300909653566:web:0caa91239629c1fc62eb6f"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
// Optional — only needed for the "Grab ingredients from YouTube" button.
// Google Cloud Console -> APIs & Services -> enable "YouTube Data API v3"
// -> Credentials -> Create API key. Restrict it to your deployed domain
// (HTTP referrers) once you're done testing. Leave as REPLACE_ME to skip
// this feature entirely — the rest of the app works fine without it.
export const youtubeApiKey = "REPLACE_ME";


