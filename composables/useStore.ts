/**
 * composables/useStore.ts – Gestione persistenza dati
 * ─────────────────────────────────────────────────────────────────────
 * Backend:
 *   - localStorage ("pt_v3"): cache locale per accesso istantaneo e offline
 *   - Firestore: cloud sync in tempo reale tra tutti i membri del workspace
 *   - Cloudinary: upload foto (URL permanenti in Photo.url)
 *
 * Flusso write:
 *   1. Scrittura immediata in localStorage → UI aggiornata istantaneamente
 *   2. Push asincrono su Firestore → altri dispositivi ricevono l'aggiornamento
 *
 * Flusso foto:
 *   1. base64 salvato in localStorage immediatamente (visualizzazione offline)
 *   2. Upload asincrono su Cloudinary → URL salvato in Photo.url
 *   3. URL aggiornato in localStorage e Firestore
 *
 * API pubblica: IDENTICA alla versione precedente (nessuna breaking change).
 */

import { ref } from 'vue'
import type { Unsubscribe } from 'firebase/firestore'
import type { Activity, WorkOrder, StoreData, Photo } from '~/types'
import { useAppState } from '~/composables/useAppState'
import {
  pullStore,
  pushStore,
  subscribeStore,
} from '~/services/firestore'
import {
  isCloudinaryConfigured,
  uploadActivityPhoto as cloudUploadActivity,
  uploadReceiptPhoto  as cloudUploadReceipt,
  uploadSitePhoto     as cloudUploadSite,
} from '~/services/cloudinary'

// ─────────────────────────────────────────────────────────────────────────────
// MERGE helpers
// ─────────────────────────────────────────────────────────────────────────────

function mergeLocalPhotos(remote: StoreData, local: StoreData): StoreData {
  const localById = new Map(
    local.activities.map(a => [a.id, { photos: a.photos, receiptPhotos: a.receiptPhotos }])
  )
  const mergedActivities = remote.activities.map(a => {
    const localPhotos = localById.get(a.id)
    if (!localPhotos) return a
    return {
      ...a,
      photos:        a.photos?.some(p => p.data || p.url) ? a.photos : (localPhotos.photos ?? []),
      receiptPhotos: a.receiptPhotos?.some(p => p.data || p.url) ? a.receiptPhotos : (localPhotos.receiptPhotos ?? []),
    }
  })

  const remoteSite = remote.sitePhotos ?? {}
  const localSite  = local.sitePhotos  ?? {}
  const allDates   = new Set([...Object.keys(remoteSite), ...Object.keys(localSite)])
  const mergedSite: Record<string, Photo[]> = {}
  for (const date of allDates) {
    const rp = remoteSite[date] ?? []
    const lp = localSite[date]  ?? []
    mergedSite[date] = rp.some(p => p.data || p.url) ? rp : lp
  }

  return {
    ...remote,
    activities: mergedActivities,
    sitePhotos: Object.keys(mergedSite).length ? mergedSite : undefined,
  }
}

function mergeStoreData(local: StoreData, remote: StoreData): StoreData {
  const deletedIds = new Set([
    ...(local.deletedActivityIds  ?? []),
    ...(remote.deletedActivityIds ?? []),
  ])

  const localActMap  = new Map(local.activities.map(a => [a.id, a]))
  const remoteActMap = new Map(remote.activities.map(a => [a.id, a]))
  const allActIds    = new Set([...localActMap.keys(), ...remoteActMap.keys()])

  // Migrate any planned placeholder activity that was stored with the old bug
  // (endTime === startTime, duration: 0). These should have endTime: null.
  function fixPlaceholder(a: Activity): Activity {
    if (a.isPlanned && a.duration === 0 && a.endTime !== null && a.endTime === a.startTime) {
      return { ...a, endTime: null }
    }
    return a
  }

  const activities: Activity[] = []
  for (const id of allActIds) {
    if (deletedIds.has(id)) continue
    const l = localActMap.get(id)
    const r = remoteActMap.get(id)
    if (!l) {
      activities.push(fixPlaceholder(r!))
    } else if (!r) {
      activities.push(fixPlaceholder(l))
    } else {
      const chosen = l.endTime === null && r.endTime !== null ? r : l
      activities.push(fixPlaceholder(chosen))
    }
  }

  const localWoIds = new Set((local.workOrders ?? []).map(wo => wo.id))
  const workOrders = [
    ...(remote.workOrders ?? []).filter(wo => !localWoIds.has(wo.id)),
    ...(local.workOrders ?? []),
  ]

  const dayNotes = { ...(remote.dayNotes ?? {}), ...(local.dayNotes ?? {}) }
  const dayCosts = { ...(remote.dayCosts ?? {}), ...(local.dayCosts ?? {}) }

  return {
    ...remote,
    activities,
    workOrders:         workOrders.length ? workOrders : undefined,
    dayNotes:           Object.keys(dayNotes).length ? dayNotes : undefined,
    dayCosts:           Object.keys(dayCosts).length ? dayCosts : undefined,
    deletedActivityIds: deletedIds.size ? [...deletedIds] : undefined,
    lastModified:       Date.now(),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// STATO MODULE-LEVEL (singleton condiviso tra tutti i componenti)
// ─────────────────────────────────────────────────────────────────────────────

const STORE_KEY = 'pt_v3'

const _version   = ref(0)
const syncStatus = ref<'idle' | 'syncing' | 'ok' | 'error'>('idle')
const lastSync   = ref<number | null>(null)

let _workspaceId:    string | null      = null
let _unsubFirestore: Unsubscribe | null = null

// Cloudinary config (letti al primo useStore() e cachati)
let _cloudName:    string = ''
let _uploadPreset: string = ''

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function useStore() {

  // Legge la config Cloudinary una sola volta
  if (!_cloudName) {
    const config   = useRuntimeConfig()
    _cloudName    = (config.public.cloudinaryCloudName    as string) ?? ''
    _uploadPreset = (config.public.cloudinaryUploadPreset as string) ?? ''
  }

  // ── Helpers locali ──────────────────────────────────────────────────────────

  function _load(): StoreData {
    void _version.value
    try {
      const raw = localStorage.getItem(STORE_KEY)
      return JSON.parse(raw || '{"activities":[]}') as StoreData
    } catch {
      return { activities: [] }
    }
  }

  function _save(data: StoreData): void {
    data.lastModified = Date.now()
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data))
      _version.value++
    } catch {
      alert('Attenzione: memoria locale quasi esaurita. Esporta i dati e cancella le attività vecchie.')
    }
    if (_workspaceId) {
      void pushStore(_workspaceId, data)
        .catch(e => console.warn('[useStore] Push Firestore fallito:', e))
    }
  }

  // ── Sync ───────────────────────────────────────────────────────────────────

  /**
   * Inizializza il workspace: pull iniziale + listener real-time Firestore.
   * Va chiamato da app.vue quando il workspace è disponibile.
   */
  async function initWorkspace(workspaceId: string): Promise<void> {
    if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null }

    _workspaceId     = workspaceId
    syncStatus.value = 'syncing'

    try {
      const remote = await pullStore(workspaceId)
      if (remote) {
        const local  = _load()
        const merged = mergeLocalPhotos(mergeStoreData(local, remote), local)
        localStorage.setItem(STORE_KEY, JSON.stringify(merged))
        _version.value++
        void pushStore(workspaceId, merged).catch(() => {})
      }
      syncStatus.value = 'ok'
      lastSync.value   = Date.now()
    } catch (e) {
      syncStatus.value = 'error'
      console.error('[useStore] Pull iniziale fallito:', e)
    }

    _unsubFirestore = subscribeStore(
      workspaceId,
      (remoteData) => {
        const local = _load()
        if (remoteData.lastModified && local.lastModified &&
            remoteData.lastModified <= local.lastModified) return
        const merged = mergeLocalPhotos(mergeStoreData(local, remoteData), local)
        localStorage.setItem(STORE_KEY, JSON.stringify(merged))
        _version.value++
        syncStatus.value = 'ok'
        lastSync.value   = Date.now()
      },
      (err) => {
        syncStatus.value = 'error'
        console.error('[useStore] Errore snapshot Firestore:', err)
      },
    )
  }

  /** Ferma il listener Firestore e pulisce il workspace corrente. */
  function clearWorkspace(): void {
    if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null }
    _workspaceId     = null
    syncStatus.value = 'idle'
  }

  // ── CRUD Attività ──────────────────────────────────────────────────────────

  function all(): Activity[] {
    return _load().activities.slice().sort((a, b) => b.startTime - a.startTime)
  }

  function forDate(dateStr: string): Activity[] {
    return _load().activities.filter(a => a.date === dateStr)
  }

  function forRange(fromDate: string, toDate: string): Activity[] {
    return _load().activities.filter(a => a.date >= fromDate && a.date <= toDate)
  }

  function allDates(): string[] {
    return [...new Set(_load().activities.map(a => a.date))].sort().reverse()
  }

  function getOngoing(dateStr: string): Activity | null {
    return _load().activities.find(
      a => a.date === dateStr && !a.endTime && !(a.isPlanned && a.duration === 0)
    ) ?? null
  }

  function add(activity: Activity): void {
    const data = _load()
    data.activities.push(activity)
    _save(data)
  }

  function update(id: string, fields: Partial<Activity>): void {
    const data = _load()
    const idx  = data.activities.findIndex(a => a.id === id)
    if (idx !== -1) { Object.assign(data.activities[idx], fields); _save(data) }
  }

  function remove(id: string): void {
    const data = _load()
    data.activities = data.activities.filter(a => a.id !== id)
    if (!data.deletedActivityIds) data.deletedActivityIds = []
    if (!data.deletedActivityIds.includes(id)) data.deletedActivityIds.push(id)
    _save(data)
  }

  // ── Foto attività ──────────────────────────────────────────────────────────

  function addPhoto(activityId: string, base64Data: string): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (!activity) return
    if (!activity.photos) activity.photos = []
    const ts = Date.now()
    activity.photos.push({ data: base64Data, ts })
    _save(data)

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      cloudUploadActivity(activityId, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          const d = _load()
          const a = d.activities.find(x => x.id === activityId)
          const p = a?.photos?.find(x => x.ts === ts)
          if (p) { p.url = url; _save(d) }
        })
        .catch(e => console.warn('[useStore] Upload foto Cloudinary fallito:', e))
    }
  }

  function removePhoto(activityId: string, photoIndex: number): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity?.photos) { activity.photos.splice(photoIndex, 1); _save(data) }
  }

  function addReceiptPhoto(activityId: string, base64Data: string): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (!activity) return
    if (!activity.receiptPhotos) activity.receiptPhotos = []
    const ts = Date.now()
    activity.receiptPhotos.push({ data: base64Data, ts })
    _save(data)

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      cloudUploadReceipt(activityId, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          const d = _load()
          const a = d.activities.find(x => x.id === activityId)
          const p = a?.receiptPhotos?.find(x => x.ts === ts)
          if (p) { p.url = url; _save(d) }
        })
        .catch(e => console.warn('[useStore] Upload scontrino Cloudinary fallito:', e))
    }
  }

  function removeReceiptPhoto(activityId: string, photoIndex: number): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity?.receiptPhotos) { activity.receiptPhotos.splice(photoIndex, 1); _save(data) }
  }

  // ── Costi giornalieri ──────────────────────────────────────────────────────

  function getDayCosts(dateStr: string) {
    return _load().dayCosts?.[dateStr] ?? {}
  }

  function setDayCosts(dateStr: string, costs: { travelCostActual?: number; lunchCostActual?: number; materialCostActual?: number }): void {
    const data = _load()
    if (!data.dayCosts) data.dayCosts = {}
    data.dayCosts[dateStr] = { ...(data.dayCosts[dateStr] ?? {}), ...costs }
    _save(data)
  }

  // ── Note giornaliere ───────────────────────────────────────────────────────

  function getDayNote(dateStr: string): string {
    return _load().dayNotes?.[dateStr] ?? ''
  }

  function setDayNote(dateStr: string, note: string): void {
    const data = _load()
    if (!data.dayNotes) data.dayNotes = {}
    data.dayNotes[dateStr] = note
    _save(data)
  }

  // ── Foto cantiere giornaliere ──────────────────────────────────────────────

  function getSitePhotos(dateStr: string): Photo[] {
    return _load().sitePhotos?.[dateStr] ?? []
  }

  function addSitePhoto(dateStr: string, base64Data: string): void {
    const data = _load()
    if (!data.sitePhotos) data.sitePhotos = {}
    if (!data.sitePhotos[dateStr]) data.sitePhotos[dateStr] = []
    const ts = Date.now()
    data.sitePhotos[dateStr].push({ data: base64Data, ts })
    _save(data)

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      cloudUploadSite(dateStr, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          const d = _load()
          const p = d.sitePhotos?.[dateStr]?.find(x => x.ts === ts)
          if (p) { p.url = url; _save(d) }
        })
        .catch(e => console.warn('[useStore] Upload foto cantiere Cloudinary fallito:', e))
    }
  }

  function removeSitePhoto(dateStr: string, photoIndex: number): void {
    const data = _load()
    if (data.sitePhotos?.[dateStr]) { data.sitePhotos[dateStr].splice(photoIndex, 1); _save(data) }
  }

  // ── Ordini di lavoro ───────────────────────────────────────────────────────

  function getAllWorkOrders(): WorkOrder[] {
    void _version.value
    return _load().workOrders ?? []
  }

  function getWorkOrdersForDate(dateStr: string): WorkOrder[] {
    return getAllWorkOrders().filter(wo => wo.date === dateStr)
  }

  function addWorkOrder(wo: WorkOrder): void {
    const data = _load()
    if (!data.workOrders) data.workOrders = []
    data.workOrders.push(wo)
    _save(data)
  }

  function updateWorkOrder(id: string, fields: Partial<WorkOrder>): void {
    const data = _load()
    const idx  = (data.workOrders ?? []).findIndex(wo => wo.id === id)
    if (idx !== -1) { Object.assign(data.workOrders![idx], fields); _save(data) }
  }

  function removeWorkOrder(id: string): void {
    const data = _load()
    if (data.workOrders) { data.workOrders = data.workOrders.filter(wo => wo.id !== id); _save(data) }
  }

  function removeWorkOrderGroup(groupId: string): void {
    const data = _load()
    if (data.workOrders) { data.workOrders = data.workOrders.filter(wo => wo.groupId !== groupId); _save(data) }
  }

  function autoCreatePlannedActivities(todayStr: string): number {
    const data        = _load()
    const todayOrders = (data.workOrders ?? []).filter(wo => wo.date === todayStr)
    if (!todayOrders.length) return 0

    const existingWoIds = new Set(
      data.activities
        .filter(a => a.date === todayStr && a.isPlanned && a.workOrderId)
        .map(a => a.workOrderId!)
    )

    let created = 0
    for (const wo of todayOrders) {
      if (!existingWoIds.has(wo.id)) {
        const nowTs = Date.now() + created
        const activity: Activity = {
          id:          `act_${nowTs}`,
          type:        wo.type,
          detail:      wo.detail,
          note:        wo.note,
          date:        todayStr,
          startTime:   nowTs,
          endTime:     null,
          startLoc:    null,
          endLoc:      null,
          duration:    0,
          photos:      [],
          orderNumber: wo.orderNumber || undefined,
          isPlanned:   true,
          workOrderId: wo.id,
        }
        data.activities.push(activity)
        created++
      }
    }

    if (created > 0) _save(data)
    return created
  }

  return {
    // Sync
    initWorkspace,
    clearWorkspace,
    syncStatus,
    lastSync,
    isGistConfigured: () => _workspaceId !== null,
    // Activities
    all,
    forDate,
    forRange,
    allDates,
    getOngoing,
    add,
    update,
    remove,
    addPhoto,
    removePhoto,
    addReceiptPhoto,
    removeReceiptPhoto,
    // Day data
    getDayCosts,
    setDayCosts,
    getDayNote,
    setDayNote,
    getSitePhotos,
    addSitePhoto,
    removeSitePhoto,
    // Work orders
    getAllWorkOrders,
    getWorkOrdersForDate,
    addWorkOrder,
    updateWorkOrder,
    removeWorkOrder,
    removeWorkOrderGroup,
    autoCreatePlannedActivities,
  }
}
