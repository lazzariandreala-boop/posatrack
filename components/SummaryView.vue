<script setup lang="ts">
/**
 * SummaryView – Vista Riepilogo Giornaliero
 * ─────────────────────────────────────────────────────────────────────
 * Solo DESKTOP. Mostra per un giorno selezionato:
 *   - 3 box statistici (tempo totale, conteggio attività, km stimati)
 *   - Mappa Leaflet con percorso e marker numerati
 *   - Grafico doughnut distribuzione tempo per tipo (Chart.js)
 *   - Timeline cronologica con posizioni GPS e foto
 *   - Navigazione ← → tra i giorni + selettore data
 *   - Bottoni export PDF/Excel
 *
 * Dipendenze esterne (browser-only, caricamento dinamico in onMounted):
 *   - leaflet
 *   - chart.js
 */
import { ref, computed, watch, onUnmounted, nextTick } from 'vue'
import { useAppState }  from '~/composables/useAppState'
import { useStore }     from '~/composables/useStore'
import { useGeo }       from '~/composables/useGeo'
import { useExport }    from '~/composables/useExport'
import { ACT }          from '~/constants'
import type { Activity } from '~/types'
import { photoSrc } from '~/types'

const appState = useAppState()
const store    = useStore()
const geo      = useGeo()
const exporter = useExport()

// ── Data selezionata ──────────────────────────────────────────────────
const selectedDate = ref(todayStr())

/** Ritorna la data di oggi come stringa YYYY-MM-DD (fuso locale) */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Attività del giorno selezionato, ordinate cronologicamente */
const dayActivities = computed<Activity[]>(() =>
  store.forDate(selectedDate.value).slice().sort((a, b) => a.startTime - b.startTime)
)

const completedActivities = computed<Activity[]>(() =>
  dayActivities.value.filter(a => !(a.isPlanned && a.duration === 0))
)

const pendingPlannedActivities = computed<Activity[]>(() =>
  dayActivities.value.filter(a => a.isPlanned && a.duration === 0)
)

// ── Navigazione tra giorni ─────────────────────────────────────────────

/** Sposta la data di `delta` giorni */
function changeDay(delta: number): void {
  const d = new Date(selectedDate.value + 'T12:00:00')
  d.setDate(d.getDate() + delta)
  selectedDate.value = d.toISOString().split('T')[0]
}

// ── Statistiche ───────────────────────────────────────────────────────

const statTime = computed(() => {
  const completed = dayActivities.value.filter(a => a.duration !== null)
  const totalSec  = completed.reduce((s, a) => s + (a.duration ?? 0), 0)
  return totalSec ? fmtDur(totalSec) : '—'
})

const statCount = computed(() => dayActivities.value.length)

const statKm = computed(() => {
  const points = dayActivities.value.map(a => a.startLoc).filter(Boolean)
  let total = 0
  for (let i = 1; i < points.length; i++) total += geo.dist(points[i - 1]!, points[i]!)
  return total > 0.05 ? total.toFixed(1) : '—'
})

// ── Mappa Leaflet ─────────────────────────────────────────────────────

let mapInstance:  any = null  // istanza Leaflet (any per evitare problemi di tipo SSR)
let mapLib:       any = null  // modulo leaflet importato dinamicamente

async function renderMap(): Promise<void> {
  if (!mapLib) mapLib = (await import('leaflet')).default

  const L = mapLib

  // Distruggi la mappa precedente per evitare memory leak
  if (mapInstance) {
    mapInstance.remove()
    mapInstance = null
  }

  await nextTick()
  const mapEl = document.getElementById('map')
  if (!mapEl) return

  mapInstance = L.map('map', { zoomControl: true, attributionControl: false })

  // Tile layer OpenStreetMap (gratuito, no API key)
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 })
    .addTo(mapInstance)

  L.control.attribution({ prefix: '© <a href="https://openstreetmap.org">OpenStreetMap</a>' })
    .addTo(mapInstance)

  const acts      = dayActivities.value
  const allPoints: [number, number][] = []

  acts.forEach(a => {
    if (a.startLoc) allPoints.push([a.startLoc.lat, a.startLoc.lng])
    if (a.endLoc)   allPoints.push([a.endLoc.lat,   a.endLoc.lng])
  })

  // Nessun punto GPS: centra sull'area Vicenza (default azienda)
  if (!allPoints.length) {
    mapInstance.setView([45.55, 11.53], 9)
    return
  }

  // Linea tratteggiata che collega tutti i punti del percorso
  L.polyline(allPoints, { color: '#FF5F00', weight: 3, opacity: 0.65, dashArray: '8, 6' })
    .addTo(mapInstance)

  // Marker numerati per ogni attività
  acts.forEach((a, index) => {
    if (!a.startLoc) return
    const color = ACT[a.type]?.color || '#888'

    // Icona HTML personalizzata: cerchio colorato con numero progressivo
    const markerIcon = L.divIcon({
      className: '',
      html: `<div style="
        width:26px;height:26px;background:${color};
        border:3px solid white;border-radius:50%;
        box-shadow:0 3px 10px rgba(0,0,0,.45);
        display:flex;align-items:center;justify-content:center;
        font-size:11px;font-weight:800;color:#fff;
        font-family:'Barlow Condensed',sans-serif;
      ">${index + 1}</div>`,
      iconSize:   [26, 26],
      iconAnchor: [13, 13],
    })

    const startDt  = new Date(a.startTime)
    const timeStr  = `${String(startDt.getHours()).padStart(2, '0')}:${String(startDt.getMinutes()).padStart(2, '0')}`
    const photoInfo = (a.photos?.length) ? `<br><small>📸 ${a.photos.length} foto</small>` : ''

    L.marker([a.startLoc.lat, a.startLoc.lng], { icon: markerIcon })
      .addTo(mapInstance)
      .bindPopup(`
        <strong style="font-size:13px">${ACT[a.type]?.emoji} ${ACT[a.type]?.label}</strong><br>
        <span style="font-size:12px">${a.detail}</span><br>
        <small style="color:#666">
          Inizio: ${timeStr}${a.duration ? ' · ' + fmtDur(a.duration) : ''}
        </small>${photoInfo}
      `)

    // Marker secondario per la posizione di fine (se significativamente diversa)
    if (a.endLoc && geo.dist(a.startLoc, a.endLoc) > 0.01) {
      const endIcon = L.divIcon({
        className: '',
        html: `<div style="width:12px;height:12px;background:${color};border:2px solid white;border-radius:50%;opacity:.65;box-shadow:0 1px 5px rgba(0,0,0,.4)"></div>`,
        iconSize:   [12, 12],
        iconAnchor: [6, 6],
      })
      L.marker([a.endLoc.lat, a.endLoc.lng], { icon: endIcon }).addTo(mapInstance)
    }
  })

  mapInstance.fitBounds(L.latLngBounds(allPoints), { padding: [28, 28], maxZoom: 16 })
}

// ── Grafico Doughnut (Chart.js) ────────────────────────────────────────

let chartInstance: any = null

/** Dati aggregati per tipo: { tipo: secondi_totali } */
const chartTotals = computed(() => {
  const totals: Record<string, number> = {}
  dayActivities.value.forEach(a => {
    if (a.duration !== null) {
      totals[a.type] = (totals[a.type] || 0) + (a.duration ?? 0)
    }
  })
  return totals
})

const chartTypes = computed(() => Object.keys(chartTotals.value))

async function renderChart(): Promise<void> {
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)

  if (chartInstance) {
    chartInstance.destroy()
    chartInstance = null
  }

  const canvas = document.getElementById('pie-chart') as HTMLCanvasElement | null
  if (!canvas || !chartTypes.value.length) return

  chartInstance = new Chart(canvas.getContext('2d')!, {
    type: 'doughnut',
    data: {
      labels:   chartTypes.value.map(t => ACT[t]?.label || t),
      datasets: [{
        data:            chartTypes.value.map(t => chartTotals.value[t]),
        backgroundColor: chartTypes.value.map(t => ACT[t]?.color || '#888'),
        borderColor:     '#1C1C1C',
        borderWidth:     4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      cutout:              '68%',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: (ctx: any) => ` ${fmtDur(ctx.raw)}` },
          backgroundColor: '#242424',
          borderColor:     '#3E3E3E',
          borderWidth:     1,
          titleColor:      '#F0F0F0',
          bodyColor:       '#aaa',
        },
      },
    },
  })
}

// ── Re-render al cambio data ──────────────────────────────────────────

watch(selectedDate, async () => {
  await nextTick()
  await renderMap()
  await renderChart()
})

// ── Render al mount (solo se la vista è visibile) ─────────────────────
watch(() => appState.currentView.value, async (view) => {
  if (view === 'summary') {
    await nextTick()
    await renderMap()
    await renderChart()
  }
})

// ── Utility ──────────────────────────────────────────────────────────

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

/** Apre il lightbox per una foto */
function openLightbox(activityId: string, photoIndex: number): void {
  const activity = store.all().find(a => a.id === activityId)
  if (!activity?.photos?.[photoIndex]) return
  appState.openLightbox(photoSrc(activity.photos[photoIndex]))
}

// ── Scontrini del giorno ──────────────────────────────────────────────

/** Attività pausa_pranzo con almeno uno scontrino */
const receiptActivities = computed(() =>
  dayActivities.value.filter(a => a.type === 'pausa_pranzo' && (a.receiptPhotos?.length ?? 0) > 0)
)

// ── Foto di cantiere ──────────────────────────────────────────────────

const sitePhotos = computed(() => store.getSitePhotos(selectedDate.value))

// ── Cleanup ──────────────────────────────────────────────────────────
onUnmounted(() => {
  if (mapInstance) { mapInstance.remove(); mapInstance = null }
  if (chartInstance) { chartInstance.destroy(); chartInstance = null }
})

// ── Mobile: lista attività raggruppate per data ───────────────────────

type FilterKey = 'all' | 'today' | 'ongoing' | 'done'

const mobileFilter = ref<FilterKey>('all')

const todayDateStr = (() => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})()

const allActivities = computed(() => store.all().slice().sort((a, b) => b.startTime - a.startTime))

const filteredActivities = computed(() => {
  const acts = allActivities.value
  switch (mobileFilter.value) {
    case 'today':   return acts.filter(a => a.date === todayDateStr)
    case 'ongoing': return acts.filter(a => a.duration === null)
    case 'done':    return acts.filter(a => a.duration !== null)
    default:        return acts
  }
})

interface DayGroup {
  label:      string
  dateStr:    string
  activities: typeof allActivities.value
}

const groupedByDay = computed((): DayGroup[] => {
  const map = new Map<string, DayGroup>()
  filteredActivities.value.forEach(a => {
    if (!map.has(a.date)) {
      const d = new Date(a.date + 'T12:00:00')
      const labels: Record<string, string> = { [todayDateStr]: 'OGGI' }
      const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1)
      const tmrwStr = tmrw.toISOString().split('T')[0]
      labels[tmrwStr] = 'DOMANI'
      const dayNames = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB']
      const label = labels[a.date] ?? `${dayNames[d.getDay()]} ${d.getDate()} ${['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC'][d.getMonth()]}`
      map.set(a.date, { label, dateStr: a.date, activities: [] })
    }
    map.get(a.date)!.activities.push(a)
  })
  return Array.from(map.values())
})

const filterCounts = computed(() => ({
  all:     allActivities.value.length,
  today:   allActivities.value.filter(a => a.date === todayDateStr).length,
  ongoing: allActivities.value.filter(a => a.duration === null).length,
  done:    allActivities.value.filter(a => a.duration !== null).length,
}))

function fmtDurMob(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

function fmtTimeMob(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>

  <!-- ══════════════════════════════════════════════════════════════
       MOBILE: Lavori list (schermata "Lavori" del bottom nav)
       ══════════════════════════════════════════════════════════════ -->
  <div v-if="!appState.isDesktop.value" class="lavori-view">

    <!-- Header -->
    <div class="lavori-header">
      <div class="lavori-title">Lavori</div>
      <button class="lavori-filter-btn">
        <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </button>
    </div>

    <!-- Filter tabs -->
    <div class="lavori-tabs">
      <button class="lavori-tab" :class="{ active: mobileFilter === 'all' }"    @click="mobileFilter = 'all'">Tutti {{ filterCounts.all }}</button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'today' }"  @click="mobileFilter = 'today'">Oggi {{ filterCounts.today }}</button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'ongoing' }" @click="mobileFilter = 'ongoing'">
        <span class="lavori-tab-dot" />In corso {{ filterCounts.ongoing }}
      </button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'done' }"   @click="mobileFilter = 'done'">Completati {{ filterCounts.done }}</button>
    </div>

    <!-- Empty state -->
    <div v-if="!filteredActivities.length" class="lavori-empty">
      <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      <div class="lavori-empty-title">Nessuna attività</div>
      <div class="lavori-empty-sub">Avvia un'attività dalla scheda Oggi</div>
    </div>

    <!-- Grouped by date -->
    <div v-for="group in groupedByDay" :key="group.dateStr" class="lavori-group">
      <div class="lavori-group-label">{{ group.label }} · {{ group.activities.length }}</div>

      <div v-for="a in group.activities" :key="a.id" class="lavori-card">
        <div class="lavori-card-top">
          <div class="lavori-card-badges">
            <!-- Status badge -->
            <span v-if="a.duration === null" class="badge badge-live">In corso</span>
            <span v-else class="badge badge-ok">Completato</span>
            <!-- Type badge -->
            <span class="badge badge-muted">{{ ACT[a.type]?.label ?? a.type }}</span>
          </div>
          <span class="lavori-card-time">{{ fmtTimeMob(a.startTime) }}</span>
        </div>

        <div class="lavori-card-name">{{ a.detail || '—' }}</div>

        <div class="lavori-card-meta">
          <span v-if="a.startLoc" class="lavori-card-loc">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {{ geo.shortFmt(a.startLoc) }}
          </span>
          <span v-if="a.duration !== null" class="lavori-card-dur">
            {{ fmtDurMob(a.duration) }}
          </span>
          <span v-if="a.photos?.length" class="lavori-card-photos">
            <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
            {{ a.photos.length }}
          </span>
        </div>

        <div v-if="a.note" class="lavori-card-note">{{ a.note }}</div>
      </div>
    </div>

  </div><!-- /lavori-view -->


  <!-- ══════════════════════════════════════════════════════════════
       DESKTOP: existing summary with map + chart
       ══════════════════════════════════════════════════════════════ -->
  <div v-else class="view" id="view-summary">

    <!-- ── Header: titolo + navigazione giorni ────────────────────── -->
    <div class="page-header">
      <div class="page-title">Riepilogo</div>
      <div class="day-nav">
        <!-- Freccia giorno precedente -->
        <div class="day-nav-btn" title="Giorno precedente" @click="changeDay(-1)">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </div>
        <!-- Selettore data -->
        <input
          v-model="selectedDate"
          type="date"
          id="sum-date"
        >
        <!-- Freccia giorno successivo -->
        <div class="day-nav-btn" title="Giorno successivo" @click="changeDay(1)">
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </div>
      </div>
    </div>

    <!-- ── Bottoni esportazione ───────────────────────────────────── -->
    <div class="export-row">
      <button class="btn btn-ghost btn-sm btn-icon" @click="exporter.exportPDF(selectedDate)">
        <svg viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
          <line x1="9" y1="13" x2="15" y2="13"/>
          <line x1="9" y1="17" x2="15" y2="17"/>
        </svg>
        Esporta PDF
      </button>
      <button class="btn btn-ghost btn-sm btn-icon" @click="exporter.exportExcel(selectedDate)">
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="18" height="18" rx="2"/>
          <path d="M3 9h18M3 15h18M9 3v18"/>
        </svg>
        Esporta Excel
      </button>
    </div>

    <!-- ── Statistiche rapide ─────────────────────────────────────── -->
    <div class="stats-grid">
      <div class="stat-box">
        <div class="stat-val">{{ statTime }}</div>
        <div class="stat-lbl">Tempo totale</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">{{ statCount }}</div>
        <div class="stat-lbl">Attività</div>
      </div>
      <div class="stat-box">
        <div class="stat-val">{{ statKm }}</div>
        <div class="stat-lbl">km stimati</div>
      </div>
    </div>

    <!--
      Layout desktop: mappa e grafico affiancati (grid 2 col in main.scss).
      Su mobile si impilano verticalmente.
    -->
    <div id="summary-top-row">

      <!-- Mappa Leaflet -->
      <div>
        <div class="slabel">MAPPA SPOSTAMENTI</div>
        <div id="map-wrap"><div id="map" /></div>
      </div>

      <!-- Grafico doughnut distribuzione tempo -->
      <div>
        <div class="slabel">DISTRIBUZIONE TEMPO</div>
        <div class="card">
          <div class="card-body">

            <!-- Empty state: nessun dato -->
            <div v-if="!chartTypes.length" class="empty" style="padding: 24px">
              <p>Nessun dato da visualizzare</p>
            </div>

            <!-- Canvas Chart.js -->
            <div v-else id="chart-wrap">
              <canvas id="pie-chart" />
            </div>

            <!-- Legenda custom sotto il grafico -->
            <div id="chart-legend">
              <div
                v-for="t in chartTypes"
                :key="t"
                class="legend-row"
              >
                <div class="legend-dot" :style="{ background: ACT[t]?.color }" />
                <span class="legend-name">{{ ACT[t]?.label || t }}</span>
                <span class="legend-val">{{ fmtDur(chartTotals[t]) }}</span>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div><!-- /summary-top-row -->

    <!-- ── Timeline cronologica ───────────────────────────────────── -->
    <div id="summary-bottom-row">
      <div class="slabel">TIMELINE GIORNATA</div>
      <div class="card" style="margin-bottom: 16px">
        <div class="card-body">

          <!-- Empty state -->
          <div v-if="!completedActivities.length" class="empty">
            <svg viewBox="0 0 24 24">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
            <h3>Nessuna attività</h3>
            <p>Seleziona una giornata con attività registrate</p>
          </div>

          <!-- Lista timeline -->
          <div
            v-for="(a, index) in completedActivities"
            :key="a.id"
            class="tl-item"
          >
            <!-- Linea verticale connettore (non sull'ultimo elemento) -->
            <div v-if="index < completedActivities.length - 1" class="tl-line" />

            <!-- Pallino colorato -->
            <div class="tl-dot-col">
              <div class="tl-dot" :style="{ background: ACT[a.type]?.color || '#888' }" />
            </div>

            <!-- Contenuto testuale + foto -->
            <div class="tl-body">
              <!-- Intervallo orario e durata -->
              <div class="tl-time">
                {{ fmtTime(a.startTime) }}
                →
                {{ a.endTime ? fmtTime(a.endTime) : 'in corso' }}
                · <strong>{{ a.duration ? fmtDur(a.duration) : '…' }}</strong>
              </div>

              <div class="tl-title">{{ a.detail }}</div>
              <div class="tl-sub">
                {{ ACT[a.type]?.label || a.type }}
                <template v-if="a.note"> · {{ a.note }}</template>
              </div>

              <!-- Posizione GPS inizio -->
              <div class="tl-loc">
                <svg viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Inizio: {{ a.startLoc ? `${geo.fmt(a.startLoc)} (±${a.startLoc.acc}m)` : 'N/D' }}
              </div>

              <!-- Posizione GPS fine (se disponibile e diversa) -->
              <div v-if="a.endLoc" class="tl-loc" style="color: var(--dim)">
                <svg viewBox="0 0 24 24">
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/>
                  <circle cx="12" cy="10" r="3"/>
                </svg>
                Fine: {{ geo.fmt(a.endLoc) }} (±{{ a.endLoc.acc }}m)
              </div>

              <!-- Griglia foto (max 8 mostrate) -->
              <div v-if="a.photos?.length" class="tl-photos">
                <img
                  v-for="(p, pi) in a.photos.slice(0, 8)"
                  :key="pi"
                  class="tl-photo"
                  :src="photoSrc(p)"
                  alt="Foto"
                  @click="openLightbox(a.id, pi)"
                >
                <!-- Badge "+N" se ci sono più di 8 foto -->
                <div v-if="a.photos.length > 8" class="tl-more-photos">
                  +{{ a.photos.length - 8 }}
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div><!-- /summary-bottom-row -->

    <!-- ── Pianificato non eseguito ──────────────────────────────── -->
    <div v-if="pendingPlannedActivities.length" id="summary-planned-row">
      <div class="slabel">PIANIFICATO NON ESEGUITO</div>
      <div class="card" style="margin-bottom: 16px">
        <div class="card-body">
          <div
            v-for="a in pendingPlannedActivities"
            :key="a.id"
            class="tl-item"
          >
            <div class="tl-dot-col">
              <div class="tl-dot" :style="{ background: ACT[a.type]?.color || '#888', opacity: 0.4 }" />
            </div>
            <div class="tl-body">
              <div class="tl-time" style="color: var(--dim)">Non eseguito</div>
              <div class="tl-title" style="color: var(--muted)">{{ a.detail }}</div>
              <div class="tl-sub">{{ ACT[a.type]?.label || a.type }}<template v-if="a.orderNumber"> · Ord. {{ a.orderNumber }}</template></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Scontrini del giorno (solo desktop) ───────────────────── -->
    <div v-if="receiptActivities.length" id="summary-receipts-row">
      <div class="slabel">SCONTRINI PASTO</div>
      <div class="card" style="margin-bottom: 16px">
        <div class="card-body">
          <div
            v-for="a in receiptActivities"
            :key="a.id"
            class="receipt-row"
          >
            <div class="receipt-row-time">{{ fmtTime(a.startTime) }}</div>
            <div class="receipt-row-photos">
              <img
                v-for="(p, pi) in a.receiptPhotos"
                :key="pi"
                class="receipt-thumb"
                :src="photoSrc(p)"
                :alt="`Scontrino ${pi + 1}`"
                @click="appState.openLightbox(photoSrc(p))"
              >
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ── Foto di cantiere del giorno (solo desktop) ─────────────── -->
    <div v-if="sitePhotos.length" id="summary-sitephotos-row">
      <div class="slabel">FOTO CANTIERE</div>
      <div class="card" style="margin-bottom: 16px">
        <div class="card-body">
          <div class="site-photos-grid">
            <img
              v-for="(p, pi) in sitePhotos"
              :key="pi"
              class="site-photo-thumb"
              :src="photoSrc(p)"
              :alt="`Cantiere ${pi + 1}`"
              @click="appState.openLightbox(photoSrc(p))"
            >
          </div>
        </div>
      </div>
    </div>

  </div><!-- /view-summary (desktop v-else) -->

</template>

<style scoped lang="scss">
/* ──────────────────────────────────────────────────────────────────
   Statistiche rapide (3 box numerici)
   ────────────────────────────────────────────────────────────────── */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
  margin-bottom: 16px;
}

.stat-box {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 14px 10px;
  text-align: center;
}

.stat-val {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px;
  font-weight: 900;
  color: var(--orange);
  line-height: 1;
  margin-bottom: 5px;
  font-variant-numeric: tabular-nums;
}

.stat-lbl { font-size: 11px; color: var(--muted); font-weight: 500; }

/* ──────────────────────────────────────────────────────────────────
   Mappa Leaflet
   ────────────────────────────────────────────────────────────────── */
#map-wrap {
  height: 280px; // mobile: altezza compatta (sovrascritta a 420px in main.scss @media)
  border-radius: var(--r);
  overflow: hidden;
  border: 1px solid var(--border);

  @media (max-width: 799px) { margin-bottom: 16px; }
}

#map { height: 100%; width: 100%; }

/* ──────────────────────────────────────────────────────────────────
   Grafico doughnut
   ────────────────────────────────────────────────────────────────── */
#chart-wrap {
  position: relative;
  height: 235px;
  margin-top: 35px;
  margin-bottom: -25px;
}

#chart-legend { margin-top: 16px; }

.legend-row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.legend-dot  { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }
.legend-name { flex: 1; font-size: 13px; }
.legend-val  { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 700; color: var(--muted); }

/* ──────────────────────────────────────────────────────────────────
   Navigazione giorno (←  data  →)
   ────────────────────────────────────────────────────────────────── */
.day-nav { display: flex; align-items: center; gap: 8px; }

.day-nav-btn {
  width: 34px;
  height: 34px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background .12s;

  &:hover { background: var(--surface3); }

  svg {
    width: 16px;
    height: 16px;
    stroke: var(--text);
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

/* Input data inline nella navigazione */
#sum-date { width: auto; padding: 7px 11px; font-size: 13px; border-radius: var(--r-xs); }

/* Riga bottoni esportazione */
.export-row { display: flex; gap: 8px; margin-bottom: 18px; flex-wrap: wrap; }

/* ──────────────────────────────────────────────────────────────────
   Timeline giornata
   Ogni elemento: pallino + linea verticale | contenuto testo + foto
   ────────────────────────────────────────────────────────────────── */
.tl-item {
  display: flex;
  gap: 14px;
  position: relative;
}

/* Linea verticale connettore tra elementi (non sull'ultimo) */
.tl-line {
  position: absolute;
  left: 10px; // centrata sul pallino (larghezza 22px → centro a 11px)
  top: 23px;
  bottom: -4px;
  width: 2px;
  background: var(--border);
}

.tl-dot-col { padding-top: 3px; }

/* Pallino colorato nella timeline */
.tl-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  border: 3px solid var(--bg); // "sfondo" del pallino per far risaltare il colore
  flex-shrink: 0;
}

.tl-body  { flex: 1; padding-bottom: 20px; min-width: 0; }
.tl-time  { font-size: 11px; color: var(--muted); margin-bottom: 3px; }
.tl-title { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
.tl-sub   { font-size: 12px; color: var(--muted); }

/* Riga posizione GPS */
.tl-loc {
  font-size: 11px;
  color: var(--dim);
  margin-top: 5px;
  display: flex;
  align-items: center;
  gap: 5px;

  svg { width: 10px; height: 10px; stroke: currentColor; fill: none; stroke-width: 2; }
}

/* Griglia foto nella timeline */
.tl-photos { display: flex; gap: 7px; flex-wrap: wrap; margin-top: 8px; }

.tl-photo {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  object-fit: cover;
  cursor: pointer;
  border: 2px solid var(--border2);
  transition: transform .12s, border-color .12s;

  &:hover { transform: scale(1.06); border-color: var(--orange); }
}

/* ──────────────────────────────────────────────────────────────────
   Scontrini pasto
   ────────────────────────────────────────────────────────────────── */
.receipt-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);

  &:last-child { border-bottom: none; }
}

.receipt-row-time {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 18px;
  font-weight: 700;
  color: var(--muted);
  min-width: 52px;
}

.receipt-row-photos {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.receipt-thumb {
  width: 80px;
  height: 80px;
  object-fit: cover;
  border-radius: var(--r-xs);
  border: 2px solid var(--yellow);
  cursor: pointer;
  transition: transform .12s;

  &:hover { transform: scale(1.06); }
}

/* ──────────────────────────────────────────────────────────────────
   Foto cantiere (sezione desktop)
   ────────────────────────────────────────────────────────────────── */
.site-photos-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.site-photo-thumb {
  width: 120px;
  height: 120px;
  object-fit: cover;
  border-radius: var(--r-xs);
  border: 2px solid var(--border2);
  cursor: pointer;
  transition: transform .12s, border-color .12s;

  &:hover { transform: scale(1.04); border-color: var(--orange); }
}

/* Badge "+N" quando ci sono più di 8 foto */
.tl-more-photos {
  width: 72px;
  height: 72px;
  border-radius: 8px;
  background: var(--surface2);
  border: 2px solid var(--border2);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: var(--muted);
}

// ════════════════════════════════════════════════════════════════════
// MOBILE LAVORI VIEW
// ════════════════════════════════════════════════════════════════════

.lavori-view {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 24px;
}

.lavori-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
  padding-top: calc(20px + var(--safe-t));
}

.lavori-title {
  font-size: 26px;
  font-weight: 700;
  color: var(--ink);
}

.lavori-filter-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  cursor: pointer;

  svg {
    width: 16px;
    height: 16px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

// ── Filter tabs ───────────────────────────────────────────────────────
.lavori-tabs {
  display: flex;
  gap: 6px;
  padding: 0 20px 16px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.lavori-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: all .12s;

  &.active {
    background: var(--ink);
    border-color: var(--ink);
    color: var(--bg);
    font-weight: 600;
  }
}

.lavori-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
  display: inline-block;
}

// ── Empty state ──────────────────────────────────────────────────────
.lavori-empty {
  text-align: center;
  padding: 60px 20px;
  color: var(--muted);

  svg {
    width: 44px;
    height: 44px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.4;
    display: block;
    margin: 0 auto 14px;
  }
}

.lavori-empty-title { font-size: 15px; font-weight: 600; margin-bottom: 4px; }
.lavori-empty-sub   { font-size: 13px; }

// ── Day groups ───────────────────────────────────────────────────────
.lavori-group {
  margin-bottom: 8px;
}

.lavori-group-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  padding: 0 20px 8px;
}

// ── Activity card ────────────────────────────────────────────────────
.lavori-card {
  background: var(--surface);
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  padding: 14px 20px;
  margin-bottom: 2px;
  cursor: pointer;
  transition: background .12s;

  &:active { background: var(--surface-2); }
}

.lavori-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.lavori-card-badges {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.lavori-card-time {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
}

.lavori-card-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
  line-height: 1.3;
}

.lavori-card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12px;
  color: var(--muted);
}

.lavori-card-loc,
.lavori-card-dur,
.lavori-card-photos {
  display: flex;
  align-items: center;
  gap: 4px;

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

.lavori-card-note {
  font-size: 12px;
  color: var(--muted-2);
  margin-top: 6px;
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
