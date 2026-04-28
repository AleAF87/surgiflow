import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyCQW7dxO_CWKv7H3to0yJHvZH7CovT3DDM",
  authDomain: "surgiflow-gestao.firebaseapp.com",
  databaseURL: "https://surgiflow-gestao-default-rtdb.firebaseio.com",
  projectId: "surgiflow-gestao",
  storageBucket: "surgiflow-gestao.firebasestorage.app",
  messagingSenderId: "988972359563",
  appId: "1:988972359563:web:dbd689aef9adf04503d98e"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const provider = new GoogleAuthProvider();
const db = getDatabase(app);

export { app, auth, db, provider };
