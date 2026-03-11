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
import { useAppState }  from '~/composables/useAppState'
import { useStore }     from '~/composables/useStore'
import { useGeo }       from '~/composables/useGeo'
import { useTimer }     from '~/composables/useTimer'
import { usePhoto }     from '~/composables/usePhoto'
import { ACT }          from '~/constants'
import { DAYS_IT, MONTHS_SHORT } from '~/constants'
import type { ActivityType }     from '~/types'

const appState = useAppState()
const store    = useStore()
const geo      = useGeo()
const timer    = useTimer()
const photo    = usePhoto()

// ── Orologio live nell'header ─────────────────────────────────────────
const clockDay  = ref('')  // es. "LUNEDÌ"
const clockDate = ref('')  // es. "14 Lug"
const clockTime = ref('')  // es. "08:45"

let clockInterval: ReturnType<typeof setInterval> | null = null

function updateClock(): void {
  const now = new Date()
  clockDay.value  = DAYS_IT[now.getDay()].toUpperCase()
  clockDate.value = `${now.getDate()} ${MONTHS_SHORT[now.getMonth()]}`
  clockTime.value = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
}

// ── Log attività di oggi ──────────────────────────────────────────────

/** Lista reattiva delle attività di oggi (aggiornata ad ogni cambio store) */
const todayActivities = computed(() => {
  const today = todayStr()
  return store.forDate(today)
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
  const nowTs    = Date.now()
  const today    = todayStr()

  // Termina l'eventuale attività in corso
  if (appState.currentActivity.value) {
    const duration = Math.floor((nowTs - appState.currentActivity.value.startTime) / 1000)
    store.update(appState.currentActivity.value.id, {
      endTime:  nowTs,
      endLoc:   location,
      duration: duration,
    })
    timer.stop()
    appState.currentActivity.value = null
  }

  // Crea la nuova attività
  const activity = {
    id:        `act_${nowTs}`,
    type,
    detail,
    note,
    date:      today,
    startTime: nowTs,
    endTime:   null,
    startLoc:  location,
    endLoc:    null,
    duration:  null,
    photos:    [],
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
  const location   = await geo.get()
  const nowTs      = Date.now()
  const duration   = Math.floor((nowTs - appState.currentActivity.value.startTime) / 1000)

  store.update(appState.currentActivity.value.id, {
    endTime:  nowTs,
    endLoc:   location,
    duration: duration,
  })

  timer.stop()
  appState.currentActivity.value = null
  appState.setGpsLoading(false)
  appState.showToast('Attività terminata')
}

// ── Elimina attività ──────────────────────────────────────────────────

function deleteActivity(activityId: string): void {
  if (!confirm('Eliminare questa attività?')) return
  // Se è l'attività in corso, stoppa il timer prima
  if (appState.currentActivity.value?.id === activityId) {
    timer.stop()
    appState.currentActivity.value = null
  }
  store.remove(activityId)
  appState.showToast('Attività eliminata')
}

// ── Riprendi attività ─────────────────────────────────────────────────

async function resumeActivity(type: ActivityType, detail: string, note: string): Promise<void> {
  await startDirectActivity(type, detail, note)
}

// ── Gestione foto inline nel log ──────────────────────────────────────
const fileInputRef        = ref<HTMLInputElement | null>(null)
const receiptFileInputRef = ref<HTMLInputElement | null>(null)
const sitePhotoInputRef   = ref<HTMLInputElement | null>(null)

/** Triggera il file picker per aggiungere foto a un'attività esistente */
function triggerPhotoCapture(activityId: string): void {
  appState.photoTarget.value = activityId
  if (fileInputRef.value) {
    fileInputRef.value.value = ''
    fileInputRef.value.click()
  }
}

async function handleFileInput(e: Event): Promise<void> {
  const input   = e.target as HTMLInputElement
  const files   = Array.from(input.files ?? [])
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
  sitePhotos.value = store.getSitePhotos(todayStr())
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
  appState.openLightbox(activity.photos[photoIndex].data)
}

function openReceiptLightbox(activityId: string, photoIndex: number): void {
  const activity = store.all().find(a => a.id === activityId)
  if (!activity?.receiptPhotos?.[photoIndex]) return
  appState.openLightbox(activity.receiptPhotos[photoIndex].data)
}

function openSiteLightbox(index: number): void {
  const photos = store.getSitePhotos(todayStr())
  if (photos[index]) appState.openLightbox(photos[index].data)
}

// ── Note di cantiere ──────────────────────────────────────────────────

const dayNote = ref(store.getDayNote(todayStr()))

function saveDayNote(): void {
  store.setDayNote(todayStr(), dayNote.value)
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
})

onUnmounted(() => {
  if (clockInterval !== null) clearInterval(clockInterval)
})

// ── Computed per la card attività corrente ────────────────────────────

const current      = computed(() => appState.currentActivity.value)
const isRunning    = computed(() => current.value !== null)
const actColor     = computed(() => current.value ? (ACT[current.value.type]?.color ?? 'var(--orange)') : 'var(--dim)')
const actLabel     = computed(() => current.value ? (ACT[current.value.type]?.label ?? current.value.type).toUpperCase() : 'NESSUNA ATTIVITÀ')
const actDetail    = computed(() => current.value?.detail ?? 'In attesa di avvio...')
const gpsOk        = computed(() => current.value?.startLoc != null)
const gpsText      = computed(() => current.value ? geo.shortFmt(current.value.startLoc) : 'Posizione non disponibile')
</script>

<template>
  <div class="view" id="view-timer">

    <!-- ── Header: giorno, data e orologio live ──────────────────────── -->
    <div class="page-header">
      <div>
        <div class="hdr-day">{{ clockDay }}</div>
        <div class="page-title">{{ clockDate }}</div>
      </div>

      <!-- Logo Pozza al centro -->
      <img src="../Logo.png" alt="Pozza Logo" width="125" height="100" />

      <!-- Orologio HH:MM -->
      <div class="hdr-time">{{ clockTime }}</div>
    </div>

    <!--
      Wrapper colonne desktop.
      Su mobile i figli si impilano verticalmente.
      Su desktop ≥800px diventano flex row (regola in main.scss).
    -->
    <div id="timer-cols">

      <!-- ── Colonna sinistra: card + stop ─────────────────────────── -->
      <div id="timer-left-col">

        <!-- Card attività in corso -->
        <div id="active-card" :class="{ running: isRunning }">
          <!-- Barra colorata in cima -->
          <div id="active-card-bar" :style="{ background: actColor }" />

          <!-- Badge tipo: "● POSA" ecc. -->
          <div id="ac-badge">
            <div id="ac-badge-dot" :style="{ background: actColor }" />
            <span>{{ actLabel }}</span>
          </div>

          <!-- Nome/dettaglio dell'attività corrente -->
          <div id="ac-name" :class="{ running: isRunning }">{{ actDetail }}</div>

          <!-- Numero ordine (solo per posa) -->
          <div v-if="current?.orderNumber" id="ac-order">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Ordine: <strong>{{ current.orderNumber }}</strong>
          </div>

          <!-- Cronometro digitale live -->
          <div id="timer-el" :class="{ running: isRunning }" :style="isRunning ? { color: actColor } : {}">
            {{ timer.elapsed.value }}
          </div>

          <!-- Riga GPS: pallino di stato + coordinate -->
          <div id="ac-loc-row">
            <div
              id="ac-loc-dot"
              :class="{ 'gps-ok': isRunning && gpsOk, 'gps-err': isRunning && !gpsOk }"
              :style="{ background: isRunning ? (gpsOk ? 'var(--green)' : 'var(--red)') : 'var(--dim)' }"
            />
            <span>{{ gpsText }}</span>
          </div>
        </div><!-- /active-card -->

        <!-- Pulsante TERMINA: visibile solo quando c'è un'attività in corso -->
        <div v-if="isRunning" id="stop-wrap">
          <button class="btn btn-danger" @click="stopActivity">
            <svg viewBox="0 0 24 24" style="width:18px;height:18px;flex-shrink:0" fill="currentColor" stroke="none">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
            TERMINA ATTIVITÀ
          </button>
        </div>

        <!-- Foto di cantiere (mobile: pulsante rapido, desktop: card completa) -->
        <div class="site-photos-section">
          <div class="slabel">FOTO CANTIERE</div>
          <div v-if="sitePhotos.length" class="site-photos-grid">
            <div
              v-for="(p, i) in sitePhotos"
              :key="i"
              class="site-photo-wrap"
            >
              <img
                class="site-photo-thumb"
                :src="p.data"
                :alt="`Cantiere ${i + 1}`"
                @click="openSiteLightbox(i)"
              >
              <button class="site-photo-del" @click="deleteSitePhoto(i)">✕</button>
            </div>
          </div>
          <button class="photo-btn site-photo-btn" @click="triggerSitePhoto">
            <svg viewBox="0 0 24 24">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
              <circle cx="12" cy="13" r="4"/>
            </svg>
            Scatta foto al cantiere
          </button>
        </div>

        <!-- Note di cantiere giornaliere -->
        <div class="day-notes-section">
          <div class="slabel">NOTE DI CANTIERE</div>
          <textarea
            v-model="dayNote"
            class="day-notes-area"
            placeholder="Inserisci note sul cantiere di oggi..."
            rows="4"
            @blur="saveDayNote"
          />
        </div>

      </div><!-- /timer-left-col -->


      <!-- ── Colonna destra: azioni + log ──────────────────────────── -->
      <div id="timer-right-col">

        <!-- Griglia 2×2 per avviare le 4 tipologie di attività -->
        <div>
          <div class="slabel">AVVIA NUOVA ATTIVITÀ</div>
          <div class="action-grid">

            <!-- TRASFERIMENTO -->
            <div class="action-card" @click="openModal('trasferimento')">
              <div class="action-card-icon" style="background: var(--blue)">
                <svg viewBox="0 0 24 24">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
              <div>
                <div class="action-card-label">Trasferimento</div>
                <div class="action-card-sub">Verso un cantiere</div>
              </div>
            </div>

            <!-- POSA -->
            <div class="action-card" @click="openModal('posa')">
              <div class="action-card-icon" style="background: var(--orange)">
                <svg viewBox="0 0 24 24">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
                </svg>
              </div>
              <div>
                <div class="action-card-label">Posa</div>
                <div class="action-card-sub">Attrezzatura parco</div>
              </div>
            </div>

            <!-- PAUSA PRANZO -->
            <div class="action-card" @click="startDirectActivity('pausa_pranzo', 'Pausa pranzo', '')">
              <div class="action-card-icon" style="background: var(--yellow)">
                <svg viewBox="0 0 24 24" stroke="#444">
                  <path d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zM6 1v3M10 1v3M14 1v3"/>
                </svg>
              </div>
              <div>
                <div class="action-card-label">Pausa Pranzo</div>
                <div class="action-card-sub">Registra pausa</div>
              </div>
            </div>

            <!-- ALTRO -->
            <div class="action-card" @click="openModal('altro')">
              <div class="action-card-icon" style="background: var(--purple)">
                <svg viewBox="0 0 24 24">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div>
                <div class="action-card-label">Altro</div>
                <div class="action-card-sub">Attività generica</div>
              </div>
            </div>

          </div><!-- /action-grid -->
        </div>

        <!-- Log attività di oggi ────────────────────────────────────── -->
        <div>
          <div class="slabel">ATTIVITÀ DI OGGI</div>
          <div class="card">
            <div class="card-body">

              <!-- Empty state -->
              <div v-if="!todayActivities.length" class="empty">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <h3>Nessuna attività</h3>
                <p>Avvia un'attività per iniziare a tracciare</p>
              </div>

              <!-- Lista attività di oggi -->
              <div
                v-for="a in todayActivities"
                :key="a.id"
                class="log-item"
              >
                <!-- Pallino colorato tipo attività -->
                <div class="log-dot" :style="{ background: ACT[a.type]?.color ?? '#888' }" />

                <div class="log-body">
                  <!-- Titolo (detail) -->
                  <div class="log-title">{{ a.detail }}</div>
                  <!-- Meta: tipo · orario · note · numero ordine -->
                  <div class="log-meta">
                    {{ ACT[a.type]?.label ?? a.type }} · {{ fmtTime(a.startTime) }}
                    <template v-if="a.orderNumber"> · Ord. <strong>{{ a.orderNumber }}</strong></template>
                    <template v-if="a.note"> · {{ a.note }}</template>
                  </div>

                  <!-- Miniature foto attività -->
                  <div v-if="a.photos?.length" class="log-photos">
                    <img
                      v-for="(p, pi) in a.photos"
                      :key="pi"
                      class="log-photo-thumb"
                      :src="p.data"
                      :alt="`Foto ${pi + 1}`"
                      @click="openLightbox(a.id, pi)"
                    >
                  </div>

                  <!-- Miniature scontrini (solo pausa_pranzo) -->
                  <div v-if="a.type === 'pausa_pranzo' && a.receiptPhotos?.length" class="log-photos">
                    <div class="receipt-label">Scontrini:</div>
                    <img
                      v-for="(p, pi) in a.receiptPhotos"
                      :key="pi"
                      class="log-photo-thumb receipt-thumb"
                      :src="p.data"
                      :alt="`Scontrino ${pi + 1}`"
                      @click="openReceiptLightbox(a.id, pi)"
                    >
                  </div>

                  <!-- Azioni bottoni -->
                  <div class="log-actions">
                    <!-- Aggiungi foto -->
                    <button class="photo-btn" @click="triggerPhotoCapture(a.id)">
                      <svg viewBox="0 0 24 24">
                        <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
                        <circle cx="12" cy="13" r="4"/>
                      </svg>
                      Foto
                    </button>

                    <!-- Aggiungi scontrino (solo pausa pranzo) -->
                    <button
                      v-if="a.type === 'pausa_pranzo'"
                      class="photo-btn receipt-btn"
                      @click="triggerReceiptCapture(a.id)"
                    >
                      <svg viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                        <polyline points="14 2 14 8 20 8"/>
                        <line x1="9" y1="13" x2="15" y2="13"/>
                        <line x1="9" y1="17" x2="15" y2="17"/>
                      </svg>
                      Scontrino
                    </button>

                    <!-- Riprendi (solo attività completate e non in corso) -->
                    <button
                      v-if="a.duration !== null && a.id !== current?.id"
                      class="photo-btn resume-btn"
                      @click="resumeActivity(a.type, a.detail, a.note)"
                    >
                      <svg viewBox="0 0 24 24">
                        <polygon points="5 3 19 12 5 21 5 3"/>
                      </svg>
                      Riprendi
                    </button>

                    <!-- Elimina -->
                    <button
                      class="photo-btn delete-btn"
                      @click="deleteActivity(a.id)"
                    >
                      <svg viewBox="0 0 24 24">
                        <polyline points="3 6 5 6 21 6"/>
                        <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>
                      </svg>
                      Elimina
                    </button>
                  </div>
                </div>

                <!-- Durata a destra -->
                <div class="log-dur">
                  <template v-if="a.duration !== null">{{ fmtDur(a.duration) }}</template>
                  <span v-else class="log-ongoing">● In corso</span>
                </div>
              </div>

            </div>
          </div>
        </div>

      </div><!-- /timer-right-col -->
    </div><!-- /timer-cols -->

    <!-- Input file nascosti -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      style="display: none"
      @change="handleFileInput"
    >
    <input
      ref="receiptFileInputRef"
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      style="display: none"
      @change="handleReceiptInput"
    >
    <input
      ref="sitePhotoInputRef"
      type="file"
      accept="image/*"
      capture="environment"
      multiple
      style="display: none"
      @change="handleSitePhotoInput"
    >

  </div><!-- /view-timer -->
</template>

<style scoped lang="scss">
/* ──────────────────────────────────────────────────────────────────
   Gap uniforme tra le sezioni di ogni colonna (mobile e desktop)
   ────────────────────────────────────────────────────────────────── */
#timer-left-col,
#timer-right-col {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ──────────────────────────────────────────────────────────────────
   Header timer – giorno, data e orologio
   ────────────────────────────────────────────────────────────────── */
.hdr-day {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 3px;
}

.hdr-time {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 36px;
  font-weight: 900;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

/* ──────────────────────────────────────────────────────────────────
   Card attività corrente (#active-card)
   ────────────────────────────────────────────────────────────────── */
#active-card {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 22px 20px 18px;
  overflow: hidden;
  transition: border-color .35s ease;

  &.running { border-color: var(--orange); }
}

#active-card-bar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 3px;
  background: var(--dim);
  transition: background .35s ease;
}

#ac-badge {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  color: var(--dim);
  margin-top: 4px;
  margin-bottom: 8px;
  transition: color .35s;
}

#ac-badge-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dim);
  flex-shrink: 0;
  transition: background .35s;
}

#ac-name {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px;
  font-weight: 700;
  line-height: 1.2;
  color: var(--muted);
  margin-bottom: 8px;
  transition: color .35s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.running { color: var(--text); }
}

/* Numero ordine nella card attiva */
#ac-order {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 12px;

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

#timer-el {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 64px;
  font-weight: 900;
  letter-spacing: 4px;
  line-height: 1;
  color: var(--dim);
  transition: color .35s;
  font-variant-numeric: tabular-nums;

  &.running { color: var(--orange); }
}

#ac-loc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 12px;
  color: var(--muted);
}

#ac-loc-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dim);
  flex-shrink: 0;
  transition: background .35s;

  &.gps-ok  { background: var(--green); animation: blink 2.2s ease-in-out infinite; }
  &.gps-err { background: var(--red); }
}

/* ──────────────────────────────────────────────────────────────────
   Foto cantiere
   ────────────────────────────────────────────────────────────────── */
.site-photos-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
}

.site-photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.site-photo-wrap {
  position: relative;
  width: 70px;
  height: 70px;
}

.site-photo-thumb {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: var(--r-xs);
  border: 2px solid var(--border2);
  cursor: pointer;
  transition: transform .12s;

  &:hover { transform: scale(1.06); }
}

.site-photo-del {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 18px;
  height: 18px;
  background: var(--red);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  border: 2px solid var(--bg);
}

.site-photo-btn {
  width: 100%;
  justify-content: center;
}

/* ──────────────────────────────────────────────────────────────────
   Note di cantiere
   ────────────────────────────────────────────────────────────────── */
.day-notes-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px;
}

.day-notes-area {
  width: 100%;
  padding: 12px 14px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  line-height: 1.5;
  outline: none;
  resize: vertical;
  transition: border-color .15s;

  &:focus { border-color: var(--orange); }
  &::placeholder { color: var(--dim); }
}

/* ──────────────────────────────────────────────────────────────────
   Griglia azioni (4 card avvio attività)
   ────────────────────────────────────────────────────────────────── */
.action-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.action-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 16px 14px;
  cursor: pointer;
  transition: border-color .14s, transform .1s, background .14s;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  user-select: none;

  &:hover  { border-color: var(--border2); background: var(--surface2); }
  &:active { transform: scale(.96); }
}

.action-card-icon {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;

  svg {
    width: 20px;
    height: 20px;
    stroke: #fff;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.action-card-label {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 16px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .4px;
  line-height: 1.1;
}

.action-card-sub { font-size: 11px; color: var(--muted); margin-top: -4px; }

/* ──────────────────────────────────────────────────────────────────
   Log attività giornaliero
   ────────────────────────────────────────────────────────────────── */
.log-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);

  &:last-child { border-bottom: none; }
}

.log-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.log-body { flex: 1; min-width: 0; }

.log-title { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.log-meta  { font-size: 12px; color: var(--muted); margin-top: 2px; }

.log-dur {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: var(--muted);
  flex-shrink: 0;
  align-self: center;
}

.log-ongoing {
  color: var(--orange);
  font-size: 12px;
  font-weight: 600;
}

.log-photos {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
  margin-top: 7px;
  align-items: center;
}

.receipt-label {
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-right: 2px;
}

.log-photo-thumb {
  width: 50px;
  height: 50px;
  border-radius: var(--r-xs);
  object-fit: cover;
  cursor: pointer;
  border: 2px solid var(--border2);
  transition: transform .12s, border-color .12s;

  &:hover { transform: scale(1.08); border-color: var(--orange); }
}

.receipt-thumb {
  border-color: var(--yellow) !important;
}

/* Riga bottoni azioni sotto ogni log item */
.log-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

/* Bottone azione inline nel log */
.photo-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  background: var(--surface3);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  transition: color .12s, border-color .12s, background .12s;

  &:hover { color: var(--text); border-color: var(--border2); background: var(--surface2); }

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

.receipt-btn:hover { border-color: var(--yellow); color: var(--yellow); }
.resume-btn:hover  { border-color: var(--green); color: var(--green); }
.delete-btn:hover  { border-color: var(--red); color: var(--red); }
</style>
