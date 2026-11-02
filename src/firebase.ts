import { initializeApp } from 'firebase/app';
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth';
import { collection, doc, getDoc, getFirestore, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';

const config = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
export const firebaseConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
export const appId = import.meta.env.VITE_APP_ID || 'peixinho-app-id';
const app = firebaseConfigured ? initializeApp(config) : null;
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
export async function signIn(): Promise<User | null> {
  if (!auth) return null;
  await signInAnonymously(auth);
  return new Promise((resolve) => { const stop = onAuthStateChanged(auth!, (user) => { stop(); resolve(user); }); });
}
const room = (id: string) => {
  if (!db) throw new Error('Firebase não está configurado.');
  return doc(collection(db, 'artifacts', appId, 'public', 'data', 'rooms'), id);
};
export const watchRoom = (id: string, callback: (data: Record<string, unknown> | null) => void) => onSnapshot(room(id), (snap) => callback(snap.exists() ? snap.data() : null));
export const readRoom = async (id: string) => { const snap = await getDoc(room(id)); return snap.exists() ? snap.data() : null; };
export const createRoom = (id: string, data: object) => setDoc(room(id), data);
export const updateRoom = (id: string, data: object) => updateDoc(room(id), data);
