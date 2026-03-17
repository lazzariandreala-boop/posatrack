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
import { useGistSync } from '~/composables/useGistSync'

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

/** Chiave localStorage */
const STORE_KEY = 'pt_v3'

/**
 * Contatore reattivo: si incrementa ad ogni scrittura su localStorage.
 * Tutte le funzioni di lettura lo "leggono" per registrarsi come dipendenze
 * di Vue computed/watch, che vengono così ri-eseguite automaticamente
 * dopo ogni modifica (add, update, remove, addPhoto, …).
 */
const _version = ref(0)

/** Timer debounce per il push su Gist */
let _pushTimer: ReturnType<typeof setTimeout> | null = null

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

  /** Serializza e salva i dati nel localStorage, poi invalida le computed e schedula il push. */
  function _save(data: StoreData): void {
    data.lastModified = Date.now()
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data))
      _version.value++ // notifica Vue che i dati sono cambiati
      _schedulePush(data)
    } catch (e) {
      // QuotaExceededError: localStorage pieno (probabile per le foto base64)
      console.error('[useStore] localStorage pieno:', e)
      alert('Attenzione: memoria locale quasi esaurita. Esporta i dati e cancella le attività vecchie.')
    }
  }

  /**
   * Schedula un push su Gist con debounce di 2s.
   * Annulla il push precedente se ancora in attesa.
   */
  function _schedulePush(data: StoreData): void {
    if (_pushTimer) clearTimeout(_pushTimer)
    _pushTimer = setTimeout(() => {
      if (gistSync.isConfigured()) {
        gistSync.push(data)
      }
    }, 2000)
  }

  // ─────────────────────────────────────────────────────────────────────
  // PUBLIC – Sync iniziale
  // ─────────────────────────────────────────────────────────────────────

  /**
   * Da chiamare una sola volta al mount dell'app.
   * Confronta i dati locali con il Gist remoto tramite lastModified:
   *   - remoto più recente → sovrascrive localStorage e aggiorna la UI
   *   - locale più recente → push dei dati locali sul Gist
   *   - nessuna config Gist → no-op
   */
  async function initSync(): Promise<void> {
    if (!gistSync.isConfigured()) return

    const remote = await gistSync.pull()
    if (!remote) return // errore di rete o config invalida

    try {
      const rawLocal = localStorage.getItem(STORE_KEY)
      const local    = rawLocal ? JSON.parse(rawLocal) as StoreData : { activities: [], lastModified: 0 }
      const remoteTs = remote.lastModified ?? 0
      const localTs  = local.lastModified  ?? 0

      if (remoteTs > localTs) {
        // Il remoto è più aggiornato: aggiorna localStorage senza schedulare un push.
        // Le foto non sono mai presenti nel Gist (vengono strippate prima del push),
        // quindi le ri-inietta dal locale per non perderle.
        const merged = mergeLocalPhotos(remote, local)
        localStorage.setItem(STORE_KEY, JSON.stringify(merged))
        _version.value++
      } else if (localTs > remoteTs) {
        // Il locale è più aggiornato: carica subito sul Gist
        gistSync.push(local)
      }
      // Se uguali non serve fare nulla
    } catch (e) {
      console.error('[useStore] Errore durante initSync:', e)
    }
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

  /** Rimuove un'attività per id. */
  function remove(id: string): void {
    const data = _load()
    data.activities = data.activities.filter(a => a.id !== id)
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
