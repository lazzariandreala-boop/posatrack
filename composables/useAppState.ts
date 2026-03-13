/**
 * ============================================================
 * useAppState – Stato globale dell'applicazione
 * ============================================================
 * Singleton a livello di modulo: tutti i componenti condividono
 * lo stesso oggetto reattivo. Gestisce:
 *   - Navigazione tra viste
 *   - Attività in corso
 *   - Stato modal inserimento attività
 *   - Stato overlay GPS loader
 *   - Toast notification
 *   - Lightbox foto
 *   - Rilevamento breakpoint desktop/mobile
 */

import { ref, computed } from 'vue'
import type { Activity, ActivityType, ViewName } from '~/types'

// ─────────────────────────────────────────────────────────────────────────────
// STATO (module-level, condiviso tra tutti i componenti)
// ─────────────────────────────────────────────────────────────────────────────

/** Vista attualmente attiva */
const currentView = ref<ViewName>('timer')

/** Attività in corso (null se nessuna è avviata) */
const currentActivity = ref<Activity | null>(null)

/** true se la viewport è ≥ 800px (desktop layout) */
const isDesktop = ref(false)

// ── Modal attività ───────────────────────────────────────────────────────────

/** true quando il modal di inserimento attività è aperto */
const isModalOpen = ref(false)

/** Tipo di attività del modal correntemente aperto */
const modalType = ref<ActivityType | null>(null)

/** Foto accumulate nel modal prima dell'avvio (base64[]) */
const modalPhotos = ref<string[]>([])

/**
 * Destinazione delle foto catturate dall'input file nascosto:
 * - "modal" → foto pre-attività (in attesa nel modal)
 * - activityId (string) → foto aggiunte post-avvio a un'attività esistente
 * - null → nessun target attivo
 */
const photoTarget = ref<string | null>(null)

// ── GPS Loader ───────────────────────────────────────────────────────────────

/** true durante l'acquisizione della posizione GPS */
const isGpsLoading = ref(false)

// ── Toast ────────────────────────────────────────────────────────────────────

/** Messaggio corrente del toast (stringa vuota = nascosto) */
const toastMessage = ref('')

/** Ref al timeout per auto-hide del toast */
let toastTimer: ReturnType<typeof setTimeout> | null = null

// ── Lightbox ─────────────────────────────────────────────────────────────────

/** true quando il lightbox foto è aperto */
const isLightboxOpen = ref(false)

/** src base64 dell'immagine mostrata nel lightbox */
const lightboxSrc = ref('')

// ── Gist Settings ─────────────────────────────────────────────────────────────

/** true quando il modal delle impostazioni Gist è aperto */
const isGistSettingsOpen = ref(false)

// ─────────────────────────────────────────────────────────────────────────────
// COMPUTED
// ─────────────────────────────────────────────────────────────────────────────

/** true se c'è un'attività attiva in corso */
const hasOngoing = computed(() => currentActivity.value !== null)

// ─────────────────────────────────────────────────────────────────────────────
// METODI
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Naviga alla vista specificata.
 * Su mobile viene ignorata qualunque navigazione diversa da "timer".
 */
function navigate(view: ViewName): void {
  if (!isDesktop.value && view !== 'timer') return
  currentView.value = view
}

/** Aggiorna il flag isDesktop in base alla larghezza viewport. */
function updateLayout(): void {
  isDesktop.value = window.innerWidth >= 800
  // Su mobile: se si era su summary/dashboard, torna al timer
  if (!isDesktop.value && currentView.value !== 'timer') {
    currentView.value = 'timer'
  }
}

// ── Toast ────────────────────────────────────────────────────────────────────

/**
 * Mostra un toast temporaneo con il messaggio dato.
 * Si nasconde automaticamente dopo `ms` millisecondi.
 */
function showToast(message: string, ms = 2600): void {
  toastMessage.value = message
  if (toastTimer !== null) clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { toastMessage.value = '' }, ms)
}

// ── GPS Loader ───────────────────────────────────────────────────────────────

/** Mostra o nasconde l'overlay di acquisizione GPS. */
function setGpsLoading(visible: boolean): void {
  isGpsLoading.value = visible
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

/** Apre il lightbox con l'immagine base64 specificata. */
function openLightbox(src: string): void {
  lightboxSrc.value   = src
  isLightboxOpen.value = true
}

/** Chiude il lightbox e libera la src dopo l'animazione. */
function closeLightbox(): void {
  isLightboxOpen.value = false
  setTimeout(() => { lightboxSrc.value = '' }, 200)
}

// ── Gist Settings ─────────────────────────────────────────────────────────────

/** Apre il modal delle impostazioni Gist. */
function openGistSettings(): void {
  isGistSettingsOpen.value = true
}

/** Chiude il modal delle impostazioni Gist. */
function closeGistSettings(): void {
  isGistSettingsOpen.value = false
}

// ── Modal ────────────────────────────────────────────────────────────────────

/** Apre il modal per il tipo di attività specificato. */
function openModal(type: ActivityType): void {
  modalType.value    = type
  modalPhotos.value  = []
  isModalOpen.value  = true
}

/** Chiude e resetta il modal. */
function closeModal(): void {
  isModalOpen.value  = false
  modalType.value    = null
  modalPhotos.value  = []
}

// ─────────────────────────────────────────────────────────────────────────────

export function useAppState() {
  return {
    // state
    currentView,
    currentActivity,
    isDesktop,
    isModalOpen,
    modalType,
    modalPhotos,
    photoTarget,
    isGpsLoading,
    toastMessage,
    isLightboxOpen,
    lightboxSrc,
    isGistSettingsOpen,
    // computed
    hasOngoing,
    // methods
    navigate,
    updateLayout,
    showToast,
    setGpsLoading,
    openLightbox,
    closeLightbox,
    openModal,
    closeModal,
    openGistSettings,
    closeGistSettings,
  }
}
