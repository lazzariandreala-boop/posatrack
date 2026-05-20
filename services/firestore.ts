/**
 * services/firestore.ts – Operazioni Firestore
 * ─────────────────────────────────────────────────────────────────────
 * Funzioni pure (no Vue) per leggere e scrivere su Firestore.
 *
 * Struttura dati in Firestore:
 *
 *   /users/{uid}
 *     uid, email, displayName, photoURL, createdAt
 *
 *   /workspaces/{workspaceId}
 *     name, ownerId, ownerEmail, members[], memberEmails[], pendingInvites[]
 *
 *   /workspaces/{workspaceId}/store/main
 *     StoreData (senza foto base64 – vengono strippate prima del push)
 *
 * Usato da: composables/useStore.ts, composables/useAuth.ts, app.vue, WorkspaceModal.vue
 */

import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  collection,
  onSnapshot,
  arrayUnion,
  arrayRemove,
  serverTimestamp,
  type Unsubscribe,
} from 'firebase/firestore'
import { getFirebaseDb } from '~/lib/firebase'
import type { StoreData } from '~/types'
import type { Workspace } from '~/types/user'

// ── Helpers privati ───────────────────────────────────────────────────

function workspaceRef(wid: string) {
  return doc(getFirebaseDb(), 'workspaces', wid)
}

function storeRef(wid: string) {
  return doc(getFirebaseDb(), 'workspaces', wid, 'store', 'main')
}

/**
 * Rimuove i dati base64 delle foto prima di scrivere su Firestore.
 * Le foto sono già sincronizzate via Cloudinary (URL in Photo.url).
 * I dati base64 restano solo in localStorage per la visualizzazione offline.
 */
function stripPhotosForFirestore(data: StoreData): StoreData {
  return {
    ...data,
    activities: data.activities.map(a => ({
      ...a,
      photos:        a.photos?.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })),
      receiptPhotos: a.receiptPhotos?.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })),
    })),
    sitePhotos: data.sitePhotos
      ? Object.fromEntries(
          Object.entries(data.sitePhotos).map(([date, photos]) => [
            date,
            photos.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })),
          ])
        )
      : undefined,
  }
}

// ── Workspace ─────────────────────────────────────────────────────────

/** Crea un nuovo workspace e ritorna il suo ID. */
export async function createWorkspace(
  name:       string,
  ownerUid:   string,
  ownerEmail: string,
): Promise<string> {
  const db  = getFirebaseDb()
  const ref = await addDoc(collection(db, 'workspaces'), {
    name,
    ownerId:        ownerUid,
    ownerEmail,
    members:        [ownerUid],
    memberEmails:   [ownerEmail.toLowerCase()],
    pendingInvites: [],
    createdAt:      serverTimestamp(),
  })
  // Crea il documento store vuoto
  await setDoc(doc(db, 'workspaces', ref.id, 'store', 'main'), {
    activities:   [],
    lastModified: Date.now(),
  })
  return ref.id
}

/** Recupera i dati di un workspace dato il suo ID. */
export async function fetchWorkspace(workspaceId: string): Promise<Workspace | null> {
  const snap = await getDoc(workspaceRef(workspaceId))
  if (!snap.exists()) return null
  const d = snap.data()
  return {
    id:             workspaceId,
    name:           d.name,
    ownerId:        d.ownerId,
    ownerEmail:     d.ownerEmail,
    members:        d.members        ?? [],
    memberEmails:   d.memberEmails   ?? [],
    pendingInvites: d.pendingInvites ?? [],
    createdAt:      d.createdAt?.toMillis?.() ?? Date.now(),
  }
}

/**
 * Recupera il workspace salvato in localStorage e verifica che l'utente
 * sia ancora membro. Ritorna null se non valido.
 */
export async function fetchSavedWorkspace(uid: string): Promise<Workspace | null> {
  const savedId = typeof localStorage !== 'undefined'
    ? localStorage.getItem('pt_workspace_id')
    : null
  if (!savedId) return null
  const ws = await fetchWorkspace(savedId)
  if (!ws || !ws.members.includes(uid)) return null
  return ws
}

/** Invita un utente al workspace tramite email. */
export async function inviteMember(workspaceId: string, email: string): Promise<void> {
  await updateDoc(workspaceRef(workspaceId), {
    pendingInvites: arrayUnion(email.toLowerCase()),
  })
}

/** Rimuove un membro dal workspace (solo il proprietario può farlo). */
export async function removeMember(
  workspaceId: string,
  uid:         string,
  email:       string,
): Promise<void> {
  await updateDoc(workspaceRef(workspaceId), {
    members:      arrayRemove(uid),
    memberEmails: arrayRemove(email.toLowerCase()),
  })
}

/**
 * Verifica se l'email dell'utente è tra gli inviti pendenti di un workspace
 * salvato e, in caso affermativo, aggiunge l'utente come membro.
 * Ritorna l'ID del workspace a cui si è unito, o null.
 */
export async function checkAndJoinPendingWorkspace(
  uid:   string,
  email: string,
): Promise<string | null> {
  const savedId = typeof localStorage !== 'undefined'
    ? localStorage.getItem('pt_pending_workspace')
    : null
  if (!savedId) return null

  const snap = await getDoc(workspaceRef(savedId)).catch(() => null)
  if (!snap?.exists()) return null

  const data = snap.data()
  if (data.pendingInvites?.includes(email.toLowerCase())) {
    await updateDoc(workspaceRef(savedId), {
      members:        arrayUnion(uid),
      memberEmails:   arrayUnion(email.toLowerCase()),
      pendingInvites: arrayRemove(email.toLowerCase()),
    })
    return savedId
  }
  return null
}

// ── Store dati ────────────────────────────────────────────────────────

/**
 * Scarica i dati del workspace da Firestore (pull unico).
 * Ritorna null se il documento non esiste ancora.
 */
export async function pullStore(workspaceId: string): Promise<StoreData | null> {
  const snap = await getDoc(storeRef(workspaceId))
  if (!snap.exists()) return null
  return snap.data() as StoreData
}

/**
 * Scrive i dati del workspace su Firestore.
 * Le foto base64 vengono strippate: in Firestore restano solo gli URL Cloudinary.
 */
export async function pushStore(workspaceId: string, data: StoreData): Promise<void> {
  const payload = stripPhotosForFirestore(data)
  await setDoc(storeRef(workspaceId), payload)
}

/**
 * Sottoscrive alle modifiche real-time del store del workspace.
 * Chiama onData ogni volta che i dati cambiano (da qualunque device).
 * Ritorna la funzione per cancellare la sottoscrizione.
 */
export function subscribeStore(
  workspaceId: string,
  onData:      (data: StoreData) => void,
  onError?:    (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    storeRef(workspaceId),
    (snap) => {
      if (snap.exists()) onData(snap.data() as StoreData)
    },
    (err) => onError?.(err),
  )
}
