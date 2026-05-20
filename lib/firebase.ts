/**
 * lib/firebase.ts – Singleton Firebase (Auth + Firestore)
 * ─────────────────────────────────────────────────────────────────────
 * Inizializza Firebase una sola volta e fornisce i getter per
 * auth e db usati da tutti i services.
 *
 * NOTE: Firebase Storage NON è incluso (si usa Cloudinary per le foto).
 */

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth,      type Auth }       from 'firebase/auth'
import { getFirestore, type Firestore }  from 'firebase/firestore'

let _app: FirebaseApp
let _auth: Auth
let _db:   Firestore

export interface FirebaseConfig {
  apiKey:            string
  authDomain:        string
  projectId:         string
  storageBucket:     string
  messagingSenderId: string
  appId:             string
}

export function initFirebase(config: FirebaseConfig): void {
  if (getApps().length) return   // già inizializzato (es. hot-reload)
  _app  = initializeApp(config)
  _auth = getAuth(_app)
  _db   = getFirestore(_app)
}

export const getFirebaseAuth = (): Auth      => _auth
export const getFirebaseDb   = (): Firestore => _db
