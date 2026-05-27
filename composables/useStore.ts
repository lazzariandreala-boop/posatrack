/**
 * composables/useStore.ts – Dati operativi con Firestore come unica fonte di verità
 * ─────────────────────────────────────────────────────────────────────────────
 * Architettura:
 *   - Firestore onSnapshot → aggiorna _data (ref reattivo in-memory)
 *   - Ogni write → muta _data + push immediato a Firestore (_commit)
 *   - Nessun localStorage per i dati operativi
 *   - Le foto base64 vivono solo in _data durante la sessione corrente;
 *     Firestore riceve solo gli URL Cloudinary (stripPhotosForFirestore)
 *
 * Ciclo di vita:
 *   initWorkspace(wid) → subscribeStore (onSnapshot) → _data aggiornato
 *   clearWorkspace()   → unsubscribe + reset _data
 */

import { ref } from 'vue'
import type { Unsubscribe } from 'firebase/firestore'
import type { Activity, WorkOrder, StoreData, Photo } from '~/types'
import {
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
// STATO MODULE-LEVEL (singleton, condiviso tra tutti i componenti)
// ─────────────────────────────────────────────────────────────────────────────

/** Store dati in-memory. Fonte di verità locale; popolato da onSnapshot. */
const _data      = ref<StoreData>({ activities: [] })
const syncStatus = ref<'idle' | 'syncing' | 'ok' | 'error'>('idle')
const lastSync   = ref<number | null>(null)

let _workspaceId:    string | null      = null
let _unsubFirestore: Unsubscribe | null = null

let _cloudName:    string = ''
let _uploadPreset: string = ''

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT
// ─────────────────────────────────────────────────────────────────────────────

export function useStore() {

  if (!_cloudName) {
    const config   = useRuntimeConfig()
    _cloudName    = (config.public.cloudinaryCloudName    as string) ?? ''
    _uploadPreset = (config.public.cloudinaryUploadPreset as string) ?? ''
  }

  // ── Write helper ─────────────────────────────────────────────────────────────
  // Persiste lo stato in-memory su Firestore. Chiamato dopo ogni mutazione.

  function _commit(): void {
    if (!_workspaceId) { console.warn('[useStore] _commit called but _workspaceId is null'); return }
    console.log('[useStore] pushing to Firestore, workspace:', _workspaceId, 'activities:', _data.value.activities.length)
    void pushStore(_workspaceId, _data.value)
      .then(() => console.log('[useStore] push OK'))
      .catch(e => console.error('[useStore] Firestore write FAILED:', e))
  }

  // ── Apply remote data ────────────────────────────────────────────────────────
  // Rimpiazza _data con i dati da Firestore preservando il base64 delle foto
  // in-flight (Cloudinary upload non ancora completato).

  function _applyRemote(remote: StoreData): void {
    const cur = _data.value
    const activities = remote.activities.map(r => {
      const loc = cur.activities.find(l => l.id === r.id)
      if (!loc) return r
      const photos = r.photos?.map(rp => {
        const lp = loc.photos?.find(p => p.ts === rp.ts)
        return (lp?.data && !rp.data) ? { ...rp, data: lp.data } : rp
      })
      const receiptPhotos = r.receiptPhotos?.map(rp => {
        const lp = loc.receiptPhotos?.find(p => p.ts === rp.ts)
        return (lp?.data && !rp.data) ? { ...rp, data: lp.data } : rp
      })
      return { ...r, photos, receiptPhotos }
    })

    // Preserva site photos base64 in-flight
    const curSite    = cur.sitePhotos  ?? {}
    const remoteSite = remote.sitePhotos ?? {}
    const mergedSite: Record<string, Photo[]> = { ...remoteSite }
    for (const [date, rPhotos] of Object.entries(remoteSite)) {
      const lPhotos = curSite[date] ?? []
      mergedSite[date] = rPhotos.map(rp => {
        const lp = lPhotos.find(p => p.ts === rp.ts)
        return (lp?.data && !rp.data) ? { ...rp, data: lp.data } : rp
      })
    }

    _data.value = {
      ...remote,
      activities,
      sitePhotos: Object.keys(mergedSite).length ? mergedSite : undefined,
    }
  }

  // ── Sync ─────────────────────────────────────────────────────────────────────

  /**
   * Inizializza il workspace: reset in-memory, poi avvia onSnapshot.
   * onSnapshot fires il primo evento quasi immediatamente con i dati correnti
   * da Firestore — funziona su qualsiasi device, anche in incognito.
   */
  async function initWorkspace(workspaceId: string): Promise<void> {
    if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null }

    _workspaceId     = workspaceId
    _data.value      = { activities: [] }
    syncStatus.value = 'syncing'
    console.log('[useStore] initWorkspace:', workspaceId)

    _unsubFirestore = subscribeStore(
      workspaceId,
      (remoteData) => {
        if (_workspaceId !== workspaceId) return
        console.log('[useStore] onSnapshot received, activities:', remoteData.activities?.length)
        _applyRemote(remoteData)
        syncStatus.value = 'ok'
        lastSync.value   = Date.now()
      },
      (err) => {
        if (_workspaceId !== workspaceId) return
        syncStatus.value = 'error'
        console.error('[useStore] Firestore listener error:', err)
      },
    )
  }

  /** Ferma il listener e resetta lo stato. */
  function clearWorkspace(): void {
    if (_unsubFirestore) { _unsubFirestore(); _unsubFirestore = null }
    _workspaceId     = null
    _data.value      = { activities: [] }
    syncStatus.value = 'idle'
  }

  /** Forza un push immediato dello stato corrente a Firestore. */
  function syncNow(): void {
    _commit()
  }

  // ── CRUD Attività ─────────────────────────────────────────────────────────────

  function all(): Activity[] {
    return _data.value.activities.slice().sort((a, b) => b.startTime - a.startTime)
  }

  function forDate(dateStr: string): Activity[] {
    return _data.value.activities.filter(a => a.date === dateStr)
  }

  function forRange(fromDate: string, toDate: string): Activity[] {
    return _data.value.activities.filter(a => a.date >= fromDate && a.date <= toDate)
  }

  function allDates(): string[] {
    return [...new Set(_data.value.activities.map(a => a.date))].sort().reverse()
  }

  function getOngoing(dateStr: string): Activity | null {
    return _data.value.activities.find(a => a.date === dateStr && !a.endTime) ?? null
  }

  function add(activity: Activity): void {
    _data.value.activities.push(activity)
    _commit()
  }

  function update(id: string, fields: Partial<Activity>): void {
    const idx = _data.value.activities.findIndex(a => a.id === id)
    if (idx !== -1) { Object.assign(_data.value.activities[idx], fields); _commit() }
  }

  function remove(id: string): void {
    _data.value.activities = _data.value.activities.filter(a => a.id !== id)
    if (!_data.value.deletedActivityIds) _data.value.deletedActivityIds = []
    if (!_data.value.deletedActivityIds.includes(id)) _data.value.deletedActivityIds.push(id)
    _commit()
  }

  // ── Foto attività ─────────────────────────────────────────────────────────────

  function addPhoto(activityId: string, base64Data: string): void {
    const activity = _data.value.activities.find(a => a.id === activityId)
    if (!activity) return
    if (!activity.photos) activity.photos = []
    const ts = Date.now()
    activity.photos.push({ data: base64Data, ts })
    _commit()  // pushStore strip_a il base64 prima di scrivere su Firestore

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      const wid = _workspaceId
      cloudUploadActivity(activityId, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          if (_workspaceId !== wid) return
          const act = _data.value.activities.find(x => x.id === activityId)
          const p   = act?.photos?.find(x => x.ts === ts)
          if (p) { p.url = url; _commit() }
        })
        .catch(e => console.warn('[useStore] Cloudinary upload failed:', e))
    }
  }

  function removePhoto(activityId: string, photoIndex: number): void {
    const activity = _data.value.activities.find(a => a.id === activityId)
    if (activity?.photos) { activity.photos.splice(photoIndex, 1); _commit() }
  }

  function addReceiptPhoto(activityId: string, base64Data: string): void {
    const activity = _data.value.activities.find(a => a.id === activityId)
    if (!activity) return
    if (!activity.receiptPhotos) activity.receiptPhotos = []
    const ts = Date.now()
    activity.receiptPhotos.push({ data: base64Data, ts })
    _commit()

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      const wid = _workspaceId
      cloudUploadReceipt(activityId, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          if (_workspaceId !== wid) return
          const act = _data.value.activities.find(x => x.id === activityId)
          const p   = act?.receiptPhotos?.find(x => x.ts === ts)
          if (p) { p.url = url; _commit() }
        })
        .catch(e => console.warn('[useStore] Cloudinary receipt upload failed:', e))
    }
  }

  function removeReceiptPhoto(activityId: string, photoIndex: number): void {
    const activity = _data.value.activities.find(a => a.id === activityId)
    if (activity?.receiptPhotos) { activity.receiptPhotos.splice(photoIndex, 1); _commit() }
  }

  // ── Costi giornalieri ─────────────────────────────────────────────────────────

  function getDayCosts(dateStr: string) {
    return _data.value.dayCosts?.[dateStr] ?? {}
  }

  function setDayCosts(dateStr: string, costs: { travelCostActual?: number; lunchCostActual?: number; materialCostActual?: number }): void {
    if (!_data.value.dayCosts) _data.value.dayCosts = {}
    _data.value.dayCosts[dateStr] = { ...(_data.value.dayCosts[dateStr] ?? {}), ...costs }
    _commit()
  }

  // ── Note giornaliere ──────────────────────────────────────────────────────────

  function getDayNote(dateStr: string): string {
    return _data.value.dayNotes?.[dateStr] ?? ''
  }

  function setDayNote(dateStr: string, note: string): void {
    if (!_data.value.dayNotes) _data.value.dayNotes = {}
    _data.value.dayNotes[dateStr] = note
    _commit()
  }

  // ── Foto cantiere ─────────────────────────────────────────────────────────────

  function getSitePhotos(dateStr: string): Photo[] {
    return _data.value.sitePhotos?.[dateStr] ?? []
  }

  function addSitePhoto(dateStr: string, base64Data: string): void {
    if (!_data.value.sitePhotos) _data.value.sitePhotos = {}
    if (!_data.value.sitePhotos[dateStr]) _data.value.sitePhotos[dateStr] = []
    const ts = Date.now()
    _data.value.sitePhotos[dateStr].push({ data: base64Data, ts })
    _commit()

    if (_workspaceId && isCloudinaryConfigured(_cloudName, _uploadPreset)) {
      const wid = _workspaceId
      cloudUploadSite(dateStr, ts, base64Data, _cloudName, _uploadPreset)
        .then(url => {
          if (_workspaceId !== wid) return
          const p = _data.value.sitePhotos?.[dateStr]?.find(x => x.ts === ts)
          if (p) { p.url = url; _commit() }
        })
        .catch(e => console.warn('[useStore] Cloudinary site upload failed:', e))
    }
  }

  function removeSitePhoto(dateStr: string, photoIndex: number): void {
    if (_data.value.sitePhotos?.[dateStr]) {
      _data.value.sitePhotos[dateStr].splice(photoIndex, 1)
      _commit()
    }
  }

  // ── Ordini di lavoro ──────────────────────────────────────────────────────────

  function getAllWorkOrders(): WorkOrder[] {
    return _data.value.workOrders ?? []
  }

  function getWorkOrdersForDate(dateStr: string): WorkOrder[] {
    return getAllWorkOrders().filter(wo => wo.date === dateStr)
  }

  function addWorkOrder(wo: WorkOrder): void {
    if (!_data.value.workOrders) _data.value.workOrders = []
    _data.value.workOrders.push(wo)
    _commit()
  }

  function updateWorkOrder(id: string, fields: Partial<WorkOrder>): void {
    const idx = (_data.value.workOrders ?? []).findIndex(wo => wo.id === id)
    if (idx !== -1) { Object.assign(_data.value.workOrders![idx], fields); _commit() }
  }

  function removeWorkOrder(id: string): void {
    if (_data.value.workOrders) {
      _data.value.workOrders = _data.value.workOrders.filter(wo => wo.id !== id)
      _commit()
    }
  }

  function removeWorkOrderGroup(groupId: string): void {
    if (_data.value.workOrders) {
      _data.value.workOrders = _data.value.workOrders.filter(wo => wo.groupId !== groupId)
      _commit()
    }
  }

  function autoCreatePlannedActivities(todayStr: string): number {
    const todayOrders = (_data.value.workOrders ?? []).filter(wo => wo.date === todayStr)
    if (!todayOrders.length) return 0

    const existingWoIds = new Set(
      _data.value.activities
        .filter(a => a.date === todayStr && a.isPlanned && a.workOrderId)
        .map(a => a.workOrderId!)
    )

    let created = 0
    for (const wo of todayOrders) {
      if (!existingWoIds.has(wo.id)) {
        const nowTs = Date.now() + created
        _data.value.activities.push({
          id:          `act_${nowTs}`,
          type:        wo.type,
          detail:      wo.detail,
          note:        wo.note,
          date:        todayStr,
          startTime:   nowTs,
          endTime:     nowTs,
          startLoc:    null,
          endLoc:      null,
          duration:    0,
          photos:      [],
          orderNumber: wo.orderNumber || undefined,
          isPlanned:   true,
          workOrderId: wo.id,
        })
        created++
      }
    }

    if (created > 0) _commit()
    return created
  }

  return {
    // Sync
    initWorkspace,
    clearWorkspace,
    syncNow,
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
