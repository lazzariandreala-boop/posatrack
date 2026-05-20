<script setup lang="ts">
/**
 * TimerView – Vista Timer & Attività
 * ─────────────────────────────────────────────────────────────────────
 * Visibile su MOBILE e DESKTOP (unica vista disponibile su mobile).
 * Su desktop ha un layout a due colonne:
 *   - Sinistra: card attività corrente + pulsante STOP
 *   - Destra:   griglia azioni + log attività di oggi
 *
 * Dipendenze:
 *   useAppState  → stato globale, navigazione, toast, GPS loader
 *   useStore     → lettura/scrittura attività
 *   useGeo       → acquisizione GPS (per STOP attività)
 *   useTimer     → cronometro live
 *   usePhoto     → compressione foto inline nel log
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAppState } from '~/composables/useAppState'
import { useAuth } from '~/composables/useAuth'
import { useStore } from '~/composables/useStore'
import { useGeo } from '~/composables/useGeo'
import { useTimer } from '~/composables/useTimer'
import { usePhoto } from '~/composables/usePhoto'
import { ACT } from '~/constants'
import { DAYS_IT, MONTHS_SHORT } from '~/constants'
import type { ActivityType } from '~/types'
import { photoSrc } from '~/types'

const appState = useAppState()
const store = useStore()
const geo = useGeo()
const timer = useTimer()
const photo = usePhoto()

// ── Orologio live nell'header ─────────────────────────────────────────
const clockDay = ref('')  // es. "LUNEDÌ"
const clockDate = ref('')  // es. "14 Lug"
const clockTime = ref('')  // es. "08:45"

let clockInterval: ReturnType<typeof setInterval> | null = null

function updateClock(): void {
  const now = new Date()
  clockDay.value = DAYS_IT[now.getDay()].toUpperCase()
  clockDate.value = `${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`
  clockTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// ── Log attività di oggi ──────────────────────────────────────────────

/** Lista reattiva delle attività di oggi (escluse quelle pianificate non ancora avviate) */
const todayActivities = computed(() => {
  const today = todayStr()
  return store.forDate(today)
    .filter(a => !(a.isPlanned && a.duration === 0 && a.id !== current.value?.id))
    .slice()
    .sort((a, b) => b.startTime - a.startTime)
})

/** Ritorna la data di oggi come stringa YYYY-MM-DD (fuso locale) */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// ── Formattazione utility ─────────────────────────────────────────────

/** Formatta secondi: "45s" | "23m" | "2h 15m" */
function fmtDur(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

/** Formatta un timestamp come "HH:MM" */
function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Avvio attività ────────────────────────────────────────────────────

/** Apre il modal per il tipo specificato */
function openModal(type: ActivityType): void {
  appState.openModal(type)
}

/** Avvio diretto senza modal (es. Pausa Pranzo) */
async function startDirectActivity(type: ActivityType, detail: string, note: string): Promise<void> {
  appState.setGpsLoading(true)
  const location = await geo.get()
  const nowTs = Date.now()
  const today = todayStr()

  // Termina l'eventuale attività in corso
  if (appState.currentActivity.value) {
    const duration = Math.floor((nowTs - appState.currentActivity.value.startTime) / 1000)
    store.update(appState.currentActivity.value.id, {
      endTime: nowTs,
      endLoc: location,
      duration: duration,
    })
    timer.stop()
    appState.currentActivity.value = null
  }

  // Crea la nuova attività
  const activity = {
    id: `act_${nowTs}`,
    type,
    detail,
    note,
    date: today,
    startTime: nowTs,
    endTime: null,
    startLoc: location,
    endLoc: null,
    duration: null,
    photos: [],
  }

  store.add(activity)
  appState.currentActivity.value = activity
  appState.setGpsLoading(false)
  timer.start(nowTs)
  appState.showToast(`▶ ${ACT[type]?.label} avviata`)
}

// ── Stop attività ─────────────────────────────────────────────────────

async function stopActivity(): Promise<void> {
  if (!appState.currentActivity.value) return

  appState.setGpsLoading(true)
  const location = await geo.get()
  const nowTs = Date.now()
  const duration = Math.floor((nowTs - appState.currentActivity.value.startTime) / 1000)

  store.update(appState.currentActivity.value.id, {
    endTime: nowTs,
    endLoc: location,
    duration: duration,
  })

  timer.stop()
  appState.currentActivity.value = null
  appState.setGpsLoading(false)
  appState.showToast('Attività terminata')
  initCostInputs()
}

// ── Elimina attività ──────────────────────────────────────────────────

const pendingDeleteId = ref<string | null>(null)

function deleteActivity(activityId: string): void {
  pendingDeleteId.value = activityId
}

function confirmDelete(): void {
  const id = pendingDeleteId.value
  if (!id) return
  pendingDeleteId.value = null
  if (appState.currentActivity.value?.id === id) {
    timer.stop()
    appState.currentActivity.value = null
  }
  store.remove(id)
  appState.showToast('Attività eliminata')
}

function cancelDelete(): void {
  pendingDeleteId.value = null
}

// ── Riprendi attività ─────────────────────────────────────────────────

async function resumeActivity(type: ActivityType, detail: string, note: string): Promise<void> {
  await startDirectActivity(type, detail, note)
}

// ── Gestione foto inline nel log ──────────────────────────────────────
const fileInputRef = ref<HTMLInputElement | null>(null)
const receiptFileInputRef = ref<HTMLInputElement | null>(null)
const sitePhotoInputRef = ref<HTMLInputElement | null>(null)

/** Triggera il file picker per aggiungere foto a un'attività esistente */
function triggerPhotoCapture(activityId: string): void {
  appState.photoTarget.value = activityId
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

async function handleFileInput(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length || !appState.photoTarget.value) return

  appState.showToast('Elaborazione foto...')
  const compressed = await photo.processFiles(files)

  compressed.forEach(b64 => store.addPhoto(appState.photoTarget.value!, b64))
  appState.photoTarget.value = null
  appState.showToast(`${compressed.length} foto salvata/e`)
}

// ── Scontrini pausa pranzo ────────────────────────────────────────────

const receiptTarget = ref<string | null>(null)

function triggerReceiptCapture(activityId: string): void {
  receiptTarget.value = activityId
  if (receiptFileInputRef.value) {
    receiptFileInputRef.value.value = ''
    receiptFileInputRef.value.click()
  }
}

async function handleReceiptInput(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length || !receiptTarget.value) return

  appState.showToast('Elaborazione scontrino...')
  const compressed = await photo.processFiles(files)

  compressed.forEach(b64 => store.addReceiptPhoto(receiptTarget.value!, b64))
  receiptTarget.value = null
  appState.showToast('Scontrino salvato')
}

// ── Foto di cantiere ──────────────────────────────────────────────────

function triggerSitePhoto(): void {
  if (sitePhotoInputRef.value) {
    sitePhotoInputRef.value.value = ''
    sitePhotoInputRef.value.click()
  }
}

async function handleSitePhotoInput(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const files = Array.from(input.files ?? [])
  if (!files.length) return

  appState.showToast('Elaborazione foto cantiere...')
  const compressed = await photo.processFiles(files)

  compressed.forEach(b64 => store.addSitePhoto(todayStr(), b64))
  appState.showToast(`${compressed.length} foto cantiere salvata/e`)
}

// computed: si aggiorna automaticamente quando lo store cambia
const sitePhotos = computed(() => store.getSitePhotos(todayStr()))

function deleteSitePhoto(index: number): void {
  store.removeSitePhoto(todayStr(), index)
}

/** Apre il lightbox per una foto specifica di un'attività */
function openLightbox(activityId: string, photoIndex: number): void {
  const activity = store.all().find(a => a.id === activityId)
  if (!activity?.photos?.[photoIndex]) return
  appState.openLightbox(photoSrc(activity.photos[photoIndex]))
}

function openReceiptLightbox(activityId: string, photoIndex: number): void {
  const activity = store.all().find(a => a.id === activityId)
  if (!activity?.receiptPhotos?.[photoIndex]) return
  appState.openLightbox(photoSrc(activity.receiptPhotos[photoIndex]))
}

function openSiteLightbox(index: number): void {
  const photos = store.getSitePhotos(todayStr())
  if (photos[index]) appState.openLightbox(photoSrc(photos[index]))
}

// ── Note di cantiere ──────────────────────────────────────────────────

const dayNote = ref(store.getDayNote(todayStr()))

function saveDayNote(): void {
  store.setDayNote(todayStr(), dayNote.value)
}

// ── Costi effettivi giornalieri ────────────────────────────────────────
// Tutti e tre i campi sono a livello di giornata.
// Al caricamento vengono pre-popolati con la somma delle stime dalla pianificazione;
// se il posatore ha già salvato un valore effettivo, viene mostrato quello.

const travelCostInput   = ref(0)
const lunchCostInput    = ref(0)
const materialCostInput = ref(0)

function initCostInputs(): void {
  const today   = todayStr()
  const wos     = store.getWorkOrdersForDate(today)
  const dayCosts = store.getDayCosts(today)

  // Viaggio: effettivo salvato oppure somma delle stime dei WO trasferimento
  if (dayCosts.travelCostActual != null) {
    travelCostInput.value = dayCosts.travelCostActual
  } else {
    travelCostInput.value = wos
      .filter(wo => wo.type === 'trasferimento')
      .reduce((sum, wo) => sum + (wo.travelCostEstimate ?? 0), 0)
  }

  // Pranzo: effettivo salvato oppure somma delle stime dei WO
  if (dayCosts.lunchCostActual != null) {
    lunchCostInput.value = dayCosts.lunchCostActual
  } else {
    lunchCostInput.value = wos.reduce((sum, wo) => sum + (wo.lunchCostEstimate ?? 0), 0)
  }

  // Materiale: effettivo salvato oppure somma delle stime dei WO (posa e altro)
  if (dayCosts.materialCostActual != null) {
    materialCostInput.value = dayCosts.materialCostActual
  } else {
    materialCostInput.value = wos
      .filter(wo => wo.type !== 'trasferimento')
      .reduce((sum, wo) => sum + (wo.materialCostEstimate ?? 0), 0)
  }
}

function saveTravelCostDay(): void {
  store.setDayCosts(todayStr(), { travelCostActual: travelCostInput.value > 0 ? travelCostInput.value : undefined })
  appState.showToast('Costo viaggio salvato')
}

function saveLunchCostDay(): void {
  store.setDayCosts(todayStr(), { lunchCostActual: lunchCostInput.value > 0 ? lunchCostInput.value : undefined })
  appState.showToast('Costo pranzo salvato')
}

function saveMaterialCostDay(): void {
  store.setDayCosts(todayStr(), { materialCostActual: materialCostInput.value > 0 ? materialCostInput.value : undefined })
  appState.showToast('Costo materiale salvato')
}

// ── Attività pianificate per oggi ─────────────────────────────────────

/**
 * Attività pre-create da work order pianificati (isPlanned=true, duration=0).
 * Appaiono nella sezione "Da fare oggi" separata dal log normale.
 */
const plannedTodayActivities = computed(() =>
  store.forDate(todayStr())
    .filter(a => a.isPlanned && a.duration === 0 && a.id !== current.value?.id)
    .sort((a, b) => (a.note > b.note ? 1 : -1))
)

/** Mappa workOrderId → estimatedTime (minuti) per mostrare la stima in "Da fare oggi" */
const woEstimatedTimeMap = computed(() => {
  const map = new Map<string, number>()
  store.getAllWorkOrders().forEach(wo => {
    if (wo.estimatedTime) map.set(wo.id, wo.estimatedTime)
  })
  return map
})

/** Mappa workOrderId → mapsLink per mostrare il link Maps in "Da fare oggi" */
const woMapsLinkMap = computed(() => {
  const map = new Map<string, string>()
  store.getAllWorkOrders().forEach(wo => {
    if (wo.mapsLink) map.set(wo.id, wo.mapsLink)
  })
  return map
})

/** Formatta minuti stimati → "~2h 30m" */
function fmtEstimated(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `~${h}h ${m}m`
  if (h > 0) return `~${h}h`
  return `~${m}m`
}

/**
 * Avvia un'attività pianificata: acquisce GPS, resetta i timestamp
 * e la imposta come attività corrente senza aprire il modal.
 */
async function startPlannedActivity(a: import('~/types').Activity): Promise<void> {
  appState.setGpsLoading(true)
  const location = await geo.get()
  const nowTs = Date.now()

  // Termina l'eventuale attività in corso
  if (appState.currentActivity.value) {
    const duration = Math.floor((nowTs - appState.currentActivity.value.startTime) / 1000)
    store.update(appState.currentActivity.value.id, {
      endTime: nowTs,
      endLoc: location,
      duration: duration,
    })
    timer.stop()
    appState.currentActivity.value = null
  }

  // Attiva l'attività pianificata: resetta i campi di timing
  store.update(a.id, {
    startTime: nowTs,
    endTime: null,
    duration: null,
    startLoc: location,
    endLoc: null,
  })

  const updated = { ...a, startTime: nowTs, endTime: null, duration: null, startLoc: location, endLoc: null }
  appState.currentActivity.value = updated
  appState.setGpsLoading(false)
  timer.start(nowTs)
  appState.showToast(`▶ ${ACT[a.type]?.label} avviata`)
}

// ── Lifecycle ─────────────────────────────────────────────────────────
onMounted(() => {
  updateClock()
  clockInterval = setInterval(updateClock, 1000)

  // Ripristina un'eventuale attività in corso dopo un reload della pagina
  const ongoing = store.getOngoing(todayStr())
  if (ongoing && !appState.currentActivity.value) {
    appState.currentActivity.value = ongoing
    timer.start(ongoing.startTime)
  }

  // Pre-crea attività pianificate per oggi da work orders
  const created = store.autoCreatePlannedActivities(todayStr())
  if (created > 0) {
    appState.showToast(`📋 ${created} lavorazion${created === 1 ? 'e pianificata' : 'i pianificate'} per oggi`)
  }
  initCostInputs()
})

onUnmounted(() => {
  if (clockInterval !== null) clearInterval(clockInterval)
})

// ── Computed per la card attività corrente ────────────────────────────

const current = computed(() => appState.currentActivity.value)
const isRunning = computed(() => current.value !== null)
const actColor = computed(() => current.value ? (ACT[current.value.type]?.color ?? 'var(--live)') : 'var(--muted)')
const actLabel = computed(() => current.value ? (ACT[current.value.type]?.label ?? current.value.type) : 'In attesa di avvio')
const actDetail = computed(() => current.value?.detail ?? '')
const gpsOk = computed(() => current.value?.startLoc != null)
const gpsText = computed(() => current.value ? geo.shortFmt(current.value.startLoc) : '')

// ── Timer split per display live (HH:MM + :SS separati per colorazione) ──────
const timerHM = computed(() => {
  const parts = (timer.elapsed.value || '00:00:00').split(':')
  return parts.slice(0, 2).join(':')
})
const timerSec = computed(() => {
  const parts = (timer.elapsed.value || '00:00:00').split(':')
  return ':' + (parts[2] || '00')
})

// ── Prossimo cantiere: prima attività pianificata non avviata ─────────────────
const nextPlanned = computed(() => plannedTodayActivities.value[0] ?? null)

// ── Tutte le attività di oggi per la schedule ─────────────────────────────────
const scheduleItems = computed(() => {
  const planned = plannedTodayActivities.value.map((a, i) => ({ ...a, idx: i + 1, done: false }))
  const done    = todayActivities.value.map(a => ({ ...a, idx: 0, done: true }))
  return [...done, ...planned].slice(0, 5)
})

// ── Numero foto dell'attività corrente ────────────────────────────────────────
const currentPhotoCount = computed(() => current.value?.photos?.length ?? 0)

// ── Auth per il nome utente ───────────────────────────────────────────────────
const auth = useAuth()
const userName = computed(() => {
  const name = auth.currentUser.value?.displayName || auth.currentUser.value?.email || ''
  return name.split(' ')[0] || 'Ciao'
})
const userInitials = computed(() => {
  const name = auth.currentUser.value?.displayName || auth.currentUser.value?.email || 'U'
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
})
</script>

<template>
  <div id="view-timer">

    <!-- ════════════════════════════════════════════════════════════
         MOBILE: SESSIONE LIVE (quando c'è un'attività in corso)
         ════════════════════════════════════════════════════════════ -->
    <div v-if="isRunning" class="live-view">

      <!-- Header arancione -->
      <div class="live-header">
        <div class="live-header-left">
          <span class="live-dot-indicator" />
          <span class="live-header-label">SESSIONE LIVE</span>
        </div>
        <div class="live-header-right">
          {{ actLabel }} · {{ actDetail }}
        </div>
      </div>

      <!-- Sezione timer -->
      <div class="live-timer-section">
        <div class="live-timer-label">IN CORSO DA</div>
        <div class="live-timer-display">
          <span class="live-timer-hm">{{ timerHM }}</span><span class="live-timer-sec">{{ timerSec }}</span>
        </div>
        <div class="live-timer-meta">
          Avvio · {{ fmtTime(current!.startTime) }}
          <template v-if="gpsOk"> · GPS {{ gpsText }}</template>
        </div>
        <div class="live-progress-bar">
          <div class="live-progress-fill" style="width: 0%" />
        </div>
      </div>

      <!-- Card job in corso -->
      <div class="live-job-card">
        <div class="live-job-header">
          <div class="live-job-badge">
            <span class="live-dot-sm" />
            In corso
          </div>
          <span v-if="current?.orderNumber" class="live-job-code">{{ current.orderNumber }}</span>
        </div>
        <div class="live-job-name">{{ actDetail || 'Attività in corso' }}</div>
        <div v-if="gpsOk" class="live-job-loc">
          <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
          {{ gpsText }}
          <span class="live-geofence-ok">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            GPS ok
          </span>
        </div>
      </div>

      <!-- Griglia azioni 2×2 -->
      <div class="live-action-grid">
        <button class="live-action-btn" @click="current && triggerPhotoCapture(current.id)">
          <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          <span class="live-action-label">Foto</span>
          <span v-if="currentPhotoCount > 0" class="live-action-count">{{ currentPhotoCount }} caricate</span>
          <span v-else class="live-action-count">aggiungi</span>
        </button>
        <button class="live-action-btn" @click="current && triggerReceiptCapture(current.id)">
          <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="9" y1="13" x2="15" y2="13"/></svg>
          <span class="live-action-label">Nota</span>
          <span class="live-action-count">1 oggi</span>
        </button>
        <button class="live-action-btn" @click="triggerSitePhoto">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
          <span class="live-action-label">Costo</span>
          <span class="live-action-count">+ materiale</span>
        </button>
        <button class="live-action-btn live-action-warn">
          <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span class="live-action-label">Anomalia</span>
          <span class="live-action-count">segnala</span>
        </button>
      </div>

      <!-- Log foto -->
      <div v-if="current?.photos?.length" class="live-photos-row">
        <div v-for="(p, i) in current!.photos.slice(0,4)" :key="i" class="live-photo-thumb" @click="openLightbox(current!.id, i)">
          <img :src="photoSrc(p)" :alt="`Foto ${i+1}`" />
        </div>
        <div v-if="(current?.photos?.length ?? 0) > 4" class="live-photo-more">+{{ (current?.photos?.length ?? 0) - 4 }}</div>
      </div>

      <!-- Note cantiere -->
      <div class="live-notes-section">
        <div class="live-section-label">NOTE DI CANTIERE</div>
        <textarea v-model="dayNote" class="live-notes-area" placeholder="Note sul cantiere..." rows="3" @blur="saveDayNote" />
      </div>

      <!-- Pulsante TERMINA -->
      <div class="live-stop-row">
        <button class="live-stop-btn" @click="stopActivity">
          <svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>
          Termina attività
        </button>
      </div>

    </div><!-- /live-view -->


    <!-- ════════════════════════════════════════════════════════════
         MOBILE: HOME IDLE (nessuna sessione in corso)
         ════════════════════════════════════════════════════════════ -->
    <div v-else class="oggi-view">

      <!-- Header -->
      <div class="oggi-header">
        <div class="oggi-header-left">
          <div class="oggi-date">{{ clockDay }}, {{ clockDate }}</div>
          <div class="oggi-greeting">Ciao, {{ userName }}</div>
        </div>
        <div class="avatar avatar-lg">{{ userInitials }}</div>
      </div>

      <!-- Status chips -->
      <div class="oggi-status-row">
        <div class="oggi-chip oggi-chip-idle">
          <span class="oggi-chip-dot" />
          In attesa di avvio
        </div>
        <div class="oggi-chip oggi-chip-gps">
          GPS pronto
        </div>
      </div>

      <!-- Timer display -->
      <div class="oggi-timer-display">00:00:00</div>
      <div class="oggi-timer-hint">Inizia una sessione per iniziare a tracciare</div>

      <!-- CTA principale: Avvia trasferimento -->
      <button class="oggi-btn-primary" @click="openModal('trasferimento')">
        <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
        Avvia trasferimento
      </button>

      <!-- Azioni secondarie: Posa + Pausa -->
      <div class="oggi-btn-row">
        <button class="oggi-btn-secondary" @click="openModal('posa')">
          <svg viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
          Posa
        </button>
        <button class="oggi-btn-secondary" @click="startDirectActivity('pausa_pranzo', 'Pausa pranzo', '')">
          <svg viewBox="0 0 24 24"><path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/></svg>
          Pausa
        </button>
        <button class="oggi-btn-secondary" @click="openModal('altro')">
          <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Altro
        </button>
      </div>

      <!-- Prossimo cantiere (se ci sono attività pianificate) -->
      <div v-if="nextPlanned" class="oggi-section">
        <div class="oggi-section-label">PROSSIMO CANTIERE</div>
        <div class="oggi-job-card">
          <div class="oggi-job-header">
            <div class="oggi-job-badges">
              <span class="badge badge-primary">Assegnato</span>
            </div>
            <span class="oggi-job-code">{{ nextPlanned.orderNumber || '—' }}</span>
          </div>
          <div class="oggi-job-name">{{ nextPlanned.detail }}</div>
          <div class="oggi-job-meta">
            <span>
              <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
              {{ ACT[nextPlanned.type]?.label ?? nextPlanned.type }}
            </span>
            <template v-if="nextPlanned.workOrderId && woEstimatedTimeMap.get(nextPlanned.workOrderId)">
              <span>
                <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                stima {{ fmtEstimated(woEstimatedTimeMap.get(nextPlanned.workOrderId)!) }}
              </span>
            </template>
          </div>
          <div class="oggi-job-actions">
            <button class="oggi-job-btn-ghost" @click="deleteActivity(nextPlanned.id)">Rimuovi</button>
            <button class="oggi-job-btn-primary" @click="startPlannedActivity(nextPlanned)">
              <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
              Avvia
            </button>
          </div>
        </div>
      </div>

      <!-- Schedule oggi -->
      <div v-if="todayActivities.length || plannedTodayActivities.length" class="oggi-section">
        <div class="oggi-section-header">
          <div class="oggi-section-label">OGGI · {{ todayActivities.length + plannedTodayActivities.length }} ATTIVITÀ</div>
          <div class="oggi-section-dur">
            {{ todayActivities.reduce((s, a) => s + (a.duration ?? 0), 0) > 0
              ? fmtDur(todayActivities.reduce((s, a) => s + (a.duration ?? 0), 0))
              : '' }}
          </div>
        </div>

        <!-- Attività completate -->
        <div v-for="(a, i) in todayActivities" :key="a.id" class="oggi-schedule-item">
          <div class="oggi-sched-marker done">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <div class="oggi-sched-body">
            <div class="oggi-sched-time">{{ fmtTime(a.startTime) }}</div>
            <div class="oggi-sched-name">{{ a.detail }}</div>
            <div class="oggi-sched-sub">{{ ACT[a.type]?.label ?? a.type }}
              <template v-if="a.duration"> · {{ fmtDur(a.duration) }}</template>
            </div>
          </div>
          <div class="oggi-sched-actions">
            <button class="sched-action-btn" @click="triggerPhotoCapture(a.id)">
              <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            </button>
            <button class="sched-action-btn sched-delete" @click="deleteActivity(a.id)">
              <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            </button>
          </div>
        </div>

        <!-- Attività pianificate -->
        <div v-for="(a, i) in plannedTodayActivities" :key="a.id" class="oggi-schedule-item oggi-sched-planned">
          <div class="oggi-sched-marker planned">{{ todayActivities.length + i + 1 }}</div>
          <div class="oggi-sched-body">
            <div class="oggi-sched-name">{{ a.detail }}</div>
            <div class="oggi-sched-sub">{{ ACT[a.type]?.label ?? a.type }}
              <template v-if="a.workOrderId && woEstimatedTimeMap.get(a.workOrderId)">
                · {{ fmtEstimated(woEstimatedTimeMap.get(a.workOrderId)!) }}
              </template>
            </div>
          </div>
          <button class="sched-start-btn" @click="startPlannedActivity(a)">
            <svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3" fill="currentColor" stroke="none"/></svg>
          </button>
        </div>
      </div>

      <!-- Empty state quando non ci sono attività -->
      <div v-if="!todayActivities.length && !plannedTodayActivities.length" class="oggi-empty">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        <div class="oggi-empty-title">Giornata libera</div>
        <div class="oggi-empty-sub">Nessuna attività pianificata per oggi</div>
      </div>

      <!-- Costi (collassati in fondo) -->
      <div class="oggi-section">
        <div class="oggi-section-label">COSTI EFFETTIVI GIORNATA</div>
        <div class="oggi-costs-card">
          <div class="oggi-cost-row">
            <span class="oggi-cost-label">Viaggio €</span>
            <input v-model.number="travelCostInput" type="number" min="0" step="0.01" placeholder="0" class="oggi-cost-input" />
            <button class="oggi-cost-save" @click="saveTravelCostDay">Salva</button>
          </div>
          <div class="oggi-cost-row">
            <span class="oggi-cost-label">Pranzo €</span>
            <input v-model.number="lunchCostInput" type="number" min="0" step="0.01" placeholder="0" class="oggi-cost-input" />
            <button class="oggi-cost-save" @click="saveLunchCostDay">Salva</button>
          </div>
          <div class="oggi-cost-row">
            <span class="oggi-cost-label">Materiale €</span>
            <input v-model.number="materialCostInput" type="number" min="0" step="0.01" placeholder="0" class="oggi-cost-input" />
            <button class="oggi-cost-save" @click="saveMaterialCostDay">Salva</button>
          </div>
        </div>
      </div>

      <!-- Foto cantiere -->
      <div class="oggi-section">
        <div class="oggi-section-label">FOTO CANTIERE</div>
        <div v-if="sitePhotos.length" class="oggi-photos-grid">
          <div v-for="(p, i) in sitePhotos" :key="i" class="oggi-photo-wrap">
            <img :src="photoSrc(p)" :alt="`Cantiere ${i+1}`" @click="openSiteLightbox(i)" />
            <button class="oggi-photo-del" @click="deleteSitePhoto(i)">✕</button>
          </div>
        </div>
        <button class="oggi-photo-add-btn" @click="triggerSitePhoto">
          <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
          Scatta foto al cantiere
        </button>
      </div>

      <!-- Note cantiere -->
      <div class="oggi-section">
        <div class="oggi-section-label">NOTE DI CANTIERE</div>
        <textarea v-model="dayNote" class="live-notes-area" placeholder="Note sul cantiere di oggi..." rows="3" @blur="saveDayNote" />
      </div>

    </div><!-- /oggi-view -->


    <!-- Input file nascosti (sempre presenti nel DOM) -->
    <input ref="fileInputRef" type="file" accept="image/*" capture="environment" multiple style="display:none" @change="handleFileInput">
    <input ref="receiptFileInputRef" type="file" accept="image/*" capture="environment" multiple style="display:none" @change="handleReceiptInput">
    <input ref="sitePhotoInputRef" type="file" accept="image/*" capture="environment" multiple style="display:none" @change="handleSitePhotoInput">

    <!-- Popup conferma eliminazione -->
    <div v-if="pendingDeleteId" class="confirm-overlay" @click.self="cancelDelete">
      <div class="confirm-dialog">
        <p class="confirm-msg">Eliminare questa attività?<br><span class="confirm-sub">L'operazione non è reversibile.</span></p>
        <div class="confirm-actions">
          <button class="confirm-btn cancel-btn" @click="cancelDelete">Annulla</button>
          <button class="confirm-btn delete-confirm-btn" @click="confirmDelete">Elimina</button>
        </div>
      </div>
    </div>

  </div><!-- /view-timer -->
</template>

<style scoped lang="scss">
#view-timer {
  min-height: 100%;
}

// ════════════════════════════════════════════════════════════════════
// OGGI VIEW (idle)
// ════════════════════════════════════════════════════════════════════

.oggi-view {
  padding: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 0;
}

// ── Header ──────────────────────────────────────────────────────────
.oggi-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  padding-top: calc(20px + var(--safe-t));
}

.oggi-date {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .8px;
  margin-bottom: 4px;
}

.oggi-greeting {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
  line-height: 1.1;
}

// ── Status chips ────────────────────────────────────────────────────
.oggi-status-row {
  display: flex;
  gap: 8px;
  padding: 0 20px 20px;
}

.oggi-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink-2);
}

.oggi-chip-dot { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }

.oggi-chip-gps {
  color: var(--ok-ink);
  border-color: var(--ok-soft);
  background: var(--ok-soft);
}

// ── Timer display ────────────────────────────────────────────────────
.oggi-timer-display {
  font-family: var(--ff-mono);
  font-size: 56px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--ink);
  text-align: center;
  padding: 0 20px;
  line-height: 1;
}

.oggi-timer-hint {
  font-size: 13px;
  color: var(--muted);
  text-align: center;
  margin: 10px 0 24px;
  padding: 0 20px;
}

// ── CTA primary ──────────────────────────────────────────────────────
.oggi-btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin: 0 20px 12px;
  padding: 18px 20px;
  background: var(--live);
  border: none;
  border-radius: var(--radius);
  font-family: var(--ff);
  font-size: 17px;
  font-weight: 700;
  color: #000;
  cursor: pointer;
  transition: filter .12s, transform .1s;

  &:active { transform: scale(.97); filter: brightness(.9); }

  svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    stroke: none;
    flex-shrink: 0;
  }
}

// ── Secondary actions row ────────────────────────────────────────────
.oggi-btn-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 10px;
  margin: 0 20px 24px;
}

.oggi-btn-secondary {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 16px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;
  transition: background .12s, border-color .12s, transform .1s;

  &:active { transform: scale(.95); }
  &:hover  { background: var(--surface-2); }

  svg {
    width: 22px;
    height: 22px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

// ── Section layout ───────────────────────────────────────────────────
.oggi-section {
  padding: 0 20px 20px;
}

.oggi-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.oggi-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 12px;
}

.oggi-section-dur {
  font-size: 12px;
  color: var(--muted);
}

// ── Job card (prossimo cantiere) ─────────────────────────────────────
.oggi-job-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px;
}

.oggi-job-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.oggi-job-badges { display: flex; gap: 6px; }

.oggi-job-code {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
}

.oggi-job-name {
  font-size: 16px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 8px;
  line-height: 1.3;
}

.oggi-job-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 14px;

  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.oggi-job-actions {
  display: flex;
  gap: 8px;
}

.oggi-job-btn-ghost {
  flex: 1;
  padding: 10px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: var(--ink-2);
  cursor: pointer;
  text-align: center;

  &:active { opacity: .7; }
}

.oggi-job-btn-primary {
  flex: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 10px;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  cursor: pointer;

  &:active { opacity: .8; }

  svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
    stroke: none;
  }
}

// ── Schedule list ─────────────────────────────────────────────────────
.oggi-schedule-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);

  &:last-child { border-bottom: none; }
}

.oggi-sched-planned { opacity: .8; }

.oggi-sched-marker {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 700;

  &.done {
    background: var(--ok-soft);
    color: var(--ok-ink);

    svg {
      width: 14px;
      height: 14px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
  }

  &.planned {
    background: var(--surface-2);
    color: var(--muted);
    border: 1px dashed var(--border-strong);
  }
}

.oggi-sched-body { flex: 1; min-width: 0; }

.oggi-sched-time {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 2px;
}

.oggi-sched-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.oggi-sched-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

.oggi-sched-actions {
  display: flex;
  gap: 6px;
}

.sched-action-btn {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  cursor: pointer;
  color: var(--muted);

  svg {
    width: 13px;
    height: 13px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.sched-delete { color: var(--err-ink); }

.sched-start-btn {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  cursor: pointer;
  color: #fff;

  svg {
    width: 14px;
    height: 14px;
    fill: currentColor;
    stroke: none;
  }
}

// ── Empty state ───────────────────────────────────────────────────────
.oggi-empty {
  text-align: center;
  padding: 40px 20px;
  color: var(--muted);

  svg {
    width: 44px;
    height: 44px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.4;
    margin: 0 auto 14px;
    display: block;
  }
}

.oggi-empty-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.oggi-empty-sub   { font-size: 13px; }

// ── Costi ─────────────────────────────────────────────────────────────
.oggi-costs-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 4px 0;
}

.oggi-cost-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);

  &:last-child { border-bottom: none; }
}

.oggi-cost-label {
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  flex: 1;
}

.oggi-cost-input {
  width: 80px !important;
  padding: 7px 10px !important;
  font-size: 14px !important;
  text-align: right;
  flex-shrink: 0;
}

.oggi-cost-save {
  padding: 7px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  cursor: pointer;

  &:active { opacity: .7; }
}

// ── Foto cantiere ─────────────────────────────────────────────────────
.oggi-photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.oggi-photo-wrap {
  position: relative;
  width: 72px;
  height: 72px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border);
    cursor: pointer;
  }
}

.oggi-photo-del {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  background: var(--err);
  border: none;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
}

.oggi-photo-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 12px;
  background: var(--surface);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}


// ════════════════════════════════════════════════════════════════════
// LIVE SESSION VIEW
// ════════════════════════════════════════════════════════════════════

.live-view {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 100px;
}

// ── Header arancione ─────────────────────────────────────────────────
.live-header {
  background: var(--live);
  padding: 16px 20px;
  padding-top: calc(16px + var(--safe-t));
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.live-header-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.live-dot-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #000;
  animation: pulse 1.5s infinite;
}

.live-header-label {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 1.5px;
  color: #000;
}

.live-header-right {
  font-size: 13px;
  font-weight: 600;
  color: rgba(0,0,0,.7);
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
  max-width: 180px;
}

// ── Timer section ─────────────────────────────────────────────────────
.live-timer-section {
  padding: 28px 20px 20px;
  text-align: center;
}

.live-timer-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.live-timer-display {
  font-family: var(--ff-mono);
  font-size: 60px;
  font-weight: 700;
  letter-spacing: 2px;
  line-height: 1;
  display: flex;
  align-items: baseline;
  justify-content: center;
}

.live-timer-hm  { color: var(--ink); }
.live-timer-sec { color: var(--live); }

.live-timer-meta {
  font-size: 12px;
  color: var(--muted);
  margin-top: 8px;
}

.live-progress-bar {
  height: 3px;
  background: var(--border);
  border-radius: 2px;
  margin-top: 16px;
  overflow: hidden;
}

.live-progress-fill {
  height: 100%;
  background: var(--live);
  border-radius: 2px;
  transition: width .5s ease;
}

// ── Job card ──────────────────────────────────────────────────────────
.live-job-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin: 0 20px 16px;
}

.live-job-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.live-job-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--ok-ink);
  background: var(--ok-soft);
  padding: 3px 8px;
  border-radius: var(--radius-xs);
}

.live-dot-sm {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ok);
  display: inline-block;
}

.live-job-code {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
}

.live-job-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
  line-height: 1.3;
}

.live-job-loc {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--muted);

  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }
}

.live-geofence-ok {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--ok-ink);
  margin-left: 6px;

  svg {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

// ── Action grid 2×2 ───────────────────────────────────────────────────
.live-action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
  margin: 0 20px 16px;
}

.live-action-btn {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  padding: 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: background .12s;

  &:active { background: var(--surface-2); transform: scale(.97); }

  svg {
    width: 20px;
    height: 20px;
    stroke: var(--ink-2);
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.live-action-warn svg { stroke: var(--warn); }

.live-action-label {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
}

.live-action-count {
  font-size: 11px;
  color: var(--muted);
}

// ── Foto row ──────────────────────────────────────────────────────────
.live-photos-row {
  display: flex;
  gap: 8px;
  padding: 0 20px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.live-photo-thumb {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  cursor: pointer;
  border: 1px solid var(--border);

  img { width: 100%; height: 100%; object-fit: cover; }
}

.live-photo-more {
  width: 64px;
  height: 64px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
  flex-shrink: 0;
}

// ── Note section ─────────────────────────────────────────────────────
.live-section-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
  padding: 0 20px;
}

.live-notes-section {
  padding: 0 0 16px;
}

.live-notes-area {
  width: calc(100% - 40px);
  margin: 0 20px;
  padding: 12px 14px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: var(--ff);
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: vertical;

  &:focus { border-color: var(--primary); }
  &::placeholder { color: var(--muted); }
}

// ── Stop button ───────────────────────────────────────────────────────
.live-stop-row {
  position: fixed;
  bottom: calc(var(--nav-h) + var(--safe-b) + 12px);
  left: 0;
  right: 0;
  padding: 12px 20px;
  background: linear-gradient(transparent, var(--bg) 40%);
}

.live-stop-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  padding: 18px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  font-family: var(--ff);
  font-size: 16px;
  font-weight: 700;
  color: var(--ink);
  cursor: pointer;
  transition: background .12s, border-color .12s;

  &:active { background: var(--err-soft); border-color: var(--err); color: var(--err-ink); transform: scale(.97); }

  svg {
    width: 18px;
    height: 18px;
    fill: currentColor;
    stroke: none;
    flex-shrink: 0;
  }
}


// ════════════════════════════════════════════════════════════════════
// CONFERMA ELIMINAZIONE
// ════════════════════════════════════════════════════════════════════

.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.confirm-dialog {
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  padding: 24px 28px;
  max-width: 320px;
  width: 90%;
  text-align: center;
  box-shadow: var(--shadow-3);
}

.confirm-msg {
  font-size: 16px;
  font-weight: 600;
  margin: 0 0 8px;
  line-height: 1.4;
  color: var(--ink);
}

.confirm-sub {
  font-size: 13px;
  font-weight: 400;
  color: var(--muted);
}

.confirm-actions {
  display: flex;
  gap: 12px;
  margin-top: 20px;
  justify-content: center;
}

.confirm-btn {
  flex: 1;
  padding: 10px 16px;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 14px;
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: opacity .15s;

  &:active { opacity: .75; }
}

.cancel-btn { background: var(--surface-2); color: var(--ink); border: 1px solid var(--border-strong); }
.delete-confirm-btn { background: var(--err); color: #fff; }


</style>
