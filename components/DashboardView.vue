<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted, onMounted } from 'vue'
import { useAppState }  from '~/composables/useAppState'
import { useStore }     from '~/composables/useStore'
import { useAuth }      from '~/composables/useAuth'
import { ACT }          from '~/constants'
import { DAYS_SHORT, MONTHS_SHORT } from '~/constants'

const appState = useAppState()
const store    = useStore()
const auth     = useAuth()

// ── Period ────────────────────────────────────────────────────────────
const periodDays = ref(7)

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const periodActivities = computed(() => {
  if (periodDays.value === 0) return store.all()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - periodDays.value + 1)
  return store.forRange(fromDate.toISOString().split('T')[0], todayStr())
})

const uniqueDates = computed(() => [
  ...new Set(periodActivities.value.map(a => a.date))
].sort().reverse())

// ── Stats ─────────────────────────────────────────────────────────────
const statDays   = computed(() => uniqueDates.value.length)
const statActs   = computed(() => periodActivities.value.length)
const statPhotos = computed(() =>
  periodActivities.value.reduce((s, a) => s + (a.photos?.length || 0), 0)
)
const statHours  = computed(() => {
  const secs = periodActivities.value.filter(a => a.duration)
    .reduce((s, a) => s + (a.duration ?? 0), 0)
  return secs > 0 ? `${(Math.round(secs / 360) / 10).toFixed(1)}h` : '0h'
})

// ── Today ─────────────────────────────────────────────────────────────
const todayActivities   = computed(() => store.forRange(todayStr(), todayStr()))
const ongoingActivities = computed(() => todayActivities.value.filter(a => !a.endTime))
const ongoingCount      = computed(() => ongoingActivities.value.length)

const todayHours = computed(() => {
  const secs = todayActivities.value.filter(a => a.duration)
    .reduce((s, a) => s + (a.duration ?? 0), 0)
  if (!secs) return '0:00'
  return `${Math.floor(secs / 3600)}:${String(Math.floor((secs % 3600) / 60)).padStart(2, '0')}`
})

const workOrdersCount = computed(() => store.getAllWorkOrders().length)
const todayWorkOrders = computed(() => store.getWorkOrdersForDate(todayStr()))

// ── Timeline ──────────────────────────────────────────────────────────
const TL_START = 7
const TL_END   = 18
const TL_SPAN  = TL_END - TL_START

const timelineView = ref<'oggi' | 'settimana'>('oggi')

interface TimelineBlock {
  id: string; type: string; detail: string; color: string
  leftPct: number; widthPct: number; isLive: boolean
  startLabel: string; orderNumber?: string
}

const timelineBlocks = computed((): TimelineBlock[] =>
  todayActivities.value
    .filter(a => {
      const h = new Date(a.startTime).getHours() + new Date(a.startTime).getMinutes() / 60
      return h < TL_END
    })
    .map(a => {
      const start  = new Date(a.startTime)
      const startH = start.getHours() + start.getMinutes() / 60
      const endTs  = a.endTime ? new Date(a.endTime) : new Date()
      const endH   = endTs.getHours() + endTs.getMinutes() / 60
      const leftPct  = Math.max(0, (startH - TL_START) / TL_SPAN * 100)
      const rightPct = Math.min(100, (endH - TL_START) / TL_SPAN * 100)
      return {
        id:          a.id,
        type:        a.type,
        detail:      a.detail,
        color:       ACT[a.type]?.color ?? '#6b7280',
        leftPct,
        widthPct:    Math.max(1.5, rightPct - leftPct),
        isLive:      !a.endTime,
        startLabel:  `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,
        orderNumber: a.orderNumber,
      }
    })
)

const currentTimePct = computed(() => {
  const now  = new Date()
  const nowH = now.getHours() + now.getMinutes() / 60
  return Math.max(0, Math.min(100, (nowH - TL_START) / TL_SPAN * 100))
})

const timelineHours = Array.from({ length: TL_SPAN + 1 }, (_, i) => TL_START + i)

// ── Formatting ────────────────────────────────────────────────────────
function fmtDur(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

function fmtDateLabel(dateStr: string): string {
  const dt = new Date(dateStr + 'T12:00:00')
  return `${DAYS_SHORT[dt.getDay()]} ${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}`
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtRelTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60000)
  if (diff < 1) return 'adesso'
  if (diff < 60) return `${diff}m fa`
  return `${Math.floor(diff / 60)}h fa`
}

// ── User / workspace ──────────────────────────────────────────────────
const userName = computed(() => {
  const name = auth.currentUser.value?.displayName || auth.currentUser.value?.email || ''
  return name.split(' ')[0] || 'ciao'
})
const userInitials = computed(() => {
  const name = auth.currentUser.value?.displayName || auth.currentUser.value?.email || 'U'
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
})
const workspaceName = computed(() => appState.activeWorkspaceName.value || 'Workspace')

// ── Today long date ───────────────────────────────────────────────────
const todayLongDate = computed(() => {
  const d = new Date()
  const days   = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']
  const months = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
})

const todayShortDate = computed(() => {
  const d = new Date()
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
})

// ── Recent activities ─────────────────────────────────────────────────
const recentActivities = computed(() =>
  store.all().slice().sort((a, b) => b.startTime - a.startTime).slice(0, 6)
)

// ── Ongoing activity elapsed time (live updated) ──────────────────────
const elapsedSecs = ref(0)
let elapsedTimer: ReturnType<typeof setInterval> | null = null

function startElapsedTimer(): void {
  if (elapsedTimer) clearInterval(elapsedTimer)
  elapsedTimer = setInterval(() => {
    const ongoing = ongoingActivities.value[0]
    if (ongoing) {
      elapsedSecs.value = Math.floor((Date.now() - ongoing.startTime) / 1000)
    } else {
      elapsedSecs.value = 0
    }
  }, 1000)
}

const elapsedDisplay = computed(() => {
  if (!elapsedSecs.value) return '—'
  const h = Math.floor(elapsedSecs.value / 3600)
  const m = Math.floor((elapsedSecs.value % 3600) / 60)
  return h > 0 ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}` : `${String(m).padStart(2,'0')}m`
})

// ── Day history ───────────────────────────────────────────────────────
interface DayRow {
  dateStr: string; label: string; count: number; photoCnt: number; totalSec: number; types: string[]
}

const dayRows = computed<DayRow[]>(() =>
  uniqueDates.value.slice(0, 7).map(dateStr => {
    const dayActs  = periodActivities.value.filter(a => a.date === dateStr)
    const daySec   = dayActs.filter(a => a.duration).reduce((s, a) => s + (a.duration ?? 0), 0)
    return {
      dateStr,
      label:    fmtDateLabel(dateStr),
      count:    dayActs.length,
      photoCnt: dayActs.reduce((s, a) => s + (a.photos?.length || 0), 0),
      totalSec: daySec,
      types:    [...new Set(dayActs.map(a => a.type))],
    }
  })
)

function goToDay(dateStr: string): void {
  appState.navigate('summary')
  appState.showToast(`📅 ${fmtDateLabel(dateStr)}`)
}

// ── Bar chart ─────────────────────────────────────────────────────────
let barChartInstance: any = null
let barChartRightInstance: any = null
const barChartDates  = computed(() => [...uniqueDates.value].sort().slice(-14))
const barChartLabels = computed(() => barChartDates.value.map(d => {
  const dt = new Date(d + 'T12:00:00')
  return `${dt.getDate()}/${dt.getMonth() + 1}`
}))
const barChartData = computed(() =>
  barChartDates.value.map(d =>
    Math.round(periodActivities.value.filter(a => a.date === d && a.duration)
      .reduce((s, a) => s + (a.duration ?? 0), 0) / 360) / 10
  )
)

const chartConfig = (small = false) => ({
  type: 'bar' as const,
  data: {
    labels:   barChartLabels.value,
    datasets: [{ label: 'Ore', data: barChartData.value, backgroundColor: 'rgba(45,91,255,.5)', borderColor: '#2D5BFF', borderWidth: small ? 1 : 2, borderRadius: 4 }],
  },
  options: {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { backgroundColor: '#1D1C1A', borderColor: '#2A2826', borderWidth: 1, titleColor: '#F0EFE9', bodyColor: '#6B6963', callbacks: { label: (c: any) => ` ${c.raw}h` } } },
    scales: {
      x: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { color: '#6B6963', font: { size: small ? 9 : 10 } } },
      y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { color: '#6B6963', font: { size: small ? 9 : 10 } }, beginAtZero: true },
    },
  },
})

async function renderBarChart(): Promise<void> {
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null }
  await nextTick()
  const canvas = document.getElementById('db-bar-chart-main') as HTMLCanvasElement | null
  if (!canvas) return
  barChartInstance = new Chart(canvas.getContext('2d')!, chartConfig())
}

async function renderBarChartRight(): Promise<void> {
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  if (barChartRightInstance) { barChartRightInstance.destroy(); barChartRightInstance = null }
  await nextTick()
  const canvas = document.getElementById('db-bar-chart-right') as HTMLCanvasElement | null
  if (!canvas) return
  barChartRightInstance = new Chart(canvas.getContext('2d')!, chartConfig(true))
}

watch(periodDays, async () => { await nextTick(); await renderBarChart(); await renderBarChartRight() })
watch(() => appState.currentView.value, async (v) => { if (v === 'dashboard') { await nextTick(); await renderBarChart(); await renderBarChartRight() } })
watch(barChartData, async () => { if (appState.currentView.value === 'dashboard') { await nextTick(); await renderBarChart(); await renderBarChartRight() } })

onMounted(async () => { startElapsedTimer(); await nextTick(); await renderBarChartRight() })
onUnmounted(() => {
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null }
  if (barChartRightInstance) { barChartRightInstance.destroy(); barChartRightInstance = null }
  if (elapsedTimer) clearInterval(elapsedTimer)
})

// ── Search ────────────────────────────────────────────────────────────
const searchQuery = ref('')
</script>

<template>
  <div id="view-dashboard">

    <!-- ── TOPBAR ────────────────────────────────────────────────────── -->
    <div class="db-topbar">
      <div class="db-topbar-left">
        <div class="db-topbar-meta">{{ workspaceName }} · {{ todayShortDate }}</div>
        <h1 class="db-topbar-title">Buongiorno, {{ userName }}.</h1>
        <div class="db-topbar-sub">
          <span v-if="ongoingCount > 0">
            <span class="db-pulse-dot"></span>
            {{ ongoingCount }} attività in corso
          </span>
          <span v-else>Nessuna attività in corso</span>
          <span class="db-topbar-sep">·</span>
          <span>{{ todayActivities.length }} lavorazioni oggi</span>
        </div>
      </div>
      <div class="db-topbar-right">
        <div class="db-search-wrap">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="searchQuery"
            class="db-search-input"
            type="text"
            placeholder="Cerca lavorazioni, cantieri, attività..."
          />
          <kbd>⌘K</kbd>
        </div>
        <button class="db-new-btn" @click="appState.navigate('planning')">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuova lavorazione
        </button>
      </div>
    </div>

    <!-- ── BODY: main + right panel ──────────────────────────────────── -->
    <div class="db-body">

      <!-- ── MAIN COLUMN ─────────────────────────────────────────────── -->
      <div class="db-main">

        <!-- KPI Cards -->
        <div class="db-kpis">

          <div class="db-kpi">
            <div class="db-kpi-label">Lavorazioni pianificate</div>
            <div class="db-kpi-val">{{ workOrdersCount }}</div>
            <div class="db-kpi-sub">
              <svg viewBox="0 0 24 24"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
              {{ periodDays > 0 ? `ultimi ${periodDays}g` : 'tutto' }}
            </div>
          </div>

          <div class="db-kpi db-kpi-live" :class="{ 'has-live': ongoingCount > 0 }">
            <div class="db-kpi-label">In corso ora</div>
            <div class="db-kpi-val">
              {{ ongoingCount }}
              <span v-if="ongoingCount > 0" class="db-kpi-live-dot"></span>
            </div>
            <div class="db-kpi-sub db-kpi-sub-live" v-if="ongoingCount > 0">tracking live</div>
            <div class="db-kpi-sub" v-else>nessuna attiva</div>
          </div>

          <div class="db-kpi">
            <div class="db-kpi-label">Ore tracciate · oggi</div>
            <div class="db-kpi-val db-kpi-mono">{{ todayHours }}</div>
            <div class="db-kpi-sub">
              {{ todayActivities.length }} attività completate
            </div>
          </div>

          <div class="db-kpi">
            <div class="db-kpi-label">Foto scattate</div>
            <div class="db-kpi-val">{{ statPhotos }}</div>
            <div class="db-kpi-sub">{{ statActs }} attività · {{ statDays }}g</div>
          </div>

        </div><!-- /db-kpis -->

        <!-- Period tabs -->
        <div class="db-period-row">
          <div class="db-period-tabs">
            <button :class="{ active: periodDays === 7  }" @click="periodDays = 7">7 giorni</button>
            <button :class="{ active: periodDays === 30 }" @click="periodDays = 30">30 giorni</button>
            <button :class="{ active: periodDays === 90 }" @click="periodDays = 90">90 giorni</button>
            <button :class="{ active: periodDays === 0  }" @click="periodDays = 0">Tutto</button>
          </div>
        </div>

        <!-- ── Giornata di oggi (Timeline) ────────────────────────────── -->
        <div class="db-section">
          <div class="db-section-head">
            <div class="db-section-head-left">
              <span class="db-section-title">Giornata di oggi</span>
              <span class="db-section-date-pill">{{ todayLongDate }}</span>
            </div>
            <div class="db-view-toggle">
              <button :class="{ active: timelineView === 'oggi' }" @click="timelineView = 'oggi'">Oggi</button>
              <button :class="{ active: timelineView === 'settimana' }" @click="timelineView = 'settimana'">Settimana</button>
            </div>
          </div>

          <Transition name="fade" mode="out-in">

            <!-- OGGI: ora-per-ora timeline -->
            <div v-if="timelineView === 'oggi'" class="db-timeline" key="oggi">

              <!-- Empty state -->
              <div v-if="!todayActivities.length" class="db-tl-empty">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Nessuna attività registrata oggi
              </div>

              <template v-else>
                <!-- Time axis -->
                <div class="db-tl-axis">
                  <div
                    v-for="h in timelineHours"
                    :key="h"
                    class="db-tl-hour"
                    :style="{ left: `${(h - TL_START) / TL_SPAN * 100}%` }"
                  >{{ String(h).padStart(2,'0') }}</div>
                </div>

                <!-- Track row -->
                <div class="db-tl-track-wrap">

                  <!-- Operator label -->
                  <div class="db-tl-who">
                    <div class="db-tl-avatar">{{ userInitials }}</div>
                    <span class="db-tl-name">{{ userName }}</span>
                  </div>

                  <!-- Track -->
                  <div class="db-tl-track">

                    <!-- Grid lines -->
                    <div class="db-tl-grid">
                      <div
                        v-for="h in timelineHours"
                        :key="h"
                        class="db-tl-gridline"
                        :style="{ left: `${(h - TL_START) / TL_SPAN * 100}%` }"
                      />
                    </div>

                    <!-- Activity blocks -->
                    <div
                      v-for="block in timelineBlocks"
                      :key="block.id"
                      class="db-tl-block"
                      :class="{ 'is-live': block.isLive }"
                      :style="{
                        left:  `${block.leftPct}%`,
                        width: `${block.widthPct}%`,
                        background: block.color + (block.isLive ? 'FF' : 'BB'),
                        borderColor: block.color,
                      }"
                      :title="`${block.orderNumber ? block.orderNumber + ' · ' : ''}${ACT[block.type]?.label} — ${block.startLabel}`"
                    >
                      <span class="db-tl-block-label">
                        <span v-if="block.orderNumber" class="db-tl-block-code">{{ block.orderNumber }}</span>
                        {{ ACT[block.type]?.emoji }} {{ ACT[block.type]?.label }}
                      </span>
                    </div>

                    <!-- Current time line -->
                    <div
                      class="db-tl-now"
                      :style="{ left: `${currentTimePct}%` }"
                    >
                      <div class="db-tl-now-dot"></div>
                    </div>

                  </div><!-- /db-tl-track -->
                </div><!-- /db-tl-track-wrap -->

                <!-- Work orders for today (below track) -->
                <div v-if="todayWorkOrders.length" class="db-tl-orders">
                  <div
                    v-for="wo in todayWorkOrders.slice(0, 4)"
                    :key="wo.id"
                    class="db-tl-order-chip"
                    :style="{ borderLeftColor: ACT[wo.type]?.color }"
                  >
                    <span v-if="wo.orderNumber" class="db-tl-order-code">{{ wo.orderNumber }}</span>
                    <span>{{ ACT[wo.type]?.emoji }} {{ wo.detail.length > 30 ? wo.detail.slice(0, 28) + '…' : wo.detail }}</span>
                  </div>
                </div>

              </template>
            </div><!-- /oggi -->

            <!-- SETTIMANA: bar chart -->
            <div v-else class="db-timeline db-chart-view" key="settimana">
              <div class="db-chart-wrap">
                <canvas id="db-bar-chart-main" />
              </div>
            </div>

          </Transition>
        </div><!-- /timeline section -->

        <!-- ── Lavorazioni in corso ──────────────────────────────────── -->
        <div class="db-section">
          <div class="db-section-head">
            <div class="db-section-head-left">
              <span class="db-section-title">Lavorazioni in corso</span>
              <span v-if="ongoingCount > 0" class="db-live-badge">
                <span class="db-live-badge-dot"></span>
                {{ ongoingCount }} live
              </span>
            </div>
            <button class="db-link-btn" @click="appState.navigate('summary')">
              Apri tutte →
            </button>
          </div>

          <div v-if="!ongoingActivities.length" class="db-section-empty">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Nessuna attività in corso al momento
          </div>

          <div v-else class="db-jobs">
            <div
              v-for="a in ongoingActivities.slice(0, 3)"
              :key="a.id"
              class="db-job-card"
            >
              <div class="db-job-top">
                <div class="db-job-id-wrap">
                  <span v-if="a.orderNumber" class="db-job-code">{{ a.orderNumber }}</span>
                  <span class="db-job-type-badge" :style="{ background: `${ACT[a.type]?.color}22`, color: ACT[a.type]?.color }">
                    {{ ACT[a.type]?.emoji }} {{ ACT[a.type]?.label }}
                  </span>
                </div>
                <span class="db-job-status-live">
                  <span class="db-live-badge-dot"></span>
                  In corso
                </span>
              </div>

              <div class="db-job-title">{{ a.detail || '—' }}</div>

              <div class="db-job-meta">
                <span v-if="a.startLoc">
                  <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  GPS disponibile
                </span>
                <span>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Avviata {{ fmtTime(a.startTime) }}
                </span>
                <span v-if="a.photos?.length">
                  <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  {{ a.photos.length }} foto
                </span>
              </div>

              <!-- Progress bar (based on elapsed time vs. working day) -->
              <div class="db-job-progress-wrap">
                <div class="db-job-progress-bar">
                  <div
                    class="db-job-progress-fill"
                    :style="{
                      width: `${Math.min(100, Math.floor((Date.now() - a.startTime) / (8 * 3600000) * 100))}%`,
                      background: ACT[a.type]?.color,
                    }"
                  />
                </div>
                <span class="db-job-progress-label">{{ elapsedDisplay }}</span>
              </div>

            </div>
          </div>
        </div><!-- /lavorazioni in corso -->

        <!-- ── Storico giornate ──────────────────────────────────────── -->
        <div class="db-section">
          <div class="db-section-head">
            <span class="db-section-title">Storico giornate</span>
            <span class="db-section-sub">{{ statDays }} giorni</span>
          </div>
          <div v-if="!dayRows.length" class="db-section-empty">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Nessun dato nel periodo selezionato
          </div>
          <div v-for="row in dayRows" :key="row.dateStr" class="db-day-row" @click="goToDay(row.dateStr)">
            <div class="db-day-date">{{ row.label }}</div>
            <div class="db-day-body">
              <div class="db-day-count">{{ row.count }} attività<span v-if="row.photoCnt"> · 📸 {{ row.photoCnt }}</span></div>
              <div class="db-day-types">
                <span
                  v-for="t in row.types"
                  :key="t"
                  class="db-type-pill"
                  :style="{ background: `${ACT[t]?.color}22`, color: ACT[t]?.color }"
                >{{ ACT[t]?.emoji }} {{ ACT[t]?.label }}</span>
              </div>
            </div>
            <div class="db-day-time">{{ row.totalSec ? fmtDur(row.totalSec) : '—' }}</div>
            <svg class="db-day-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>

      </div><!-- /db-main -->

      <!-- ── RIGHT PANEL ──────────────────────────────────────────────── -->
      <div class="db-right">

        <!-- Team in campo -->
        <div class="db-panel-section">
          <div class="db-panel-head">
            <span class="db-panel-title">Team in campo</span>
            <span v-if="ongoingCount > 0" class="db-live-badge">
              <span class="db-live-badge-dot"></span>
              live
            </span>
          </div>

          <!-- Map placeholder -->
          <div class="db-map-placeholder">
            <div class="db-map-grid"></div>
            <template v-if="ongoingActivities.length">
              <div
                v-for="(a, idx) in ongoingActivities"
                :key="a.id"
                class="db-map-marker"
                :style="{ top: `${25 + (idx * 37 + 17) % 50}%`, left: `${20 + (idx * 53 + 23) % 60}%` }"
              >
                <div class="db-map-marker-dot" :style="{ background: ACT[a.type]?.color }"></div>
                <div class="db-map-marker-label" v-if="a.orderNumber">{{ a.orderNumber }}</div>
              </div>
            </template>
            <div v-if="!ongoingActivities.length" class="db-map-empty">
              <svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
              Nessun operatore attivo
            </div>
            <div class="db-map-user-marker" v-if="ongoingCount > 0">
              <div class="db-map-user-avatar">{{ userInitials }}</div>
            </div>
          </div>

          <!-- Team list -->
          <div class="db-team-list">
            <div class="db-team-item" :class="{ 'is-active': ongoingCount > 0 }">
              <div class="db-team-avatar" :class="{ 'is-live': ongoingCount > 0 }">{{ userInitials }}</div>
              <div class="db-team-info">
                <div class="db-team-name">{{ auth.currentUser.value?.displayName || auth.currentUser.value?.email || 'Utente' }}</div>
                <div class="db-team-status" v-if="ongoingActivities.length">
                  <span class="db-team-status-dot" :style="{ background: ACT[ongoingActivities[0].type]?.color }"></span>
                  {{ ACT[ongoingActivities[0].type]?.label }} · {{ ongoingActivities[0].detail.slice(0, 20) }}
                </div>
                <div class="db-team-status db-team-status-idle" v-else>Nessuna attività</div>
              </div>
              <div class="db-team-elapsed" v-if="ongoingActivities.length">{{ elapsedDisplay }}</div>
              <div class="db-team-elapsed db-team-elapsed-idle" v-else>—</div>
            </div>
          </div>
        </div>

        <!-- Attività recenti -->
        <div class="db-panel-section">
          <div class="db-panel-head">
            <span class="db-panel-title">Attività recenti</span>
          </div>
          <div v-if="!recentActivities.length" class="db-section-empty" style="padding: 20px 16px">
            Nessuna attività registrata
          </div>
          <div v-else class="db-feed">
            <div v-for="a in recentActivities" :key="a.id" class="db-feed-item">
              <div class="db-feed-avatar">{{ userInitials }}</div>
              <div class="db-feed-body">
                <div class="db-feed-text">
                  <span class="db-feed-act" :style="{ color: ACT[a.type]?.color }">{{ ACT[a.type]?.emoji }} {{ ACT[a.type]?.label }}</span>
                  <span v-if="a.detail" class="db-feed-detail"> · {{ a.detail.length > 24 ? a.detail.slice(0, 22) + '…' : a.detail }}</span>
                </div>
                <div class="db-feed-time">{{ fmtRelTime(a.startTime) }} · {{ fmtTime(a.startTime) }}</div>
              </div>
              <span v-if="!a.endTime" class="db-feed-live">live</span>
            </div>
          </div>
        </div>

        <!-- Week overview chart -->
        <div class="db-panel-section">
          <div class="db-panel-head">
            <span class="db-panel-title">Ore per giorno</span>
            <span class="db-section-sub">{{ statHours }} tot.</span>
          </div>
          <div class="db-mini-chart-wrap">
            <canvas id="db-bar-chart-right" />
          </div>
        </div>

      </div><!-- /db-right -->

    </div><!-- /db-body -->

  </div><!-- /view-dashboard -->
</template>

<style scoped lang="scss">
// ── Reset view padding (override main.scss desktop) ───────────────────
#view-dashboard {
  padding: 0 !important;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
}

// ── Topbar ────────────────────────────────────────────────────────────
.db-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 20px 28px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  background: var(--surface);
  flex-wrap: wrap;
}

.db-topbar-meta {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 3px;
  letter-spacing: .3px;
}

.db-topbar-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 4px;
  line-height: 1.2;
}

.db-topbar-sub {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted-2);
}

.db-topbar-sep { color: var(--border-strong); }

.db-pulse-dot {
  display: inline-block;
  width: 7px; height: 7px;
  border-radius: 50%;
  background: var(--live);
  animation: db-pulse 1.5s ease-in-out infinite;
  vertical-align: middle;
  margin-right: 4px;
}

@keyframes db-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: .6; transform: scale(.8); }
}

.db-topbar-right {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.db-search-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  min-width: 260px;
  transition: border-color .12s;
  &:focus-within { border-color: var(--border-strong); }

  svg {
    width: 14px; height: 14px;
    stroke: var(--muted); fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
  }
  kbd {
    margin-left: auto;
    font-size: 10px;
    color: var(--muted);
    background: var(--surface-3);
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    padding: 1px 5px;
    font-family: var(--ff);
  }
}

.db-search-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-family: var(--ff);
  font-size: 12px;
  color: var(--ink);
  &::placeholder { color: var(--muted); }
}

.db-new-btn {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  background: var(--live);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  white-space: nowrap;
  transition: filter .12s;
  &:hover  { filter: brightness(1.1); }
  &:active { filter: brightness(.9); }
  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2.5; stroke-linecap: round;
  }
}

// ── Body layout ───────────────────────────────────────────────────────
.db-body {
  display: grid;
  grid-template-columns: 1fr 300px;
  flex: 1;
  overflow: hidden;
  min-height: 0;
}

.db-main {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}

.db-right {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  background: var(--surface);
}

// ── KPI Cards ─────────────────────────────────────────────────────────
.db-kpis {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  border-bottom: 1px solid var(--border);
}

.db-kpi {
  padding: 20px 22px;
  border-right: 1px solid var(--border);
  cursor: default;
  transition: background .12s;
  &:last-child { border-right: none; }
  &:hover { background: var(--surface-2); }
}

.db-kpi-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .7px;
  margin-bottom: 10px;
}

.db-kpi-val {
  font-size: 34px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1;
  margin-bottom: 8px;
  font-variant-numeric: tabular-nums;
  display: flex;
  align-items: center;
  gap: 8px;

  &.db-kpi-mono { font-family: var(--ff-mono); font-size: 26px; }
}

.db-kpi-live-dot {
  display: inline-block;
  width: 9px; height: 9px;
  border-radius: 50%;
  background: var(--live);
  animation: db-pulse 1.5s ease-in-out infinite;
}

.db-kpi-sub {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--muted);

  svg {
    width: 11px; height: 11px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  }

  &.db-kpi-sub-live { color: var(--live); font-weight: 600; }
}

// ── Period tabs ───────────────────────────────────────────────────────
.db-period-row {
  padding: 12px 22px;
  border-bottom: 1px solid var(--border);
}

.db-period-tabs {
  display: inline-flex;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;

  button {
    padding: 4px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-xs);
    font-family: var(--ff);
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
    cursor: pointer;
    transition: background .12s, color .12s;
    &:hover  { background: var(--surface-2); color: var(--ink); }
    &.active { background: var(--surface-3); color: var(--ink); font-weight: 600; }
  }
}

// ── Section ───────────────────────────────────────────────────────────
.db-section {
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}

.db-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--border);
}

.db-section-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.db-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.db-section-date-pill {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 2px 9px;
  border-radius: 20px;
  font-weight: 500;
}

.db-section-sub {
  font-size: 11px;
  color: var(--muted);
}

.db-section-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 22px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;
  svg {
    width: 20px; height: 20px;
    stroke: currentColor; fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
    opacity: .4;
  }
}

.db-view-toggle {
  display: inline-flex;
  gap: 2px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 2px;

  button {
    padding: 4px 10px;
    border: none;
    background: transparent;
    border-radius: 3px;
    font-family: var(--ff);
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
    cursor: pointer;
    &.active { background: var(--surface-3); color: var(--ink); font-weight: 600; }
  }
}

.db-link-btn {
  background: transparent;
  border: none;
  font-family: var(--ff);
  font-size: 12px;
  color: var(--primary-ink);
  cursor: pointer;
  padding: 3px 0;
  &:hover { text-decoration: underline; }
}

.db-live-badge {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 9px;
  background: var(--live-soft);
  color: var(--live);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
}

.db-live-badge-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  background: var(--live);
  animation: db-pulse 1.5s ease-in-out infinite;
  flex-shrink: 0;
}

// ── Timeline ──────────────────────────────────────────────────────────
.db-timeline {
  padding: 16px 22px 20px;
}

.db-tl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
  svg {
    width: 20px; height: 20px;
    stroke: currentColor; fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
    opacity: .4;
  }
}

// Time axis labels (above track)
.db-tl-axis {
  position: relative;
  height: 18px;
  margin-left: 100px;
  margin-bottom: 4px;
}

.db-tl-hour {
  position: absolute;
  transform: translateX(-50%);
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}

// Row: avatar label + track
.db-tl-track-wrap {
  display: flex;
  align-items: center;
  gap: 0;
  height: 44px;
}

.db-tl-who {
  flex: 0 0 100px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding-right: 10px;
}

.db-tl-avatar {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-ink);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.db-tl-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-tl-track {
  flex: 1;
  height: 36px;
  position: relative;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.db-tl-grid {
  position: absolute;
  inset: 0;
}

.db-tl-gridline {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: var(--border);
  transform: translateX(-50%);
}

.db-tl-block {
  position: absolute;
  top: 4px;
  bottom: 4px;
  border-radius: 4px;
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  padding: 0 6px;
  cursor: default;
  min-width: 20px;
  overflow: hidden;
  transition: filter .1s;

  &:hover   { filter: brightness(1.15); z-index: 2; }
  &.is-live { box-shadow: 0 0 0 1px var(--live); }
}

.db-tl-block-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-tl-block-code {
  font-family: var(--ff-mono);
  font-size: 9px;
  opacity: .8;
  margin-right: 4px;
}

.db-tl-now {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--live);
  transform: translateX(-50%);
  z-index: 3;
}

.db-tl-now-dot {
  position: absolute;
  top: -3px;
  left: 50%;
  transform: translateX(-50%);
  width: 8px; height: 8px;
  border-radius: 50%;
  background: var(--live);
}

// Today's work orders chips below track
.db-tl-orders {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
  margin-left: 100px;
}

.db-tl-order-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-left-width: 3px;
  border-radius: var(--radius-xs);
  font-size: 11px;
  color: var(--ink-2);
  cursor: default;
}

.db-tl-order-code {
  font-family: var(--ff-mono);
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
}

// Chart view (settimana)
.db-chart-view { padding: 16px 22px 20px; }
.db-chart-wrap { height: 160px; }
.db-mini-chart-wrap { height: 120px; padding: 0 16px 16px; }

// Transition
.fade-enter-active, .fade-leave-active { transition: opacity .15s; }
.fade-enter-from, .fade-leave-to { opacity: 0; }

// ── Job cards ─────────────────────────────────────────────────────────
.db-jobs {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 10px;
}

.db-job-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  border-left: 3px solid var(--live);
  transition: border-color .12s, background .12s;
  &:hover { background: var(--surface-3); }
}

.db-job-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.db-job-id-wrap {
  display: flex;
  align-items: center;
  gap: 7px;
}

.db-job-code {
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
}

.db-job-type-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}

.db-job-status-live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  color: var(--live);
}

.db-job-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-job-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 10px;

  span {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  svg {
    width: 11px; height: 11px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.db-job-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.db-job-progress-bar {
  flex: 1;
  height: 4px;
  background: var(--border);
  border-radius: 2px;
  overflow: hidden;
}

.db-job-progress-fill {
  height: 100%;
  border-radius: 2px;
  transition: width .3s;
}

.db-job-progress-label {
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted-2);
  flex-shrink: 0;
  min-width: 32px;
  text-align: right;
}

// ── Day rows ──────────────────────────────────────────────────────────
.db-day-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 11px 22px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .1s;
  &:hover { background: var(--surface-2); }
  &:last-child { border-bottom: none; }
}

.db-day-date  { font-size: 12px; font-weight: 700; color: var(--ink); min-width: 80px; flex-shrink: 0; }
.db-day-body  { flex: 1; min-width: 0; }
.db-day-count { font-size: 11px; color: var(--muted); margin-bottom: 3px; }

.db-day-types { display: flex; gap: 4px; flex-wrap: wrap; }

.db-type-pill {
  font-size: 9px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 10px;
  letter-spacing: .3px;
}

.db-day-time  {
  font-family: var(--ff-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--muted-2);
  flex-shrink: 0;
}

.db-day-arrow {
  width: 14px; height: 14px;
  stroke: var(--muted); fill: none;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
}

// ── Right panel ───────────────────────────────────────────────────────
.db-panel-section {
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}

.db-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.db-panel-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
}

// ── Map placeholder ───────────────────────────────────────────────────
.db-map-placeholder {
  position: relative;
  height: 140px;
  background: #0D1117;
  overflow: hidden;
}

.db-map-grid {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0, rgba(255,255,255,.03) 1px, transparent 1px, transparent 24px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0, rgba(255,255,255,.03) 1px, transparent 1px, transparent 24px);
}

.db-map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
  svg {
    width: 18px; height: 18px;
    stroke: currentColor; fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
    opacity: .5;
  }
}

.db-map-marker {
  position: absolute;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
}

.db-map-marker-dot {
  width: 12px; height: 12px;
  border-radius: 50%;
  box-shadow: 0 0 0 3px rgba(255,255,255,.15);
}

.db-map-marker-label {
  font-family: var(--ff-mono);
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: rgba(0,0,0,.6);
  padding: 1px 4px;
  border-radius: 3px;
  white-space: nowrap;
}

.db-map-user-marker {
  position: absolute;
  bottom: 16px;
  right: 16px;
}

.db-map-user-avatar {
  width: 28px; height: 28px;
  border-radius: 50%;
  background: var(--live);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid rgba(255,255,255,.3);
  box-shadow: 0 0 0 3px var(--live-soft);
}

// ── Team list ─────────────────────────────────────────────────────────
.db-team-list { padding: 8px 0; }

.db-team-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  transition: background .1s;
  &:hover { background: var(--surface-2); }
  &.is-active .db-team-avatar { border-color: var(--live); }
}

.db-team-avatar {
  width: 30px; height: 30px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-ink);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  border: 2px solid transparent;
  transition: border-color .12s;

  &.is-live { border-color: var(--live); }
}

.db-team-info { flex: 1; min-width: 0; }

.db-team-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.db-team-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.db-team-status-idle { color: var(--muted); }
}

.db-team-status-dot {
  width: 6px; height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.db-team-elapsed {
  font-family: var(--ff-mono);
  font-size: 12px;
  font-weight: 600;
  color: var(--ink-2);
  flex-shrink: 0;

  &.db-team-elapsed-idle { color: var(--muted); }
}

// ── Activity feed ─────────────────────────────────────────────────────
.db-feed { display: flex; flex-direction: column; }

.db-feed-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  transition: background .1s;
  &:hover { background: var(--surface-2); }
  &:last-child { border-bottom: none; }
}

.db-feed-avatar {
  width: 26px; height: 26px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-ink);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.db-feed-body { flex: 1; min-width: 0; }

.db-feed-text {
  font-size: 11px;
  color: var(--ink-2);
  margin-bottom: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-feed-act { font-weight: 600; }
.db-feed-detail { color: var(--muted); }

.db-feed-time {
  font-size: 10px;
  color: var(--muted);
}

.db-feed-live {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: var(--live-soft);
  color: var(--live);
  border-radius: 8px;
  font-size: 9px;
  font-weight: 700;
  flex-shrink: 0;
}
</style>
