/**
 * services/auth.ts – Firebase Authentication
 * ─────────────────────────────────────────────────────────────────────
 * Funzioni pure (no Vue, no reattività) per gestire l'autenticazione.
 * Supporta: Email/Password, Google, Microsoft (se configurato in Azure).
 *
 * Usato da composables/useAuth.ts che aggiunge lo stato reattivo Vue.
 */

import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail,
  type User,
  type Unsubscribe,
} from 'firebase/auth'
import {
  doc,
  setDoc,
  getDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getFirebaseAuth, getFirebaseDb } from '~/lib/firebase'
import type { AppUser } from '~/types/user'

// ── Helpers ───────────────────────────────────────────────────────────

/** Converte un User Firebase in un AppUser semplificato. */
export function toAppUser(u: User): AppUser {
  return {
    uid:         u.uid,
    email:       u.email ?? '',
    displayName: u.displayName || u.email?.split('@')[0] || 'Utente',
    photoURL:    u.photoURL,
  }
}

/**
 * Crea il documento utente in Firestore al primo accesso.
 * Se esiste già, non sovrascrive nulla.
 */
export async function ensureUserDoc(u: User): Promise<void> {
  try {
    const db   = getFirebaseDb()
    const ref  = doc(db, 'users', u.uid)
    const snap = await getDoc(ref)
    if (!snap.exists()) {
      await setDoc(ref, {
        uid:         u.uid,
        email:       u.email,
        displayName: u.displayName ?? u.email,
        photoURL:    u.photoURL ?? null,
        createdAt:   serverTimestamp(),
      })
    }
  } catch (e) {
    // Non bloccante: l'utente può usare l'app anche se il documento
    // utente in Firestore non è stato creato (regole non ancora pubblicate).
    console.warn('[auth] ensureUserDoc fallito (verificare regole Firestore):', e)
  }
}

/** Mappa i codici errore Firebase in messaggi italiani leggibili. */
export function parseAuthError(e: unknown): string {
  const code = (e as { code?: string })?.code ?? ''
  const map: Record<string, string> = {
    'auth/user-not-found':          'Nessun account trovato con questa email.',
    'auth/wrong-password':          'Password errata.',
    'auth/invalid-credential':      'Email o password non corretti.',
    'auth/email-already-in-use':    'Questa email è già registrata.',
    'auth/weak-password':           'La password deve avere almeno 6 caratteri.',
    'auth/invalid-email':           'Formato email non valido.',
    'auth/popup-closed-by-user':    'Finestra di accesso chiusa.',
    'auth/network-request-failed':  'Errore di rete. Controlla la connessione.',
    'auth/too-many-requests':       'Troppi tentativi. Riprova tra qualche minuto.',
    'auth/cancelled-popup-request': 'Richiesta annullata.',
    'auth/account-exists-with-different-credential':
      'Esiste già un account con questa email. Accedi con il metodo originale.',
  }
  return map[code] ?? (code ? `Errore auth: ${code}` : 'Errore sconosciuto.')
}

// ── Listener ──────────────────────────────────────────────────────────

/**
 * Avvia il listener sullo stato di autenticazione Firebase.
 * Ritorna la funzione per cancellare il listener.
 */
export function subscribeAuthState(
  onUser:    (user: User) => void,
  onSignOut: ()           => void,
): Unsubscribe {
  return onAuthStateChanged(getFirebaseAuth(), (user) => {
    if (user) onUser(user)
    else      onSignOut()
  })
}

// ── Login / Registrazione ─────────────────────────────────────────────

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(getFirebaseAuth(), email, password)
  return cred.user
}

export async function registerWithEmail(
  email:       string,
  password:    string,
  displayName: string,
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(getFirebaseAuth(), email, password)
  const name = displayName.trim() || email.split('@')[0]
  await updateProfile(cred.user, { displayName: name })
  await ensureUserDoc(cred.user)
  return cred.user
}

export async function loginWithGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider()
  const cred     = await signInWithPopup(getFirebaseAuth(), provider)
  return cred.user
}

/**
 * Login con Microsoft.
 * Richiede Azure App Registration con:
 *   - Redirect URI: https://<your-domain>/__/auth/handler
 *   - Supporto account Microsoft personali + aziendali
 */
export async function loginWithMicrosoft(): Promise<User> {
  const provider = new OAuthProvider('microsoft.com')
  provider.setCustomParameters({ prompt: 'select_account' })
  const cred = await signInWithPopup(getFirebaseAuth(), provider)
  return cred.user
}

export async function logout(): Promise<void> {
  await signOut(getFirebaseAuth())
}

export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(getFirebaseAuth(), email)
}
