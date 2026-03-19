/**
 * ============================================================
 * useStore – Gestione persistenza localStorage + sync Gist
 * ============================================================
 * Tutte le operazioni CRUD sui dati dell'app passano da qui.
 * La chiave "pt_v3" contiene un JSON con struttura StoreData.
 *
 * Ogni scrittura locale viene anche schedulata per il push su
 * GitHub Gist (debounce 2s), se la sincronizzazione è configurata.
 *
 * Per avviare la sincronizzazione iniziale al mount dell'app
 * chiamare initSync() una sola volta.
 */

import { ref } from 'vue'
import type { Activity, WorkOrder, StoreData } from '~/types'
import { useGistSync }  from '~/composables/useGistSync'
import { useAppState }  from '~/composables/useAppState'

/**
 * Re-inietta le foto locali nel dataset remoto.
 * Le foto non vengono mai sincronizzate su Gist (per tenerlo sotto 1 MB),
 * quindi quando il remoto sovrascrive il locale è necessario preservarle.
 */
function mergeLocalPhotos(remote: StoreData, local: StoreData): StoreData {
  const localById = new Map(
    local.activities.map(a => [a.id, { photos: a.photos, receiptPhotos: a.receiptPhotos }])
  )

  const mergedActivities = remote.activities.map(a => {
    const localPhotos = localById.get(a.id)
    if (!localPhotos) return a
    return {
      ...a,
      // Usa le foto locali se il remoto le ha strippate (data === '')
      photos:        a.photos?.some(p => p.data)        ? a.photos        : (localPhotos.photos        ?? []),
      receiptPhotos: a.receiptPhotos?.some(p => p.data) ? a.receiptPhotos : (localPhotos.receiptPhotos ?? []),
    }
  })

  // Merge sitePhotos: usa le locali per ogni data dove il remoto ha foto strippate
  const remoteSite = remote.sitePhotos ?? {}
  const localSite  = local.sitePhotos  ?? {}
  const allDates   = new Set([...Object.keys(remoteSite), ...Object.keys(localSite)])
  const mergedSite: Record<string, import('~/types').Photo[]> = {}
  for (const date of allDates) {
    const rp = remoteSite[date] ?? []
    const lp = localSite[date]  ?? []
    mergedSite[date] = rp.some(p => p.data) ? rp : lp
  }

  return {
    ...remote,
    activities: mergedActivities,
    sitePhotos: Object.keys(mergedSite).length ? mergedSite : undefined,
  }
}

/**
 * Unisce i dati locali con quelli remoti: l'insieme di tutte le attività/ordini
 * viene preservato con una strategia di conflict resolution intelligente:
 *
 *   - Attività solo in locale → tenuta
 *   - Attività solo in remoto → aggiunta (nuovo device)
 *   - Attività in entrambi    → vince il locale, ECCETTO se il locale ha ancora
 *     il timer aperto (endTime === null) e il remoto l'ha già chiuso: in quel
 *     caso vince il remoto (timer stoppato sull'altro device).
 */
function mergeStoreData(local: StoreData, remote: StoreData): StoreData {
  // Tombstone: unione degli ID eliminati da entrambi i lati
  const deletedIds = new Set([
    ...(local.deletedActivityIds  ?? []),
    ...(remote.deletedActivityIds ?? []),
  ])

  const localActMap  = new Map(local.activities.map(a => [a.id, a]))
  const remoteActMap = new Map(remote.activities.map(a => [a.id, a]))
  const allActIds    = new Set([...localActMap.keys(), ...remoteActMap.keys()])

  const activities: Activity[] = []
  for (const id of allActIds) {
    if (deletedIds.has(id)) continue
    const l = localActMap.get(id)
    const r = remoteActMap.get(id)
    if (!l) {
      activities.push(r!)                                       // solo in remoto → aggiungi
    } else if (!r) {
      activities.push(l)                                        // solo in locale → tieni
    } else {
      // Conflict: il remoto vince se ha terminato un'attività che il locale ha ancora aperta
      activities.push(l.endTime === null && r.endTime !== null ? r : l)
    }
  }

  const localWoIds = new Set((local.workOrders ?? []).map(wo => wo.id))
  const workOrders = [
    ...(remote.workOrders ?? []).filter(wo => !localWoIds.has(wo.id)),
    ...(local.workOrders ?? []),
  ]

  const dayNotes  = { ...(remote.dayNotes  ?? {}), ...(local.dayNotes  ?? {}) }
  const dayCosts  = { ...(remote.dayCosts  ?? {}), ...(local.dayCosts  ?? {}) }

  return {
    ...remote,
    activities,
    workOrders:          workOrders.length ? workOrders : undefined,
    dayNotes:            Object.keys(dayNotes).length ? dayNotes : undefined,
    dayCosts:            Object.keys(dayCosts).length ? dayCosts : undefined,
    deletedActivityIds:  deletedIds.size ? [...deletedIds] : undefined,
    lastModified:        Date.now(),
  }
}

/** Chiave localStorage */
const STORE_KEY = 'pt_v3'

/**
 * Contatore reattivo: si incrementa ad ogni scrittura su localStorage.
 * Tutte le funzioni di lettura lo "leggono" per registrarsi come dipendenze
 * di Vue computed/watch, che vengono così ri-eseguite automaticamente
 * dopo ogni modifica (add, update, remove, addPhoto, …).
 */
const _version = ref(0)

/** Mutex: impedisce sync concorrenti che causano 409 Conflict su GitHub */
let _syncInProgress = false

export function useStore() {

  const gistSync = useGistSync()

  // ─────────────────────────────────────────────────────────────────────
  // PRIVATE – Helpers interni
  // ─────────────────────────────────────────────────────────────────────

  /** Carica e deserializza i dati. In caso di JSON corrotto ritorna struttura vuota. */
  function _load(): StoreData {
    // Legge _version per registrare questa funzione come dipendenza reattiva:
    // ogni volta che _version cambia (cioè dopo un _save), Vue invalida
    // le computed/watch che hanno chiamato _load() e le ri-esegue.
    void _version.value
    try {
      const raw = localStorage.getItem(STORE_KEY)
      return JSON.parse(raw || '{"activities":[]}') as StoreData
    } catch (e) {
      console.error('[useStore] Errore parsing localStorage:', e)
      return { activities: [] }
    }
  }

  /** Serializza e salva i dati nel localStorage e invalida le computed. */
  function _save(data: StoreData): void {
    data.lastModified = Date.now()
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data))
      _version.value++ // notifica Vue che i dati sono cambiati
    } catch (e) {
      // QuotaExceededError: localStorage pieno (probabile per le foto base64)
      console.error('[useStore] localStorage pieno:', e)
      alert('Attenzione: memoria locale quasi esaurita. Esporta i dati e cancella le attività vecchie.')
    }
  }

  /**
   * Pull → merge → push.
   * Scarica il Gist remoto, unisce i dati con quelli locali (union merge,
   * il remoto vince se ha terminato un'attività ancora aperta in locale)
   * e carica il risultato sul Gist.
   */
  async function syncNow(): Promise<void> {
    if (!gistSync.isConfigured()) return
    if (_syncInProgress) return   // evita 409 Conflict da chiamate concorrenti

    _syncInProgress = true
    const { showToast } = useAppState()
    try {
      const local  = _load()
      const remote = await gistSync.pull()

      if (!remote) {
        await gistSync.push(local)
        return
      }

      const merged = mergeLocalPhotos(mergeStoreData(local, remote), local)
      localStorage.setItem(STORE_KEY, JSON.stringify(merged))
      _version.value++
      const ok = await gistSync.push(merged)
      if (ok) showToast('Sincronizzazione completata')
    } finally {
      _syncInProgress = false
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // PUBLIC – Sync iniziale + timer giornaliero 23:59
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Schedula la sync automatica giornaliera alle 23:59.
   * Da chiamare una sola volta al mount dell'app.
   */
  function initSync(): void {
    const scheduleNext = () => {
      const now    = new Date()
      const target = new Date(now)
      target.setHours(23, 59, 0, 0)
      if (target <= now) target.setDate(target.getDate() + 1) // già passato → domani
      const ms = target.getTime() - now.getTime()
      setTimeout(() => {
        syncNow()
        scheduleNext() // riprogramma per il giorno dopo
      }, ms)
    }
    scheduleNext()
  }

  // ─────────────────────────────────────────────────────────────────────
  // PUBLIC – API
  // ─────────────────────────────────────────────────────────────────────

  /** Ritorna tutte le attività ordinate dal più recente al più vecchio. */
  function all(): Activity[] {
    return _load().activities.slice().sort((a, b) => b.startTime - a.startTime)
  }

  /** Ritorna le attività di una specifica data (YYYY-MM-DD). */
  function forDate(dateStr: string): Activity[] {
    return _load().activities.filter(a => a.date === dateStr)
  }

  /** Ritorna le attività nel range di date [fromDate, toDate] incluso. */
  function forRange(fromDate: string, toDate: string): Activity[] {
    return _load().activities.filter(a => a.date >= fromDate && a.date <= toDate)
  }

  /** Ritorna le date uniche che hanno almeno un'attività, ordine decrescente. */
  function allDates(): string[] {
    return [...new Set(_load().activities.map(a => a.date))].sort().reverse()
  }

  /** Ritorna l'eventuale attività non terminata (endTime = null) per la data. */
  function getOngoing(dateStr: string): Activity | null {
    return _load().activities.find(a => a.date === dateStr && !a.endTime) ?? null
  }

  /** Aggiunge una nuova attività all'array. */
  function add(activity: Activity): void {
    const data = _load()
    data.activities.push(activity)
    _save(data)
  }

  /** Aggiorna i campi di un'attività esistente tramite id. */
  function update(id: string, fields: Partial<Activity>): void {
    const data = _load()
    const idx  = data.activities.findIndex(a => a.id === id)
    if (idx !== -1) {
      Object.assign(data.activities[idx], fields)
      _save(data)
    }
  }

  /** Rimuove un'attività per id e registra il tombstone per evitare re-inserimenti dal sync. */
  function remove(id: string): void {
    const data = _load()
    data.activities = data.activities.filter(a => a.id !== id)
    if (!data.deletedActivityIds) data.deletedActivityIds = []
    if (!data.deletedActivityIds.includes(id)) data.deletedActivityIds.push(id)
    _save(data)
  }

  /** Aggiunge una foto (base64) all'array photos di un'attività. */
  function addPhoto(activityId: string, base64Data: string): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity) {
      if (!activity.photos) activity.photos = []
      activity.photos.push({ data: base64Data, ts: Date.now() })
      _save(data)
    }
  }

  /** Rimuove una foto (per indice) dall'array photos di un'attività. */
  function removePhoto(activityId: string, photoIndex: number): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity?.photos) {
      activity.photos.splice(photoIndex, 1)
      _save(data)
    }
  }

  /** Aggiunge una foto scontrino (base64) all'array receiptPhotos di un'attività. */
  function addReceiptPhoto(activityId: string, base64Data: string): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity) {
      if (!activity.receiptPhotos) activity.receiptPhotos = []
      activity.receiptPhotos.push({ data: base64Data, ts: Date.now() })
      _save(data)
    }
  }

  /** Rimuove una foto scontrino per indice da un'attività. */
  function removeReceiptPhoto(activityId: string, photoIndex: number): void {
    const data     = _load()
    const activity = data.activities.find(a => a.id === activityId)
    if (activity?.receiptPhotos) {
      activity.receiptPhotos.splice(photoIndex, 1)
      _save(data)
    }
  }

  // ── Costi effettivi giornalieri ─────────────────────────────────────────

  /** Ritorna i costi effettivi giornalieri per una data. */
  function getDayCosts(dateStr: string): { travelCostActual?: number; lunchCostActual?: number; materialCostActual?: number } {
    return _load().dayCosts?.[dateStr] ?? {}
  }

  /** Salva (o aggiorna) i costi effettivi giornalieri per una data. */
  function setDayCosts(dateStr: string, costs: { travelCostActual?: number; lunchCostActual?: number; materialCostActual?: number }): void {
    const data = _load()
    if (!data.dayCosts) data.dayCosts = {}
    data.dayCosts[dateStr] = { ...(data.dayCosts[dateStr] ?? {}), ...costs }
    _save(data)
  }

  // ── Note di cantiere giornaliere ────────────────────────────────────────

  /** Ritorna la nota di cantiere per una data. */
  function getDayNote(dateStr: string): string {
    return _load().dayNotes?.[dateStr] ?? ''
  }

  /** Salva (o aggiorna) la nota di cantiere per una data. */
  function setDayNote(dateStr: string, note: string): void {
    const data = _load()
    if (!data.dayNotes) data.dayNotes = {}
    data.dayNotes[dateStr] = note
    _save(data)
  }

  // ── Foto di cantiere giornaliere ────────────────────────────────────────

  /** Ritorna le foto di cantiere per una data. */
  function getSitePhotos(dateStr: string): import('~/types').Photo[] {
    return _load().sitePhotos?.[dateStr] ?? []
  }

  /** Aggiunge una foto di cantiere per una data. */
  function addSitePhoto(dateStr: string, base64Data: string): void {
    const data = _load()
    if (!data.sitePhotos) data.sitePhotos = {}
    if (!data.sitePhotos[dateStr]) data.sitePhotos[dateStr] = []
    data.sitePhotos[dateStr].push({ data: base64Data, ts: Date.now() })
    _save(data)
  }

  /** Rimuove una foto di cantiere per data e indice. */
  function removeSitePhoto(dateStr: string, photoIndex: number): void {
    const data = _load()
    if (data.sitePhotos?.[dateStr]) {
      data.sitePhotos[dateStr].splice(photoIndex, 1)
      _save(data)
    }
  }

  // ── Ordini di lavoro pianificati ────────────────────────────────────

  /** Ritorna tutti gli ordini di lavoro pianificati. */
  function getAllWorkOrders(): WorkOrder[] {
    void _version.value
    return _load().workOrders ?? []
  }

  /** Ritorna gli ordini di lavoro per una data specifica (YYYY-MM-DD). */
  function getWorkOrdersForDate(dateStr: string): WorkOrder[] {
    return getAllWorkOrders().filter(wo => wo.date === dateStr)
  }

  /** Aggiunge un ordine di lavoro. */
  function addWorkOrder(wo: WorkOrder): void {
    const data = _load()
    if (!data.workOrders) data.workOrders = []
    data.workOrders.push(wo)
    _save(data)
  }

  /** Aggiorna i campi di un ordine di lavoro esistente tramite id. */
  function updateWorkOrder(id: string, fields: Partial<WorkOrder>): void {
    const data = _load()
    const idx = (data.workOrders ?? []).findIndex(wo => wo.id === id)
    if (idx !== -1) {
      Object.assign(data.workOrders![idx], fields)
      _save(data)
    }
  }

  /** Rimuove un ordine di lavoro per id. */
  function removeWorkOrder(id: string): void {
    const data = _load()
    if (data.workOrders) {
      data.workOrders = data.workOrders.filter(wo => wo.id !== id)
      _save(data)
    }
  }

  /** Rimuove tutti gli ordini di lavoro appartenenti a un gruppo (lavorazione multi-giorno). */
  function removeWorkOrderGroup(groupId: string): void {
    const data = _load()
    if (data.workOrders) {
      data.workOrders = data.workOrders.filter(wo => wo.groupId !== groupId)
      _save(data)
    }
  }

  /**
   * Pre-crea attività pianificate per la giornata odierna da work orders non ancora attivati.
   * Ritorna il numero di attività create.
   * Da chiamare al mount del TimerView.
   */
  function autoCreatePlannedActivities(todayStr: string): number {
    const data = _load()
    const todayOrders = (data.workOrders ?? []).filter(wo => wo.date === todayStr)
    if (!todayOrders.length) return 0

    // Trova i work order già convertiti in attività pianificate per oggi
    const existingWoIds = new Set(
      data.activities
        .filter(a => a.date === todayStr && a.isPlanned && a.workOrderId)
        .map(a => a.workOrderId!)
    )

    let created = 0
    for (const wo of todayOrders) {
      if (!existingWoIds.has(wo.id)) {
        const nowTs = Date.now() + created // evita id duplicati se creati nello stesso ms
        const activity: Activity = {
          id:          `act_${nowTs}`,
          type:        wo.type,
          detail:      wo.detail,
          note:        wo.note,
          date:        todayStr,
          startTime:   nowTs,
          endTime:     nowTs,    // duration = 0: pre-compilata, non ancora avviata
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
    initSync,
    syncNow,
    syncStatus:   gistSync.syncStatus,
    lastSync:     gistSync.lastSync,
    isGistConfigured: gistSync.isConfigured,
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
    getDayCosts,
    setDayCosts,
    getDayNote,
    setDayNote,
    getSitePhotos,
    addSitePhoto,
    removeSitePhoto,
    getAllWorkOrders,
    getWorkOrdersForDate,
    addWorkOrder,
    updateWorkOrder,
    removeWorkOrder,
    removeWorkOrderGroup,
    autoCreatePlannedActivities,
  }
}
