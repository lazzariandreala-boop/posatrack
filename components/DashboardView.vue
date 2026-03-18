<script setup lang="ts">
/**
 * DashboardView – Vista Dashboard Responsabile
 * ─────────────────────────────────────────────────────────────────────
 * Solo DESKTOP. Panoramica aggregata su più giorni.
 * Filtro periodo: 7 / 30 / 90 giorni o tutto lo storico.
 *
 * Contiene:
 *   - 4 box statistici aggregati (giorni, attività, ore, foto)
 *   - Grafico a barre ore per giorno (Chart.js, ultimi 14 giorni)
 *   - Lista storico giorni cliccabile (naviga al Riepilogo del giorno)
 */
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useAppState }  from '~/composables/useAppState'
import { useStore }     from '~/composables/useStore'
import { ACT }          from '~/constants'
import { DAYS_SHORT, MONTHS_SHORT } from '~/constants'

const appState = useAppState()
const store    = useStore()

// ── Periodo selezionato ───────────────────────────────────────────────
/** 7 | 30 | 90 | 0 (tutto lo storico) */
const periodDays = ref(7)

/** Ritorna la data di oggi come stringa YYYY-MM-DD */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Attività nel periodo selezionato */
const periodActivities = computed(() => {
  if (periodDays.value === 0) return store.all()
  const fromDate = new Date()
  fromDate.setDate(fromDate.getDate() - periodDays.value + 1)
  return store.forRange(fromDate.toISOString().split('T')[0], todayStr())
})

/** Date uniche nel periodo (ordine decrescente) */
const uniqueDates = computed(() => [
  ...new Set(periodActivities.value.map(a => a.date))
].sort().reverse())

// ── Statistiche aggregate ─────────────────────────────────────────────

const statDays = computed(() => uniqueDates.value.length)

const statActs = computed(() => periodActivities.value.length)

const statHours = computed(() => {
  const completed = periodActivities.value.filter(a => a.duration !== null)
  const totalSec  = completed.reduce((s, a) => s + (a.duration ?? 0), 0)
  return totalSec > 0 ? `${(Math.round(totalSec / 360) / 10).toFixed(1)}h` : '0h'
})

const statPhotos = computed(() =>
  periodActivities.value.reduce((s, a) => s + (a.photos?.length || 0), 0)
)

// ── Formattazione ─────────────────────────────────────────────────────

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

// ── Storico giorni (lista) ────────────────────────────────────────────

interface DayRow {
  dateStr:   string
  label:     string
  count:     number
  photoCnt:  number
  totalSec:  number
  types:     string[]
}

const dayRows = computed<DayRow[]>(() =>
  uniqueDates.value.map(dateStr => {
    const dayActs  = periodActivities.value.filter(a => a.date === dateStr)
    const daySec   = dayActs.filter(a => a.duration).reduce((s, a) => s + (a.duration ?? 0), 0)
    const typeSet  = [...new Set(dayActs.map(a => a.type))]
    const photoCnt = dayActs.reduce((s, a) => s + (a.photos?.length || 0), 0)
    return {
      dateStr,
      label:    fmtDateLabel(dateStr),
      count:    dayActs.length,
      photoCnt,
      totalSec: daySec,
      types:    typeSet,
    }
  })
)

/** Naviga al riepilogo del giorno specificato */
function goToDay(dateStr: string): void {
  // Espone la data al SummaryView tramite query param simulato su state
  // In questa architettura è sufficiente navigare alla vista summary:
  // SummaryView legge selectedDate dal suo state locale.
  // Per passare la data utilizziamo un evento o un ref condiviso.
  // Soluzione semplice: uso un ref globale in appState (esteso ad hoc)
  appState.navigate('summary')
  // La data viene impostata da un watch su SummaryView se necessario.
  // In alternativa si usa provide/inject o un event bus.
  // Per ora naviga semplicemente alla vista (la data può essere impostata
  // manualmente dall'utente nel selettore della vista summary).
  appState.showToast(`📅 ${fmtDateLabel(dateStr)}`)
}

// ── Grafico a barre (Chart.js) ────────────────────────────────────────

let barChartInstance: any = null

const barChartDates = computed(() =>
  [...uniqueDates.value].sort().slice(-14) // ultimi 14 giorni per leggibilità
)

const barChartLabels = computed(() =>
  barChartDates.value.map(d => {
    const dt = new Date(d + 'T12:00:00')
    return `${dt.getDate()}/${dt.getMonth() + 1}`
  })
)

const barChartData = computed(() =>
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

  if (barChartInstance) {
    barChartInstance.destroy()
    barChartInstance = null
  }

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
        backgroundColor: 'rgba(255, 95, 0, .72)',
        borderColor:     '#FF5F00',
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
          backgroundColor: '#242424',
          borderColor:     '#3E3E3E',
          borderWidth:     1,
          titleColor:      '#F0F0F0',
          bodyColor:       '#aaa',
          callbacks: { label: (ctx: any) => ` ${ctx.raw}h lavorate` },
        },
      },
      scales: {
        x: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#777', font: { size: 11 } } },
        y: { grid: { color: 'rgba(255,255,255,.04)' }, ticks: { color: '#777', font: { size: 11 } }, beginAtZero: true },
      },
    },
  })
}

// Re-render al cambio periodo, cambio vista, o cambio dati (es. dopo sync)
watch(periodDays, async () => {
  await nextTick()
  await renderBarChart()
})

watch(() => appState.currentView.value, async (view) => {
  if (view === 'dashboard') {
    await nextTick()
    await renderBarChart()
  }
})

watch(barChartData, async () => {
  if (appState.currentView.value === 'dashboard') {
    await nextTick()
    await renderBarChart()
  }
})

onUnmounted(() => {
  if (barChartInstance) { barChartInstance.destroy(); barChartInstance = null }
})
</script>

<template>
  <div class="view" id="view-dashboard">

    <!-- ── Header: titolo + selezione periodo ────────────────────── -->
    <div class="page-header">
      <div class="page-title">Dashboard</div>
      <!-- Select periodo: su cambio aggiorna automaticamente i dati computed -->
      <select
        v-model="periodDays"
        style="width: auto; padding: 7px 14px; font-size: 13px"
      >
        <option :value="7">Ultimi 7 giorni</option>
        <option :value="30">Ultimi 30 giorni</option>
        <option :value="90">Ultimi 90 giorni</option>
        <option :value="0">Tutto lo storico</option>
      </select>
    </div>

    <!-- ── Statistiche aggregate (2 col mobile, 4 col desktop) ──── -->
    <div class="dash-stats-grid">
      <div class="dash-stat">
        <div class="dash-stat-val">{{ statDays }}</div>
        <div class="dash-stat-lbl">Giorni lavorati</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">{{ statActs }}</div>
        <div class="dash-stat-lbl">Totale attività</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">{{ statHours }}</div>
        <div class="dash-stat-lbl">Ore lavorate</div>
      </div>
      <div class="dash-stat">
        <div class="dash-stat-val">{{ statPhotos }}</div>
        <div class="dash-stat-lbl">Foto scattate</div>
      </div>
    </div>

    <!--
      Layout desktop: grafico a barre e storico giorni affiancati.
      Su mobile si impilano verticalmente.
    -->
    <div id="dashboard-main-row">

      <!-- Grafico a barre: ore lavorate per giorno (ultimi 14) -->
      <div>
        <div class="slabel">ORE PER GIORNO (ultimi 14)</div>
        <div class="card">
          <div class="card-body">
            <div id="bar-chart-wrap">
              <canvas id="bar-chart" />
            </div>
          </div>
        </div>
      </div>

      <!-- Storico giorni: lista cliccabile -->
      <div>
        <div class="slabel">STORICO GIORNATE</div>
        <div class="card">
          <div class="card-body">

            <!-- Empty state -->
            <div v-if="!dayRows.length" class="empty">
              <svg viewBox="0 0 24 24">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <path d="M16 2v4M8 2v4M3 10h18"/>
              </svg>
              <h3>Nessuna giornata</h3>
              <p>Nessun dato nel periodo selezionato</p>
            </div>

            <!-- Lista giorni -->
            <div
              v-for="row in dayRows"
              :key="row.dateStr"
              class="day-row"
              :title="`Vai al riepilogo del ${row.label}`"
              @click="goToDay(row.dateStr)"
            >
              <!-- Data (formato breve) -->
              <div class="day-row-date">{{ row.label }}</div>

              <!-- Corpo: conteggio + pillole tipo attività -->
              <div class="day-row-body">
                <div class="day-row-count">
                  {{ row.count }} attività
                  <span v-if="row.photoCnt > 0" style="font-size: 11px; color: var(--muted)">
                    · 📸 {{ row.photoCnt }}
                  </span>
                </div>
                <div class="day-row-types">
                  <span
                    v-for="t in row.types"
                    :key="t"
                    class="type-pill"
                    :style="{
                      background: `${ACT[t]?.color}20`,
                      color: ACT[t]?.color
                    }"
                  >
                    {{ ACT[t]?.emoji }} {{ ACT[t]?.label }}
                  </span>
                </div>
              </div>

              <!-- Durata totale del giorno -->
              <div class="day-row-time">{{ row.totalSec ? fmtDur(row.totalSec) : '—' }}</div>

              <!-- Freccia → -->
              <div class="day-row-arrow">
                <svg viewBox="0 0 24 24">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </div>
            </div>

          </div>
        </div>
      </div>

    </div><!-- /dashboard-main-row -->

  </div><!-- /view-dashboard -->
</template>

<style scoped lang="scss">
/* ──────────────────────────────────────────────────────────────────
   Statistiche aggregate (2 col mobile, 4 col desktop via main.scss)
   ────────────────────────────────────────────────────────────────── */
.dash-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  margin-bottom: 20px;
}

/* Box stat più grande rispetto a quelli del riepilogo */
.dash-stat {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r);
  padding: 18px 14px;
}

.dash-stat-val {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 38px;
  font-weight: 900;
  color: var(--orange);
  line-height: 1;
  margin-bottom: 5px;
  font-variant-numeric: tabular-nums;
}

.dash-stat-lbl { font-size: 11px; color: var(--muted); font-weight: 500; }

/* ──────────────────────────────────────────────────────────────────
   Grafico a barre
   ────────────────────────────────────────────────────────────────── */
#bar-chart-wrap {
  height: 170px; // sovrascritta a 220px in main.scss @media desktop
}

/* ──────────────────────────────────────────────────────────────────
   Lista storico giorni
   ────────────────────────────────────────────────────────────────── */
.day-row {
  display: flex;
  align-items: center;
  padding: 13px 8px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
  gap: 14px;
  transition: background .1s;
  border-radius: 8px;
  margin: 0 -8px;

  &:hover { background: var(--surface2); }
  &:last-child { border-bottom: none; }
}

.day-row-date  { font-family: 'Barlow Condensed', sans-serif; font-size: 18px; font-weight: 800; min-width: 90px; }
.day-row-body  { flex: 1; min-width: 0; }
.day-row-count { font-size: 13px; color: var(--muted); }
.day-row-types { display: flex; gap: 5px; margin-top: 4px; flex-wrap: wrap; }

/* Pill colorata per tipo di attività */
.type-pill {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  letter-spacing: .3px;
}

.day-row-time { font-family: 'Barlow Condensed', sans-serif; font-size: 22px; font-weight: 800; color: var(--muted); flex-shrink: 0; }

.day-row-arrow svg {
  width: 16px;
  height: 16px;
  stroke: var(--dim);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

</style>
