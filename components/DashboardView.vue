<script setup lang="ts">
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useAppState }  from '~/composables/useAppState'
import { useStore }     from '~/composables/useStore'
import { useAuth }      from '~/composables/useAuth'
import { ACT }          from '~/constants'
import { DAYS_SHORT, MONTHS_SHORT } from '~/constants'

const appState = useAppState()
const store    = useStore()
const auth     = useAuth()

// ── Period selection ──────────────────────────────────────────────────
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

// ── Aggregate stats ───────────────────────────────────────────────────
const statDays  = computed(() => uniqueDates.value.length)
const statActs  = computed(() => periodActivities.value.length)

const statHours = computed(() => {
  const completed = periodActivities.value.filter(a => a.duration !== null)
  const totalSec  = completed.reduce((s, a) => s + (a.duration ?? 0), 0)
  return totalSec > 0 ? `${(Math.round(totalSec / 360) / 10).toFixed(1)}h` : '0h'
})

const statPhotos = computed(() =>
  periodActivities.value.reduce((s, a) => s + (a.photos?.length || 0), 0)
)

// ── Today ─────────────────────────────────────────────────────────────
const todayActivities   = computed(() => store.forRange(todayStr(), todayStr()))
const ongoingActivities = computed(() => todayActivities.value.filter(a => !a.endTime))
const ongoingCount      = computed(() => ongoingActivities.value.length)

const todayHours = computed(() => {
  const secs = todayActivities.value
    .filter(a => a.duration)
    .reduce((s, a) => s + (a.duration ?? 0), 0)
  if (!secs) return '0:00'
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return `${h}:${String(m).padStart(2, '0')}`
})

const recentActivities = computed(() =>
  store.all().slice().sort((a, b) => b.startTime - a.startTime).slice(0, 6)
)

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
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function fmtRelTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60000)
  if (diff < 1) return 'adesso'
  if (diff < 60) return `${diff}m fa`
  return `${Math.floor(diff / 60)}h fa`
}

// ── Day rows ──────────────────────────────────────────────────────────
interface DayRow {
  dateStr: string; label: string; count: number; photoCnt: number; totalSec: number; types: string[]
}

const dayRows = computed<DayRow[]>(() =>
  uniqueDates.value.map(dateStr => {
    const dayActs  = periodActivities.value.filter(a => a.date === dateStr)
    const daySec   = dayActs.filter(a => a.duration).reduce((s, a) => s + (a.duration ?? 0), 0)
    const photoCnt = dayActs.reduce((s, a) => s + (a.photos?.length || 0), 0)
    return {
      dateStr,
      label:    fmtDateLabel(dateStr),
      count:    dayActs.length,
      photoCnt,
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

const barChartDates  = computed(() => [...uniqueDates.value].sort().slice(-14))
const barChartLabels = computed(() => barChartDates.value.map(d => {
  const dt = new Date(d + 'T12:00:00')
  return `${dt.getDate()}/${dt.getMonth() + 1}`
}))
const barChartData   = computed(() =>
  barChartDates.value.map(d =>
    Math.round(
      periodActivities.value
        .filter(a => a.date === d && a.duration !== null)
        .reduce((s, a) => s + (a.duration ?? 0), 0) / 360
    ) / 10
  )
)

async function renderBarChart(): Promise<void> {
  const { Chart, registerables } = await import('chart.js')
  Chart.register(...registerables)
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null }
  await nextTick()
  const canvas = document.getElementById('bar-chart') as HTMLCanvasElement | null
  if (!canvas) return
  barChartInstance = new Chart(canvas.getContext('2d')!, {
    type: 'bar',
    data: {
      labels:   barChartLabels.value,
      datasets: [{
        label:           'Ore lavorate',
        data:            barChartData.value,
        backgroundColor: 'rgba(45, 91, 255, .45)',
        borderColor:     '#2D5BFF',
        borderWidth:     2,
        borderRadius:    6,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1D1C1A',
          borderColor:     '#2A2826',
          borderWidth:     1,
          titleColor:      '#F0EFE9',
          bodyColor:       '#6B6963',
          callbacks: { label: (ctx: any) => ` ${ctx.raw}h lavorate` },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { color: '#6B6963', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.03)' }, ticks: { color: '#6B6963', font: { size: 11 } }, beginAtZero: true },
      },
    },
  })
}

watch(periodDays, async () => { await nextTick(); await renderBarChart() })
watch(() => appState.currentView.value, async (view) => {
  if (view === 'dashboard') { await nextTick(); await renderBarChart() }
})
watch(barChartData, async () => {
  if (appState.currentView.value === 'dashboard') { await nextTick(); await renderBarChart() }
})
onUnmounted(() => { if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null } })

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

const todayHeading = computed(() => {
  const d = new Date()
  const days   = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato']
  const months = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
  return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
})

const todayShort = computed(() => {
  const d = new Date()
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${workspaceName.value} · ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`
})
</script>

<template>
  <div class="view" id="view-dashboard">

    <!-- ── Top header ──────────────────────────────────────────────── -->
    <div class="db-top">
      <div class="db-greeting">
        <div class="db-ws-label">{{ todayShort }}</div>
        <h1 class="db-title">Buongiorno, {{ userName }}.</h1>
        <div class="db-subtitle">
          <template v-if="ongoingCount > 0">{{ ongoingCount }} attività in corso</template>
          <template v-else>Nessuna attività in corso</template>
          · {{ todayActivities.length }} lavorazioni oggi
        </div>
      </div>
      <div class="db-top-actions">
        <div class="db-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <span>Cerca…</span>
          <kbd>⌘K</kbd>
        </div>
        <button class="db-cta" @click="appState.navigate('planning')">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuova lavorazione
        </button>
      </div>
    </div>

    <!-- ── Stat cards ──────────────────────────────────────────────── -->
    <div class="db-stats">
      <div class="db-stat">
        <div class="db-stat-label">Lavorazioni</div>
        <div class="db-stat-val">{{ statActs }}</div>
        <div class="db-stat-sub">{{ periodDays > 0 ? `ultimi ${periodDays}g` : 'tutto storico' }}</div>
      </div>
      <div class="db-stat">
        <div class="db-stat-label">In corso ora</div>
        <div class="db-stat-val">{{ ongoingCount }}</div>
        <div class="db-stat-sub" :class="{ 'db-stat-live': ongoingCount > 0 }">
          {{ ongoingCount > 0 ? 'tracking live' : 'nessuna attiva' }}
        </div>
      </div>
      <div class="db-stat">
        <div class="db-stat-label">Ore tracciate · oggi</div>
        <div class="db-stat-val db-stat-mono">{{ todayHours }}</div>
        <div class="db-stat-sub">{{ todayActivities.length }} attività</div>
      </div>
      <div class="db-stat">
        <div class="db-stat-label">Foto scattate</div>
        <div class="db-stat-val">{{ statPhotos }}</div>
        <div class="db-stat-sub">nel periodo</div>
      </div>
    </div>

    <!-- ── Period tabs ─────────────────────────────────────────────── -->
    <div class="db-period-row">
      <div class="db-period-tabs">
        <button :class="{ active: periodDays === 7  }" @click="periodDays = 7">7 giorni</button>
        <button :class="{ active: periodDays === 30 }" @click="periodDays = 30">30 giorni</button>
        <button :class="{ active: periodDays === 90 }" @click="periodDays = 90">90 giorni</button>
        <button :class="{ active: periodDays === 0  }" @click="periodDays = 0">Tutto</button>
      </div>
    </div>

    <!-- ── Main 2-column grid ──────────────────────────────────────── -->
    <div class="db-grid">

      <!-- Left: Today + In corso + Storico ──────────────────────── -->
      <div class="db-col-main">

        <!-- Giornata di oggi -->
        <div class="db-section">
          <div class="db-section-head">
            <div>
              <span class="db-section-title">Giornata di oggi</span>
              <span class="db-section-sub">{{ todayHeading }}</span>
            </div>
          </div>

          <div v-if="!todayActivities.length" class="db-empty">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Nessuna attività oggi
          </div>
          <div v-else class="db-today-list">
            <div
              v-for="a in todayActivities.slice().sort((x, y) => x.startTime - y.startTime)"
              :key="a.id"
              class="db-today-item"
            >
              <div class="db-today-time">{{ fmtTime(a.startTime) }}</div>
              <div class="db-today-line">
                <div class="db-today-dot" :class="{ live: !a.endTime }"></div>
                <div class="db-today-track"></div>
              </div>
              <div class="db-today-content">
                <div class="db-today-type">
                  <span class="db-type-dot" :style="{ background: ACT[a.type]?.color || 'var(--muted)' }"></span>
                  {{ ACT[a.type]?.label || a.type }}
                  <span v-if="!a.endTime" class="db-live-badge">live</span>
                </div>
                <div class="db-today-addr" v-if="a.detail">{{ a.detail }}</div>
              </div>
              <div class="db-today-dur" v-if="a.duration">{{ fmtDur(a.duration) }}</div>
            </div>
          </div>
        </div>

        <!-- Lavorazioni in corso -->
        <div class="db-section" v-if="ongoingActivities.length">
          <div class="db-section-head">
            <span class="db-section-title">Lavorazioni in corso</span>
            <span class="db-live-badge db-live-badge-lg">{{ ongoingCount }} live</span>
          </div>
          <div class="db-ongoing-list">
            <div v-for="a in ongoingActivities" :key="a.id" class="db-ongoing-card">
              <div class="db-ongoing-top">
                <span class="db-ongoing-id">{{ a.id?.slice(-6).toUpperCase() || '—' }}</span>
                <span class="db-ongoing-status">In corso</span>
              </div>
              <div class="db-ongoing-type">
                {{ ACT[a.type]?.emoji }} {{ ACT[a.type]?.label }}
              </div>
              <div class="db-ongoing-meta">
                <span v-if="a.detail">
                  <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  {{ a.detail }}
                </span>
                <span>
                  <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  Avviata {{ fmtTime(a.startTime) }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Storico giorni -->
        <div class="db-section">
          <div class="db-section-head">
            <span class="db-section-title">Storico giornate</span>
            <span class="db-section-sub">{{ statDays }} giorni</span>
          </div>
          <div v-if="!dayRows.length" class="db-empty">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Nessun dato nel periodo selezionato
          </div>
          <div
            v-for="row in dayRows"
            :key="row.dateStr"
            class="db-day-row"
            @click="goToDay(row.dateStr)"
          >
            <div class="db-day-date">{{ row.label }}</div>
            <div class="db-day-body">
              <div class="db-day-count">
                {{ row.count }} attività
                <span v-if="row.photoCnt" class="db-day-photos"> · 📸 {{ row.photoCnt }}</span>
              </div>
              <div class="db-day-types">
                <span
                  v-for="t in row.types"
                  :key="t"
                  class="type-pill"
                  :style="{ background: `${ACT[t]?.color}22`, color: ACT[t]?.color }"
                >{{ ACT[t]?.emoji }} {{ ACT[t]?.label }}</span>
              </div>
            </div>
            <div class="db-day-time">{{ row.totalSec ? fmtDur(row.totalSec) : '—' }}</div>
            <svg class="db-day-arrow" viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </div>
        </div>

      </div><!-- /db-col-main -->

      <!-- Right: Chart + Feed ────────────────────────────────────── -->
      <div class="db-col-side">

        <!-- Bar chart -->
        <div class="db-section">
          <div class="db-section-head">
            <span class="db-section-title">Ore per giorno</span>
            <span class="db-section-sub">{{ statHours }} totali</span>
          </div>
          <div class="db-chart-wrap">
            <canvas id="bar-chart" />
          </div>
        </div>

        <!-- Activity feed -->
        <div class="db-section">
          <div class="db-section-head">
            <span class="db-section-title">Attività recenti</span>
          </div>
          <div v-if="!recentActivities.length" class="db-empty">Nessuna attività registrata</div>
          <div v-else class="db-feed">
            <div v-for="a in recentActivities" :key="a.id" class="db-feed-item">
              <div class="db-feed-avatar">{{ userInitials }}</div>
              <div class="db-feed-body">
                <div class="db-feed-text">
                  <span class="db-feed-type">{{ ACT[a.type]?.emoji }} {{ ACT[a.type]?.label }}</span>
                  <span v-if="a.detail" class="db-feed-addr"> · {{ a.detail }}</span>
                </div>
                <div class="db-feed-time">{{ fmtRelTime(a.startTime) }}</div>
              </div>
              <span v-if="!a.endTime" class="db-live-badge">live</span>
            </div>
          </div>
        </div>

      </div><!-- /db-col-side -->

    </div><!-- /db-grid -->

  </div>
</template>

<style scoped lang="scss">
// ── Top header ────────────────────────────────────────────────────────
.db-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 28px 28px 0;
  flex-wrap: wrap;
}

.db-greeting {
  min-width: 0;
}

.db-ws-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 4px;
}

.db-title {
  font-size: 24px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 4px;
  line-height: 1.2;
}

.db-subtitle {
  font-size: 13px;
  color: var(--muted-2);
}

.db-top-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.db-search {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  font-size: 13px;
  cursor: pointer;
  transition: border-color .12s;

  &:hover { border-color: var(--border-strong); }

  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
  }

  kbd {
    margin-left: 8px;
    padding: 1px 5px;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 4px;
    font-size: 11px;
    font-family: var(--ff);
  }
}

.db-cta {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 16px;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: filter .12s;

  &:hover  { filter: brightness(1.1); }
  &:active { filter: brightness(.9); }

  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2.5; stroke-linecap: round;
  }
}

// ── Stat cards ────────────────────────────────────────────────────────
.db-stats {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  padding: 20px 28px 0;

  @media (max-width: 1100px) { grid-template-columns: repeat(2, 1fr); }
}

.db-stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;
  transition: border-color .12s;

  &:hover { border-color: var(--border-strong); }
}

.db-stat-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .6px;
  margin-bottom: 8px;
}

.db-stat-val {
  font-size: 36px;
  font-weight: 800;
  color: var(--ink);
  line-height: 1;
  margin-bottom: 6px;
  font-variant-numeric: tabular-nums;

  &.db-stat-mono { font-family: var(--ff-mono); font-size: 28px; }
}

.db-stat-sub {
  font-size: 11px;
  color: var(--muted);

  &.db-stat-live { color: var(--live); font-weight: 600; }
}

// ── Period tabs ───────────────────────────────────────────────────────
.db-period-row {
  padding: 16px 28px 0;
}

.db-period-tabs {
  display: inline-flex;
  gap: 2px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 3px;

  button {
    padding: 5px 12px;
    border: none;
    background: transparent;
    border-radius: var(--radius-xs);
    font-family: var(--ff);
    font-size: 12px;
    font-weight: 500;
    color: var(--muted);
    cursor: pointer;
    transition: background .12s, color .12s;

    &:hover  { background: var(--surface-2); color: var(--ink); }
    &.active { background: var(--surface-3); color: var(--ink); font-weight: 600; }
  }
}

// ── Main grid ─────────────────────────────────────────────────────────
.db-grid {
  display: grid;
  grid-template-columns: 1fr 360px;
  gap: 16px;
  padding: 16px 28px 28px;

  @media (max-width: 1100px) { grid-template-columns: 1fr; }
}

.db-col-main,
.db-col-side {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

// ── Section ───────────────────────────────────────────────────────────
.db-section {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
}

.db-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 18px;
  border-bottom: 1px solid var(--border);
}

.db-section-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
}

.db-section-sub {
  font-size: 11px;
  color: var(--muted);
}

.db-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 20px;
  color: var(--muted);
  font-size: 13px;
  text-align: center;

  svg {
    width: 24px; height: 24px;
    stroke: var(--muted); fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
    opacity: .5;
  }
}

// ── Live badge ────────────────────────────────────────────────────────
.db-live-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px 7px;
  background: var(--live-soft);
  color: var(--live);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;

  &.db-live-badge-lg {
    font-size: 11px;
    padding: 3px 10px;
  }
}

// ── Today list ────────────────────────────────────────────────────────
.db-today-list {
  padding: 8px 0;
}

.db-today-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 10px 18px;
  transition: background .1s;

  &:hover { background: var(--surface-2); }
}

.db-today-time {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
  min-width: 38px;
  padding-top: 2px;
  flex-shrink: 0;
}

.db-today-line {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  padding-top: 4px;
}

.db-today-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--border-strong);
  flex-shrink: 0;

  &.live {
    background: var(--live);
    box-shadow: 0 0 0 2px var(--live-soft);
  }
}

.db-today-track {
  width: 1px;
  flex: 1;
  background: var(--border);
  min-height: 20px;
}

.db-today-content {
  flex: 1;
  min-width: 0;
}

.db-today-type {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  margin-bottom: 2px;
}

.db-type-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.db-today-addr {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.db-today-dur {
  font-family: var(--ff-mono);
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
  padding-top: 2px;
}

// ── Ongoing cards ─────────────────────────────────────────────────────
.db-ongoing-list {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
}

.db-ongoing-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;
  border-left: 3px solid var(--live);
}

.db-ongoing-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.db-ongoing-id {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
  font-weight: 600;
}

.db-ongoing-status {
  font-size: 11px;
  font-weight: 700;
  color: var(--live);
  background: var(--live-soft);
  padding: 2px 8px;
  border-radius: 10px;
}

.db-ongoing-type {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 8px;
}

.db-ongoing-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;

  span {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: var(--muted);

    svg {
      width: 12px; height: 12px;
      stroke: currentColor; fill: none;
      stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
      flex-shrink: 0;
    }
  }
}

// ── Day rows ──────────────────────────────────────────────────────────
.db-day-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  transition: background .1s;

  &:hover { background: var(--surface-2); }
  &:last-child { border-bottom: none; }
}

.db-day-date {
  font-size: 13px;
  font-weight: 700;
  color: var(--ink);
  min-width: 80px;
  flex-shrink: 0;
}

.db-day-body {
  flex: 1;
  min-width: 0;
}

.db-day-count {
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 4px;
}

.db-day-photos { color: var(--muted); }

.db-day-types {
  display: flex;
  gap: 5px;
  flex-wrap: wrap;
}

.type-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: .3px;
}

.db-day-time {
  font-family: var(--ff-mono);
  font-size: 13px;
  font-weight: 600;
  color: var(--muted-2);
  flex-shrink: 0;
}

.db-day-arrow {
  width: 16px; height: 16px;
  stroke: var(--muted); fill: none;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  flex-shrink: 0;
}

// ── Chart ─────────────────────────────────────────────────────────────
.db-chart-wrap {
  height: 180px;
  padding: 16px 18px 18px;
}

// ── Activity feed ─────────────────────────────────────────────────────
.db-feed {
  display: flex;
  flex-direction: column;
}

.db-feed-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  transition: background .1s;

  &:hover { background: var(--surface-2); }
  &:last-child { border-bottom: none; }
}

.db-feed-avatar {
  width: 28px;
  height: 28px;
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

.db-feed-body {
  flex: 1;
  min-width: 0;
}

.db-feed-text {
  font-size: 12px;
  color: var(--ink-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 2px;
}

.db-feed-type { font-weight: 600; color: var(--ink); }
.db-feed-addr { color: var(--muted); }

.db-feed-time {
  font-size: 11px;
  color: var(--muted);
}
</style>
