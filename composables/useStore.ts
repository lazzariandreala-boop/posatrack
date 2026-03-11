/**
 * ============================================================
 * useStore – Gestione persistenza localStorage
 * ============================================================
 * Tutte le operazioni CRUD sui dati dell'app passano da qui.
 * La chiave "pt_v3" contiene un JSON con struttura:
 *   { activities: [ ...Activity ] }
 *
 * NOTA SUI LIMITI:
 * localStorage ha un limite di ~5MB per dominio.
 * Le foto compresse (≈100KB l'una) ne occupano la maggior parte.
 * Con ~40 foto/giorno si possono memorizzare circa 2 mesi di dati.
 * Per uso a lungo termine, valutare @capacitor-community/sqlite.
 */

import { ref } from 'vue'
import type { Activity, StoreData } from '~/types'

/** Chiave localStorage */
const STORE_KEY = 'pt_v3'

/**
 * Contatore reattivo: si incrementa ad ogni scrittura su localStorage.
 * Tutte le funzioni di lettura lo "leggono" per registrarsi come dipendenze
 * di Vue computed/watch, che vengono così ri-eseguite automaticamente
 * dopo ogni modifica (add, update, remove, addPhoto, …).
 */
const _version = ref(0)

export function useStore() {

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

  /** Serializza e salva i dati nel localStorage, poi invalida le computed. */
  function _save(data: StoreData): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(data))
      _version.value++ // notifica Vue che i dati sono cambiati
    } catch (e) {
      // QuotaExceededError: localStorage pieno (probabile per le foto base64)
      console.error('[useStore] localStorage pieno:', e)
      alert('Attenzione: memoria locale quasi esaurita. Esporta i dati e cancella le attività vecchie.')
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
