<script setup lang="ts">
/**
 * PlanningView – Pianificazione lavori (SOLO DESKTOP)
 * ─────────────────────────────────────────────────────────────────────
 * Consente di pianificare le lavorazioni future del posatore.
 * Layout a due colonne:
 *   Sinistra: calendario mensile + form aggiunta/modifica ordine
 *   Destra:   lista ordini del giorno selezionato + Gantt 3 settimane
 */
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useStore }    from '~/composables/useStore'
import { useAppState } from '~/composables/useAppState'
import { ACT, CATALOG, MONTHS_IT } from '~/constants'
import type { WorkOrder, ActivityType } from '~/types'

// Giorni della settimana Lun→Dom per intestazioni calendario
const WEEK_HEADERS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const store    = useStore()
const appState = useAppState()

// ── Data odierna (stringa YYYY-MM-DD) ─────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayStr = toDateStr(new Date())

// ── Calendario mensile ────────────────────────────────────────────────
const calYear  = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth()) // 0-indexed

const selectedDate = ref(todayStr)

const calTitle = computed(() => `${MONTHS_IT[calMonth.value]} ${calYear.value}`)

/** Numero di giorni del mese */
function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}
/** Primo giorno del mese: 0=Lun … 6=Dom (settimana italiana) */
function firstWeekday(y: number, m: number): number {
  return (new Date(y, m, 1).getDay() + 6) % 7
}

const calDays = computed(() => {
  const y = calYear.value
  const m = calMonth.value
  const total    = daysInMonth(y, m)
  const firstDay = firstWeekday(y, m)
  const cells: Array<{ day: number; dateStr: string; orders: number } | null> = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= total; d++) {
    const dateStr = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, dateStr, orders: store.getWorkOrdersForDate(dateStr).length })
  }
  return cells
})

function prevMonth(): void {
  if (calMonth.value === 0) { calMonth.value = 11; calYear.value-- }
  else calMonth.value--
}
function nextMonth(): void {
  if (calMonth.value === 11) { calMonth.value = 0; calYear.value++ }
  else calMonth.value++
}
function selectDate(dateStr: string): void {
  selectedDate.value = dateStr
  formData.value.date = dateStr
}

// ── Ordini del giorno selezionato ─────────────────────────────────────
const selectedOrders = computed(() =>
  store.getWorkOrdersForDate(selectedDate.value)
    .slice()
    .sort((a, b) => (a.startHour ?? '').localeCompare(b.startHour ?? ''))
)

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-').map(Number)
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${d} ${months[m - 1]}`
}

// ── Form aggiunta / modifica ──────────────────────────────────────────
const showForm     = ref(false)
const editingId    = ref<string | null>(null)
const formData     = ref({
  orderNumber: '',
  type:        'posa' as ActivityType,
  detail:      '',
  note:        '',
  date:        todayStr,
  estimatedDuration: 1,
  startHour:   '',
})

const planningTypes = ['posa', 'trasferimento', 'altro'] as const

const catalogOptions = computed(() =>
  formData.value.type === 'posa' ? CATALOG : []
)

function openAddForm(): void {
  editingId.value = null
  formData.value  = {
    orderNumber: '',
    type:        'posa',
    detail:      '',
    note:        '',
    date:        selectedDate.value,
    estimatedDuration: 1,
    startHour:   '',
  }
  showForm.value = true
}

function openEditForm(wo: WorkOrder): void {
  editingId.value = wo.id
  formData.value  = {
    orderNumber:       wo.orderNumber,
    type:              wo.type as typeof planningTypes[number],
    detail:            wo.detail,
    note:              wo.note,
    date:              wo.date,
    estimatedDuration: wo.estimatedDuration ?? 1,
    startHour:         wo.startHour ?? '',
  }
  showForm.value = true
}

function cancelForm(): void {
  showForm.value = false
  editingId.value = null
}

function saveForm(): void {
  if (!formData.value.orderNumber.trim()) {
    appState.showToast('Inserire il numero ordine')
    return
  }
  if (!formData.value.detail.trim()) {
    appState.showToast('Inserire la descrizione del lavoro')
    return
  }

  if (editingId.value) {
    store.updateWorkOrder(editingId.value, {
      orderNumber:       formData.value.orderNumber.trim(),
      type:              formData.value.type,
      detail:            formData.value.detail.trim(),
      note:              formData.value.note.trim(),
      date:              formData.value.date,
      estimatedDuration: formData.value.estimatedDuration,
      startHour:         formData.value.startHour || undefined,
    })
    appState.showToast('Pianificazione aggiornata')
  } else {
    const nowTs = Date.now()
    store.addWorkOrder({
      id:                `wo_${nowTs}`,
      orderNumber:       formData.value.orderNumber.trim(),
      type:              formData.value.type,
      detail:            formData.value.detail.trim(),
      note:              formData.value.note.trim(),
      date:              formData.value.date,
      estimatedDuration: formData.value.estimatedDuration,
      startHour:         formData.value.startHour || undefined,
      createdAt:         nowTs,
    })
    appState.showToast('Lavorazione pianificata')
    // Aggiorna il mese del calendario se la data scelta è diversa dal mese corrente
    const [y, m] = formData.value.date.split('-').map(Number)
    calYear.value  = y
    calMonth.value = m - 1
    selectedDate.value = formData.value.date
  }

  showForm.value  = false
  editingId.value = null
  nextTick(() => renderGantt())
}

function deleteOrder(id: string): void {
  if (!confirm('Eliminare questa pianificazione?')) return
  store.removeWorkOrder(id)
  appState.showToast('Pianificazione eliminata')
  nextTick(() => renderGantt())
}

// ── Gantt chart ───────────────────────────────────────────────────────
const ganttCanvas = ref<HTMLCanvasElement | null>(null)
let   ganttChart: any = null

/** Inizio finestra Gantt: lunedì della settimana corrente */
function ganttStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7 // 0=Lun
  d.setDate(d.getDate() - dow)
  return d
}
const GANTT_DAYS = 21 // 3 settimane

function dayOffset(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const date  = new Date(y, m - 1, d)
  const start = ganttStart()
  return Math.round((date.getTime() - start.getTime()) / 86_400_000)
}

/** Ordini nella finestra Gantt */
const ganttOrders = computed(() => {
  const start = ganttStart()
  const end   = new Date(start)
  end.setDate(end.getDate() + GANTT_DAYS)
  const s = toDateStr(start)
  const e = toDateStr(end)
  return store.getAllWorkOrders()
    .filter(wo => wo.date >= s && wo.date <= e)
    .sort((a, b) => a.date.localeCompare(b.date))
})

async function renderGantt(): Promise<void> {
  if (!ganttCanvas.value) return

  // Lazy-load Chart.js
  if (!ganttChart) {
    const mod = await import('chart.js')
    mod.Chart.register(
      mod.CategoryScale,
      mod.LinearScale,
      mod.BarElement,
      mod.Tooltip,
    )
    // Prima renderizzazione: crea l'istanza
    ganttChart = _buildChart(mod.Chart)
    return
  }

  // Aggiorna dati senza ricreare il canvas
  const orders = ganttOrders.value
  ganttChart.data.labels   = _ganttLabels(orders)
  ganttChart.data.datasets[0].data             = _ganttData(orders)
  ganttChart.data.datasets[0].backgroundColor  = _ganttBg(orders)
  ganttChart.data.datasets[0].borderColor      = _ganttColors(orders)
  ganttChart.update()
}

function _ganttLabels(orders: WorkOrder[]): string[] {
  return orders.map(wo => {
    const label = `${wo.orderNumber} – ${wo.detail}`
    return label.length > 32 ? label.substring(0, 30) + '…' : label
  })
}
function _ganttData(orders: WorkOrder[]): [number, number][] {
  return orders.map(wo => {
    const s = dayOffset(wo.date)
    return [s, s + (wo.estimatedDuration ?? 1)]
  })
}
function _ganttColors(orders: WorkOrder[]): string[] {
  return orders.map(wo => ACT[wo.type]?.color ?? '#888')
}
function _ganttBg(orders: WorkOrder[]): string[] {
  return _ganttColors(orders).map(c => c + 'BB')
}

function _buildChart(ChartClass: any): any {
  const orders  = ganttOrders.value
  const start   = ganttStart()

  return new ChartClass(ganttCanvas.value!, {
    type: 'bar',
    data: {
      labels:   _ganttLabels(orders),
      datasets: [{
        label:           'Lavorazioni',
        data:            _ganttData(orders),
        backgroundColor: _ganttBg(orders),
        borderColor:     _ganttColors(orders),
        borderWidth:     1,
        borderRadius:    4,
      }],
    },
    options: {
      indexAxis:             'y',
      responsive:            true,
      maintainAspectRatio:   false,
      animation:             { duration: 200 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const wo = orders[ctx.dataIndex]
              if (!wo) return ''
              const s = new Date(start); s.setDate(s.getDate() + ctx.raw[0])
              const e = new Date(start); e.setDate(e.getDate() + ctx.raw[1] - 1)
              const fmt = (d: Date) => `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
              const range = ctx.raw[1] - ctx.raw[0] > 1 ? ` → ${fmt(e)}` : ''
              return ` ${fmt(s)}${range}  ·  Ord. ${wo.orderNumber}`
            },
          },
        },
      },
      scales: {
        x: {
          type:  'linear',
          min:   0,
          max:   GANTT_DAYS,
          grid:  { color: '#2E2E2E' },
          ticks: {
            color:        '#7A7A7A',
            maxRotation:  0,
            stepSize:     1,
            callback: (value: any) => {
              if (!Number.isInteger(value) || value < 0 || value > GANTT_DAYS) return ''
              const d = new Date(start); d.setDate(d.getDate() + value)
              // Mostra: primo del mese sempre, poi ogni 2 giorni
              if (d.getDate() === 1 || value % 2 === 0) {
                return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`
              }
              return ''
            },
          },
        },
        y: {
          grid:  { color: '#2E2E2E' },
          ticks: {
            color: '#F0F0F0',
            font:  { size: 11 },
          },
        },
      },
    },
  } as any)
}

// Striscia verticale "oggi" nel Gantt (plugin inline)
// Ridisegna il Gantt quando cambiano gli ordini
watch(ganttOrders, () => nextTick(() => renderGantt()))

onMounted(() => nextTick(() => renderGantt()))

onUnmounted(() => {
  if (ganttChart) { ganttChart.destroy(); ganttChart = null }
})
</script>

<template>
  <div class="view" id="view-planning">

    <!-- ── Header ────────────────────────────────────────────────────── -->
    <div class="page-header">
      <div>
        <div class="hdr-day">PIANIFICAZIONE</div>
        <div class="page-title">Lavorazioni</div>
      </div>
      <div style="color: var(--muted); font-size: 13px; text-align: right; line-height: 1.5;">
        Solo desktop<br>
        <span style="color: var(--dim)">Programma le lavorazioni future</span>
      </div>
    </div>

    <!-- ── Layout principale: colonna sx + colonna dx ───────────────── -->
    <div class="planning-layout">

      <!-- ═══════════════════════════════════════
           COLONNA SINISTRA: Calendario + Form
           ═══════════════════════════════════════ -->
      <div class="planning-left">

        <!-- Calendario mensile ──────────────────────────────────────── -->
        <div class="card calendar-card">
          <div class="calendar-header">
            <button class="cal-nav-btn" @click="prevMonth">
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="cal-title">{{ calTitle }}</span>
            <button class="cal-nav-btn" @click="nextMonth">
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <!-- Intestazioni giorni (Lun → Dom) -->
          <div class="cal-grid cal-weekdays">
            <div v-for="d in WEEK_HEADERS" :key="d" class="cal-wday">
              {{ d }}
            </div>
          </div>

          <!-- Celle giorni -->
          <div class="cal-grid cal-days">
            <div
              v-for="(cell, idx) in calDays"
              :key="idx"
              class="cal-cell"
              :class="{
                'cal-empty':    !cell,
                'cal-today':     cell?.dateStr === todayStr,
                'cal-selected':  cell?.dateStr === selectedDate,
                'cal-has-work':  cell && cell.orders > 0,
              }"
              @click="cell && selectDate(cell.dateStr)"
            >
              <template v-if="cell">
                <span class="cal-day-num">{{ cell.day }}</span>
                <div v-if="cell.orders > 0" class="cal-dots">
                  <span
                    v-for="n in Math.min(cell.orders, 3)"
                    :key="n"
                    class="cal-dot"
                  />
                </div>
              </template>
            </div>
          </div>
        </div><!-- /calendar-card -->

        <!-- Form aggiunta / modifica ────────────────────────────────── -->
        <div class="card form-card">
          <div class="form-card-header">
            <div class="slabel" style="margin-bottom:0">
              {{ editingId ? 'MODIFICA LAVORAZIONE' : 'NUOVA LAVORAZIONE' }}
            </div>
            <button v-if="!showForm" class="btn btn-add" @click="openAddForm">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Aggiungi
            </button>
          </div>

          <div v-if="showForm" class="plan-form">

            <!-- Numero ordine -->
            <label class="field-label">Numero ordine *</label>
            <input
              v-model="formData.orderNumber"
              class="field-input"
              type="text"
              placeholder="es. ORD-2025-001"
            />

            <!-- Tipo -->
            <label class="field-label">Tipo attività *</label>
            <select v-model="formData.type" class="field-select">
              <option v-for="t in planningTypes" :key="t" :value="t">
                {{ ACT[t]?.emoji }} {{ ACT[t]?.label }}
              </option>
            </select>

            <!-- Dettaglio / Attrezzatura -->
            <label class="field-label">
              {{ formData.type === 'posa' ? 'Attrezzatura *' : 'Descrizione *' }}
            </label>
            <select v-if="formData.type === 'posa'" v-model="formData.detail" class="field-select">
              <option value="">— Seleziona attrezzatura —</option>
              <option v-for="item in CATALOG" :key="item.id" :value="item.label">
                {{ item.label }} ({{ item.code }})
              </option>
            </select>
            <input
              v-else
              v-model="formData.detail"
              class="field-input"
              type="text"
              placeholder="Descrizione del lavoro..."
            />

            <!-- Data + Ora inizio (riga) -->
            <div class="field-row">
              <div style="flex:1">
                <label class="field-label">Data *</label>
                <input v-model="formData.date" class="field-input" type="date" />
              </div>
              <div style="flex:1">
                <label class="field-label">Ora inizio (opz.)</label>
                <input v-model="formData.startHour" class="field-input" type="time" />
              </div>
              <div style="width:100px">
                <label class="field-label">Giorni</label>
                <input
                  v-model.number="formData.estimatedDuration"
                  class="field-input"
                  type="number"
                  min="1"
                  max="30"
                />
              </div>
            </div>

            <!-- Note -->
            <label class="field-label">Note</label>
            <textarea
              v-model="formData.note"
              class="field-textarea"
              rows="2"
              placeholder="Note aggiuntive..."
            />

            <!-- Bottoni -->
            <div class="form-actions">
              <button class="btn" @click="saveForm">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                {{ editingId ? 'Salva modifiche' : 'Pianifica' }}
              </button>
              <button class="btn btn-ghost" @click="cancelForm">Annulla</button>
            </div>

          </div><!-- /plan-form -->
        </div><!-- /form-card -->

      </div><!-- /planning-left -->


      <!-- ═══════════════════════════════════════
           COLONNA DESTRA: Lista ordini + Gantt
           ═══════════════════════════════════════ -->
      <div class="planning-right">

        <!-- Lista ordini del giorno selezionato ─────────────────────── -->
        <div>
          <div class="slabel">
            LAVORAZIONI DEL {{ fmtDate(selectedDate).toUpperCase() }}
            <span v-if="selectedDate === todayStr" class="today-badge">OGGI</span>
          </div>
          <div class="card">
            <div class="card-body">

              <div v-if="!selectedOrders.length" class="empty">
                <svg viewBox="0 0 24 24">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                <h3>Nessuna lavorazione</h3>
                <p>Aggiungi una lavorazione per questo giorno</p>
              </div>

              <div
                v-for="wo in selectedOrders"
                :key="wo.id"
                class="order-item"
              >
                <!-- Barra colorata tipo -->
                <div class="order-bar" :style="{ background: ACT[wo.type]?.color ?? '#888' }" />

                <div class="order-body">
                  <div class="order-title">{{ wo.detail }}</div>
                  <div class="order-meta">
                    <span class="order-type-badge" :style="{ background: (ACT[wo.type]?.color ?? '#888') + '33', color: ACT[wo.type]?.color ?? '#888' }">
                      {{ ACT[wo.type]?.emoji }} {{ ACT[wo.type]?.label }}
                    </span>
                    <span>Ord. <strong>{{ wo.orderNumber }}</strong></span>
                    <span v-if="wo.startHour">{{ wo.startHour }}</span>
                    <span v-if="(wo.estimatedDuration ?? 1) > 1">{{ wo.estimatedDuration }} giorni</span>
                  </div>
                  <div v-if="wo.note" class="order-note">{{ wo.note }}</div>
                </div>

                <div class="order-actions">
                  <button class="icon-btn" title="Modifica" @click="openEditForm(wo)">
                    <svg viewBox="0 0 24 24">
                      <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                      <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                    </svg>
                  </button>
                  <button class="icon-btn icon-btn-danger" title="Elimina" @click="deleteOrder(wo.id)">
                    <svg viewBox="0 0 24 24">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/>
                    </svg>
                  </button>
                </div>
              </div>

            </div><!-- /card-body -->
          </div>
        </div>

        <!-- Gantt 3 settimane ───────────────────────────────────────── -->
        <div>
          <div class="slabel">GANTT – PROSSIME 3 SETTIMANE</div>
          <div class="card gantt-card">
            <div
              v-if="!ganttOrders.length"
              class="empty"
              style="padding: 40px 0"
            >
              <svg viewBox="0 0 24 24">
                <line x1="18" y1="20" x2="18" y2="10"/>
                <line x1="12" y1="20" x2="12" y2="4"/>
                <line x1="6"  y1="20" x2="6"  y2="14"/>
              </svg>
              <h3>Nessuna lavorazione pianificata</h3>
              <p>Le lavorazioni nelle prossime 3 settimane appariranno qui</p>
            </div>
            <div
              v-else
              class="gantt-wrap"
              :style="{ height: Math.max(120, ganttOrders.length * 40 + 60) + 'px' }"
            >
              <canvas ref="ganttCanvas" />
            </div>
          </div>
        </div>

      </div><!-- /planning-right -->

    </div><!-- /planning-layout -->

  </div>
</template>

<style scoped lang="scss">
/* ─── Layout ─────────────────────────────────────────────────────── */
#view-planning {
  padding: 24px;
  max-width: 1400px;
}

.planning-layout {
  display: grid;
  grid-template-columns: 320px 1fr;
  gap: 20px;
  align-items: start;
}

.planning-left,
.planning-right {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ─── Calendario ─────────────────────────────────────────────────── */
.calendar-card {
  padding: 0;
  overflow: hidden;
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
}

.cal-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: .5px;
  text-transform: uppercase;
  color: var(--text);
}

.cal-nav-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  background: var(--surface2);
  border-radius: var(--r-xs);
  cursor: pointer;
  color: var(--muted);
  transition: background .12s, color .12s;
  &:hover { background: var(--surface3); color: var(--text); }
  svg {
    width: 16px; height: 16px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  }
}

.cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
}

.cal-weekdays {
  padding: 8px 8px 4px;
}

.cal-wday {
  text-align: center;
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
}

.cal-days {
  padding: 4px 8px 12px;
  gap: 2px;
}

.cal-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border-radius: var(--r-xs);
  cursor: pointer;
  position: relative;
  transition: background .1s;
  min-height: 34px;

  &:hover:not(.cal-empty) { background: var(--surface2); }

  &.cal-empty { pointer-events: none; }

  &.cal-today .cal-day-num {
    background: var(--orange);
    color: #fff;
    border-radius: 50%;
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
  }

  &.cal-selected:not(.cal-today) {
    background: rgba(255, 95, 0, .15);
    .cal-day-num { color: var(--orange); font-weight: 700; }
  }

  &.cal-has-work { }
}

.cal-day-num {
  font-size: 12px;
  color: var(--text);
  line-height: 1;
}

.cal-dots {
  display: flex;
  gap: 2px;
  margin-top: 2px;
}

.cal-dot {
  width: 4px; height: 4px;
  border-radius: 50%;
  background: var(--orange);
}

/* ─── Form ───────────────────────────────────────────────────────── */
.form-card {
  padding: 16px;
}

.form-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.plan-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.field-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-top: 4px;
}

.field-input,
.field-select,
.field-textarea {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  padding: 8px 10px;
  outline: none;
  transition: border-color .15s;
  &:focus { border-color: var(--orange); }
}

.field-select option { background: var(--surface2); }

.field-textarea { resize: vertical; }

.field-row {
  display: flex;
  gap: 8px;
}

.form-actions {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.btn-add {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--orange);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: background .12s;
  &:hover { background: var(--orange-d); }
  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2.5; stroke-linecap: round;
  }
}

.btn-ghost {
  background: var(--surface2);
  color: var(--muted);
  border: 1px solid var(--border2);
  &:hover { background: var(--surface3); color: var(--text); }
}

.btn svg {
  width: 15px; height: 15px;
  stroke: currentColor; fill: none;
  stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
}

/* ─── Lista ordini ───────────────────────────────────────────────── */
.today-badge {
  display: inline-block;
  background: var(--orange);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .5px;
  padding: 2px 6px;
  border-radius: 20px;
  margin-left: 6px;
  vertical-align: middle;
}

.order-item {
  display: flex;
  align-items: stretch;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}

.order-bar {
  width: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}

.order-body {
  flex: 1;
  min-width: 0;
}

.order-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.order-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: var(--muted);
}

.order-type-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 20px;
  font-size: 11px;
  font-weight: 600;
}

.order-note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 4px;
  font-style: italic;
}

.order-actions {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px; height: 30px;
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;
  &:hover { background: var(--surface2); color: var(--text); }
  &.icon-btn-danger:hover { background: rgba(239,68,68,.15); color: var(--red); border-color: var(--red); }
  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

/* ─── Gantt ──────────────────────────────────────────────────────── */
.gantt-card {
  padding: 16px;
}

.gantt-wrap {
  position: relative;
  width: 100%;
  canvas { display: block; }
}
</style>
