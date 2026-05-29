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
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
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

/** Rimuove ricorsivamente le chiavi con valore undefined (Firestore non le accetta). */
function removeUndefined(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(removeUndefined)
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, removeUndefined(v)])
    )
  }
  return obj
}

/**
 * Rimuove i dati base64 delle foto prima di scrivere su Firestore.
 * Le foto sono già sincronizzate via Cloudinary (URL in Photo.url).
 * I dati base64 restano solo in localStorage per la visualizzazione offline.
 */
function stripPhotosForFirestore(data: StoreData): Record<string, unknown> {
  const stripped = {
    ...data,
    activities: data.activities.map(a => ({
      ...a,
      photos:        a.photos?.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })) ?? [],
      receiptPhotos: a.receiptPhotos?.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })) ?? [],
    })),
    sitePhotos: data.sitePhotos
      ? Object.fromEntries(
          Object.entries(data.sitePhotos).map(([date, photos]) => [
            date,
            photos.map(p => ({ ts: p.ts, url: p.url ?? '', data: '' })),
          ])
        )
      : null,
  }
  return removeUndefined(stripped) as Record<string, unknown>
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

/** Elemento nella lista workspace disponibili per un utente. */
export interface WorkspaceListItem {
  id:          string
  name:        string
  ownerId:     string
  ownerEmail:  string
  memberCount: number
  isPending:   boolean
}

/**
 * Recupera tutti i workspace accessibili a un utente.
 * Le due query vengono eseguite in modo indipendente: la query su
 * pendingInvites può fallire con PERMISSION_DENIED (le regole Firestore
 * richiedono che l'utente sia già membro per leggere un workspace), quindi
 * viene gestita separatamente senza bloccare la query principale su members.
 */
export async function fetchUserWorkspaces(
  uid:   string,
  email: string,
): Promise<WorkspaceListItem[]> {
  const db  = getFirebaseDb()
  const col = collection(db, 'workspaces')

  const results: WorkspaceListItem[] = []
  const seen    = new Set<string>()

  function addSnap(snap: Awaited<ReturnType<typeof getDocs>>, isPendingFallback: boolean): void {
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue
      seen.add(d.id)
      const data = d.data() as Record<string, any>
      results.push({
        id:          d.id,
        name:        data['name']       as string,
        ownerId:     data['ownerId']    as string,
        ownerEmail:  data['ownerEmail'] as string,
        memberCount: ((data['members'] ?? []) as string[]).length,
        isPending:   isPendingFallback || !((data['members'] ?? []) as string[]).includes(uid),
      })
    }
  }

  // Query 1 — workspace dove l'utente è già membro.
  // La regola "allow read: if isMember()" è soddisfatta da questo filtro,
  // quindi Firestore la permette senza errori.
  try {
    const snap = await getDocs(query(col, where('members', 'array-contains', uid)))
    addSnap(snap, false)
  } catch (e) {
    console.error('[fetchUserWorkspaces] members query failed:', e)
  }

  // Query 2 — workspace con invito pendente per l'email dell'utente.
  // Richiede che le regole Firestore includano isIncomingMember() nella read rule.
  // Se fallisce, l'utente può ancora usare il flusso "codice invito" manuale.
  try {
    const snap = await getDocs(query(col, where('pendingInvites', 'array-contains', email.toLowerCase())))
    addSnap(snap, true)
  } catch (e) {
    console.warn('[fetchUserWorkspaces] pendingInvites query failed (regole non deployate?):', e)
  }

  return results
}

/**
 * Accetta un invito pendente: aggiunge l'utente ai membri e rimuove
 * la sua email dagli inviti pendenti.
 */
export async function joinWorkspace(
  workspaceId: string,
  uid:         string,
  email:       string,
): Promise<void> {
  await updateDoc(workspaceRef(workspaceId), {
    members:        arrayUnion(uid),
    memberEmails:   arrayUnion(email.toLowerCase()),
    pendingInvites: arrayRemove(email.toLowerCase()),
  })
}

/**
 * Elimina un workspace e tutti i suoi dati:
 *   1. Documento store  → /workspaces/{wid}/store/main
 *   2. Documento radice → /workspaces/{wid}
 * (Firestore non elimina le subcollection automaticamente.)
 * Solo il proprietario può chiamare questa funzione; le regole lo impongono.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  const db = getFirebaseDb()
  await deleteDoc(doc(db, 'workspaces', workspaceId, 'store', 'main'))
  await deleteDoc(doc(db, 'workspaces', workspaceId))
}

/**
 * Entra in un workspace tramite codice (ID workspace) verificando che l'utente
 * abbia un invito pendente. Usato come fallback quando la query automatica
 * su pendingInvites non è disponibile (regole non deployate).
 *
 * La regola Firestore "allow update: if isIncomingMember()" permette l'updateDoc
 * solo se l'email è in pendingInvites — quindi è un controllo sicuro.
 */
export async function joinWorkspaceByCode(
  workspaceId: string,
  uid:         string,
  email:       string,
): Promise<{ success: boolean; name?: string }> {
  try {
    await updateDoc(workspaceRef(workspaceId), {
      members:        arrayUnion(uid),
      memberEmails:   arrayUnion(email.toLowerCase()),
      pendingInvites: arrayRemove(email.toLowerCase()),
    })
    // Ora l'utente è membro → fetchWorkspace funzionerà
    const ws = await fetchWorkspace(workspaceId)
    return { success: true, name: ws?.name }
  } catch {
    return { success: false }
  }
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
 * merge:true preserva i campi non presenti nel payload (es. workOrders scritti da
 * un altro account prima che questo client li ricevesse via onSnapshot).
 */
export async function pushStore(workspaceId: string, data: StoreData): Promise<void> {
  const payload = stripPhotosForFirestore(data)
  await setDoc(storeRef(workspaceId), payload, { merge: true })
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
      // Chiama sempre onData: se il documento non esiste ancora passa un
      // store vuoto così syncStatus diventa 'ok' e la prima scrittura lo crea.
      onData(snap.exists()
        ? snap.data() as StoreData
        : { activities: [], lastModified: Date.now() })
    },
    (err) => onError?.(err),
  )
}
