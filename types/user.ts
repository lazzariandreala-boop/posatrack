/**
 * types/user.ts – Tipi utente e workspace
 * ─────────────────────────────────────────────────────────────────────
 * Separati da types/index.ts per chiarezza architetturale.
 */

/** Utente autenticato nell'app */
export interface AppUser {
  uid:         string
  email:       string
  displayName: string
  photoURL:    string | null
}

/** Workspace condiviso tra più utenti (salvato in Firestore) */
export interface Workspace {
  id:             string
  name:           string
  ownerId:        string
  ownerEmail:     string
  members:        string[]   // array di uid con accesso
  memberEmails:   string[]   // email corrispondenti (per display)
  pendingInvites: string[]   // email in attesa di accettazione
  createdAt:      number     // timestamp ms
}
