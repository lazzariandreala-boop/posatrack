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
import type { Activity, StoreData } from '~/types'
import { useGistSync } from '~/composables/useGistSync'

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
        // Il remoto è più aggiornato: aggiorna localStorage senza schedulare un push
        localStorage.setItem(STORE_KEY, JSON.stringify(remote))
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
  }
}
