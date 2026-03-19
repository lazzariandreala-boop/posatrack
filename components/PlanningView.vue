<script setup lang="ts">
/**
 * PlanningView – Pianificazione lavori (SOLO DESKTOP)
 * ─────────────────────────────────────────────────────────────────────
 * Consente di pianificare le lavorazioni future del posatore.
 * Layout a due colonne:
 *   Sinistra: calendario mensile + form aggiunta/modifica ordine
 *   Destra:   lista ordini del giorno selezionato + Gantt 3 settimane
 */
import { ref, computed } from 'vue'
import { useStore }    from '~/composables/useStore'
import { useAppState } from '~/composables/useAppState'
import { useExport }   from '~/composables/useExport'
import { ACT, MONTHS_IT } from '~/constants'
import type { WorkOrder, ActivityType } from '~/types'

// Giorni della settimana Lun→Dom per intestazioni calendario
const WEEK_HEADERS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const store    = useStore()
const appState = useAppState()
const exporter = useExport()

// ── Data odierna (stringa YYYY-MM-DD) ─────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayStr = toDateStr(new Date())

// ── Calcolo giorni lavorativi consecutivi (Lun–Ven) ───────────────────
/**
 * Ritorna `count` date (YYYY-MM-DD) di giorni lavorativi (Lun–Ven)
 * a partire da `startDateStr` (inclusa, saltando Sab/Dom).
 */
function getWorkingDays(startDateStr: string, count: number): string[] {
  const result: string[] = []
  const [y, m, d] = startDateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  while (result.length < count) {
    const dow = date.getDay() // 0=Dom, 6=Sab
    if (dow !== 0 && dow !== 6) {
      result.push(toDateStr(date))
    }
    date.setDate(date.getDate() + 1)
  }
  return result
}

/** Formatta minuti stimati → "~2h 30m" */
function fmtEstimatedTime(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `~${h}h ${m}m`
  if (h > 0) return `~${h}h`
  return `~${m}m`
}

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
const editingId    = ref<string | null>(null)
const formData     = ref({
  orderNumber:          '',
  type:                 'posa' as ActivityType,
  detail:               '',
  note:                 '',
  mapsLink:             '',
  date:                 todayStr,
  estimatedDuration:    1,
  estimatedTimeH:       0,
  estimatedTimeM:       0,
  travelCostEstimate:   0,
  lunchCostEstimate:    0,
  materialCostEstimate: 0,
  externalTeamCost:     0,
  budget:               0,
})

const planningTypes = ['posa', 'trasferimento', 'altro'] as const

function resetFormData(): void {
  editingId.value = null
  formData.value  = {
    orderNumber:          '',
    type:                 formData.value.type,
    detail:               '',
    note:                 '',
    mapsLink:             '',
    date:                 selectedDate.value,
    estimatedDuration:    1,
    estimatedTimeH:       0,
    estimatedTimeM:       0,
    travelCostEstimate:   0,
    lunchCostEstimate:    0,
    materialCostEstimate: 0,
    externalTeamCost:     0,
    budget:               0,
  }
}

function openEditForm(wo: WorkOrder): void {
  editingId.value = wo.id
  const et = wo.estimatedTime ?? 0
  formData.value  = {
    orderNumber:          wo.orderNumber,
    type:                 wo.type as typeof planningTypes[number],
    detail:               wo.detail,
    note:                 wo.note,
    mapsLink:             wo.mapsLink ?? '',
    date:                 wo.date,
    estimatedDuration:    1,
    estimatedTimeH:       Math.floor(et / 60),
    estimatedTimeM:       et % 60,
    travelCostEstimate:   wo.travelCostEstimate ?? 0,
    lunchCostEstimate:    wo.lunchCostEstimate ?? 0,
    materialCostEstimate: wo.materialCostEstimate ?? 0,
    externalTeamCost:     wo.externalTeamCost ?? 0,
    budget:               wo.budget ?? 0,
  }
}

function cancelForm(): void {
  resetFormData()
}

function saveForm(): void {
  const t = formData.value.type
  if (t === 'posa') {
    if (!formData.value.orderNumber.trim()) { appState.showToast('Inserire il numero ordine'); return }
    if (!formData.value.detail.trim())      { appState.showToast('Selezionare l\'attrezzatura'); return }
  } else if (t === 'altro') {
    if (!formData.value.detail.trim())      { appState.showToast('Inserire la descrizione'); return }
  }

  const estimatedTime = (formData.value.estimatedTimeH * 60) + formData.value.estimatedTimeM

  const costFields = {
    travelCostEstimate:   formData.value.travelCostEstimate   > 0 ? formData.value.travelCostEstimate   : undefined,
    lunchCostEstimate:    formData.value.lunchCostEstimate    > 0 ? formData.value.lunchCostEstimate    : undefined,
    materialCostEstimate: formData.value.materialCostEstimate > 0 ? formData.value.materialCostEstimate : undefined,
    externalTeamCost:     formData.value.externalTeamCost     > 0 ? formData.value.externalTeamCost     : undefined,
    budget:               formData.value.budget               > 0 ? formData.value.budget               : undefined,
  }

  const mapsLink = formData.value.mapsLink.trim() || undefined

  if (editingId.value) {
    store.updateWorkOrder(editingId.value, {
      orderNumber:   formData.value.orderNumber.trim(),
      type:          formData.value.type,
      detail:        formData.value.detail.trim(),
      note:          formData.value.note.trim(),
      date:          formData.value.date,
      estimatedTime: estimatedTime || undefined,
      mapsLink,
      ...costFields,
    })
    appState.showToast('Pianificazione aggiornata')
  } else {
    const nowTs = Date.now()
    const dur   = Math.max(1, formData.value.estimatedDuration)

    if (dur > 1) {
      const groupId = `grp_${nowTs}`
      const dates   = getWorkingDays(formData.value.date, dur)
      dates.forEach((date, idx) => {
        store.addWorkOrder({
          id:                `wo_${nowTs + idx}`,
          orderNumber:       formData.value.orderNumber.trim(),
          type:              formData.value.type,
          detail:            formData.value.detail.trim(),
          note:              formData.value.note.trim(),
          date,
          estimatedDuration: 1,
          estimatedTime:     estimatedTime || undefined,
          groupId,
          dayIndex:          idx + 1,
          totalDays:         dur,
          createdAt:         nowTs + idx,
          mapsLink,
          ...costFields,
        })
      })
      appState.showToast(`Lavorazione pianificata su ${dur} giorni (Lun–Ven)`)
    } else {
      store.addWorkOrder({
        id:                `wo_${nowTs}`,
        orderNumber:       formData.value.orderNumber.trim(),
        type:              formData.value.type,
        detail:            formData.value.detail.trim(),
        note:              formData.value.note.trim(),
        date:              formData.value.date,
        estimatedDuration: 1,
        estimatedTime:     estimatedTime || undefined,
        createdAt:         nowTs,
        mapsLink,
        ...costFields,
      })
      appState.showToast('Lavorazione pianificata')
    }

    const [y, m] = formData.value.date.split('-').map(Number)
    calYear.value      = y
    calMonth.value     = m - 1
    selectedDate.value = formData.value.date
  }

  resetFormData()
}

// ── Spostamento ordine ────────────────────────────────────────────────
const movingOrderId  = ref<string | null>(null)
const moveTargetDate = ref('')

function startMove(wo: WorkOrder): void {
  movingOrderId.value  = wo.id
  moveTargetDate.value = wo.date
}

function confirmMove(): void {
  if (!movingOrderId.value || !moveTargetDate.value) return
  store.updateWorkOrder(movingOrderId.value, { date: moveTargetDate.value })
  // Naviga al giorno di destinazione nel calendario
  const [y, m] = moveTargetDate.value.split('-').map(Number)
  calYear.value      = y
  calMonth.value     = m - 1
  selectedDate.value = moveTargetDate.value
  movingOrderId.value = null
  appState.showToast('Lavorazione spostata')
}

function cancelMove(): void {
  movingOrderId.value = null
}

// ── Eliminazione ordine (singolo o intero gruppo) ─────────────────────
function deleteOrder(wo: WorkOrder): void {
  if (wo.groupId) {
    const groupCount = store.getAllWorkOrders().filter(o => o.groupId === wo.groupId).length
    if (groupCount > 1) {
      const deleteAll = confirm(
        `Questa è la giornata ${wo.dayIndex ?? '?'} di ${wo.totalDays ?? groupCount} di una lavorazione multi-giorno.\n\n` +
        `Premi OK per eliminare TUTTA la pianificazione (${groupCount} giorni)\n` +
        `Premi Annulla per eliminare solo questo giorno`
      )
      if (deleteAll) {
        store.removeWorkOrderGroup(wo.groupId)
        appState.showToast('Pianificazione eliminata')
        return
      }
      // Se ha premuto Annulla, chiede conferma per eliminare solo questo giorno
      if (!confirm('Eliminare solo questo giorno?')) return
      store.removeWorkOrder(wo.id)
      appState.showToast('Giorno eliminato')
      return
    }
  }
  if (!confirm('Eliminare questa pianificazione?')) return
  store.removeWorkOrder(wo.id)
  appState.showToast('Pianificazione eliminata')
}

// ── Gantt HTML interattivo ─────────────────────────────────────────────
const GANTT_DAYS = 21   // 3 settimane
const DAY_NAMES  = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

/** Lunedì della settimana corrente (00:00:00) */
function ganttStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d
}

/** Array di 21 oggetti giorno per le intestazioni del Gantt */
const ganttDays = computed(() => {
  const start = ganttStart()
  return Array.from({ length: GANTT_DAYS }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    return {
      dateStr:   toDateStr(d),
      num:       d.getDate(),
      name:      DAY_NAMES[dow],
      isToday:   toDateStr(d) === todayStr,
      isWeekend: dow === 0 || dow === 6,
    }
  })
})

/** Ordini nella finestra Gantt (le 3 settimane) */
const ganttWindowOrders = computed(() => {
  const start = ganttStart()
  const end   = new Date(start)
  end.setDate(end.getDate() + GANTT_DAYS)
  const s = toDateStr(start)
  const e = toDateStr(new Date(end.getTime() - 86_400_000))
  return store.getAllWorkOrders().filter(wo => wo.date >= s && wo.date <= e)
})

/**
 * Righe del Gantt: raggruppa WorkOrder dello stesso gruppo (groupId)
 * o singoli ordini. Ogni riga ha una mappa dateStr→WorkOrder.
 */
interface GanttRow {
  key:          string
  label:        string
  color:        string
  ordersByDate: Record<string, WorkOrder>
}

const ganttRows = computed((): GanttRow[] => {
  const rowMap = new Map<string, GanttRow>()
  for (const wo of ganttWindowOrders.value) {
    const key = wo.groupId ?? wo.id
    if (!rowMap.has(key)) {
      const raw = `${wo.orderNumber} – ${wo.detail}`
      rowMap.set(key, {
        key,
        label:        raw.length > 36 ? raw.substring(0, 34) + '…' : raw,
        color:        ACT[wo.type]?.color ?? '#888',
        ordersByDate: {},
      })
    }
    rowMap.get(key)!.ordersByDate[wo.date] = wo
  }
  // Ordina per la prima data della riga
  return Array.from(rowMap.values()).sort((a, b) => {
    const aFirst = Object.keys(a.ordersByDate).sort()[0] ?? ''
    const bFirst = Object.keys(b.ordersByDate).sort()[0] ?? ''
    return aFirst.localeCompare(bFirst)
  })
})

// Blocco selezionato nel Gantt (per spostarlo)
const selectedGanttBlock = ref<WorkOrder | null>(null)
const ganttMoveDate       = ref('')

function selectGanttBlock(wo: WorkOrder): void {
  if (selectedGanttBlock.value?.id === wo.id) {
    selectedGanttBlock.value = null
    return
  }
  selectedGanttBlock.value = wo
  ganttMoveDate.value      = wo.date
}

/** Click su cella vuota mentre un blocco è selezionato → sposta subito */
function quickMoveGanttBlock(dateStr: string): void {
  if (!selectedGanttBlock.value) return
  store.updateWorkOrder(selectedGanttBlock.value.id, { date: dateStr })
  appState.showToast('Lavorazione spostata')
  selectedGanttBlock.value = null
}

/** Conferma lo spostamento tramite input date nella toolbar */
function confirmGanttMove(): void {
  if (!selectedGanttBlock.value || !ganttMoveDate.value) return
  store.updateWorkOrder(selectedGanttBlock.value.id, { date: ganttMoveDate.value })
  appState.showToast('Lavorazione spostata')
  selectedGanttBlock.value = null
}

/** Preview delle date lavorative generate dalla durata impostata nel form */
const durationPreviewDates = computed(() => {
  if (!formData.value.date || formData.value.estimatedDuration <= 1) return []
  return getWorkingDays(formData.value.date, formData.value.estimatedDuration)
})

function fmtShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  const days = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const date = new Date(parseInt(dateStr.split('-')[0]), m - 1, d)
  return `${days[date.getDay()]} ${d} ${months[m - 1]}`
}

function clearGanttBlock(): void {
  selectedGanttBlock.value = null
}

/** Gestisce click su cella Gantt: seleziona blocco o sposta quello selezionato */
function handleGanttCellClick(row: GanttRow, dateStr: string): void {
  const wo = row.ordersByDate[dateStr]
  if (wo) {
    selectGanttBlock(wo)
  } else if (selectedGanttBlock.value) {
    quickMoveGanttBlock(dateStr)
  }
}
</script>

<template>
  <div class="view" id="view-planning">

    <!-- ── Header ────────────────────────────────────────────────────── -->
    <div class="page-header">
      <div>
        <div class="hdr-day">PIANIFICAZIONE</div>
        <div class="page-title">Lavorazioni</div>
      </div>
      <div>
        <button
          class="btn btn-ghost btn-sm btn-icon"
          @click="exporter.exportPlanning(
            `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`,
            (() => { const d = new Date(calYear, calMonth + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
          )"
        >
          <svg viewBox="0 0 24 24">
            <rect x="3" y="3" width="18" height="18" rx="2"/>
            <path d="M3 9h18M3 15h18M9 3v18"/>
          </svg>
          Esporta Excel Previsioni
        </button>
      </div>
    </div>

    <!-- ── Gantt a tutta larghezza (SOPRA) ─────────────────────────── -->
    <div class="planning-gantt">
      <div class="slabel">
        GANTT – PROSSIME 3 SETTIMANE
        <span v-if="selectedGanttBlock" class="gantt-hint">
          Blocco selezionato: clicca una cella vuota per spostarlo
        </span>
      </div>

      <div v-if="selectedGanttBlock" class="gantt-move-toolbar">
        <span class="gantt-move-label">
          ✂ Sposta <strong>{{ selectedGanttBlock.detail }}</strong>
          <span v-if="selectedGanttBlock.totalDays && selectedGanttBlock.totalDays > 1">
            (Giorno {{ selectedGanttBlock.dayIndex }}/{{ selectedGanttBlock.totalDays }})
          </span>
        </span>
        <input v-model="ganttMoveDate" type="date" class="gantt-move-input" />
        <button class="gantt-move-confirm" @click="confirmGanttMove">Sposta</button>
        <button class="gantt-move-cancel" @click="clearGanttBlock">✕</button>
      </div>

      <div class="card gantt-card">
        <div v-if="!ganttWindowOrders.length" class="empty" style="padding: 40px 0">
          <svg viewBox="0 0 24 24">
            <line x1="18" y1="20" x2="18" y2="10"/>
            <line x1="12" y1="20" x2="12" y2="4"/>
            <line x1="6"  y1="20" x2="6"  y2="14"/>
          </svg>
          <h3>Nessuna lavorazione pianificata</h3>
          <p>Le lavorazioni nelle prossime 3 settimane appariranno qui</p>
        </div>
        <div v-else class="gantt-grid-wrap">
          <div class="gantt-header-row">
            <div class="gantt-label-cell gantt-label-header">Lavorazione</div>
            <div
              v-for="day in ganttDays"
              :key="day.dateStr"
              class="gantt-day-header"
              :class="{ 'gantt-day-today': day.isToday, 'gantt-day-weekend': day.isWeekend }"
            >
              <div class="gantt-day-name">{{ day.name }}</div>
              <div class="gantt-day-num">{{ day.num }}</div>
            </div>
          </div>
          <div v-for="row in ganttRows" :key="row.key" class="gantt-row">
            <div class="gantt-label-cell" :title="row.label">
              <div class="gantt-row-dot" :style="{ background: row.color }" />
              <span class="gantt-row-label">{{ row.label }}</span>
            </div>
            <div
              v-for="day in ganttDays"
              :key="day.dateStr"
              class="gantt-cell"
              :class="{
                'gantt-cell-today':      day.isToday,
                'gantt-cell-weekend':    day.isWeekend,
                'gantt-cell-droptarget': selectedGanttBlock && !row.ordersByDate[day.dateStr],
              }"
              @click="handleGanttCellClick(row, day.dateStr)"
            >
              <div
                v-if="row.ordersByDate[day.dateStr]"
                class="gantt-block"
                :class="{ 'gantt-block-selected': selectedGanttBlock?.id === row.ordersByDate[day.dateStr].id }"
                :style="{ background: row.color + 'CC', borderColor: row.color }"
                :title="`${row.ordersByDate[day.dateStr].detail}\nOrd. ${row.ordersByDate[day.dateStr].orderNumber}\nClicca per selezionare`"
              >
                <span v-if="(row?.ordersByDate?.[day?.dateStr]?.totalDays ?? 0) > 1" class="gantt-block-badge">
                  {{ row.ordersByDate[day.dateStr].dayIndex }}/{{ row.ordersByDate[day.dateStr].totalDays }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div><!-- /planning-gantt -->

    <!-- ── Layout 3 colonne ──────────────────────────────────────────── -->
    <div class="planning-top">

      <!-- SINISTRA: Calendario ──────────────────────────────────────── -->
      <div class="planning-col">
        <div class="slabel" style="margin-bottom: 13px">CALENDARIO LAVORAZIONI</div>
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
          <div class="cal-grid cal-weekdays">
            <div v-for="d in WEEK_HEADERS" :key="d" class="cal-wday">{{ d }}</div>
          </div>
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
                  <span v-for="n in Math.min(cell.orders, 3)" :key="n" class="cal-dot" />
                </div>
              </template>
            </div>
          </div>
        </div>
      </div>

      <!-- CENTRO: Lavorazioni del giorno ───────────────────────────── -->
      <div class="planning-col">
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

            <div v-for="wo in selectedOrders" :key="wo.id" class="order-item">
              <div class="order-bar" :style="{ background: ACT[wo.type]?.color ?? '#888' }" />
              <div class="order-body">
                <div class="order-title">
                  {{ wo.detail }}
                  <span
                    v-if="wo.groupId && wo.totalDays && wo.totalDays > 1"
                    class="day-badge"
                  >Giorno {{ wo.dayIndex }}/{{ wo.totalDays }}</span>
                </div>
                <div class="order-meta">
                  <span class="order-type-badge" :style="{ background: (ACT[wo.type]?.color ?? '#888') + '33', color: ACT[wo.type]?.color ?? '#888' }">
                    {{ ACT[wo.type]?.emoji }} {{ ACT[wo.type]?.label }}
                  </span>
                  <span>Ord. <strong>{{ wo.orderNumber }}</strong></span>
                  <span v-if="wo.startHour">🕐 {{ wo.startHour }}</span>
                  <span v-if="wo.estimatedTime" class="time-estimate-chip">
                    ⏱ {{ fmtEstimatedTime(wo.estimatedTime) }}
                  </span>
                </div>
                <div v-if="wo.note" class="order-note">{{ wo.note }}</div>
                <a v-if="wo.mapsLink" :href="wo.mapsLink" target="_blank" rel="noopener" class="order-maps-link">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Apri in Maps
                </a>
                <div v-if="movingOrderId === wo.id" class="move-form">
                  <input v-model="moveTargetDate" class="field-input move-date-input" type="date" />
                  <button class="btn btn-move-confirm" @click="confirmMove">Conferma</button>
                  <button class="btn btn-ghost btn-move-cancel" @click="cancelMove">✕</button>
                </div>
              </div>
              <div class="order-actions">
                <button
                  class="icon-btn"
                  title="Sposta ad altro giorno"
                  :class="{ 'icon-btn-active': movingOrderId === wo.id }"
                  @click="movingOrderId === wo.id ? cancelMove() : startMove(wo)"
                >
                  <svg viewBox="0 0 24 24">
                    <rect x="3" y="4" width="18" height="18" rx="2"/>
                    <path d="M16 2v4M8 2v4M3 10h18"/>
                    <path d="M8 14h4m0 0l-2-2m2 2l-2 2"/>
                  </svg>
                </button>
                <button class="icon-btn" title="Modifica" @click="openEditForm(wo)">
                  <svg viewBox="0 0 24 24">
                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button class="icon-btn icon-btn-danger" title="Elimina" @click="deleteOrder(wo)">
                  <svg viewBox="0 0 24 24">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/>
                  </svg>
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>

      <!-- DESTRA: Form nuova / modifica lavorazione ────────────────── -->
      <div class="planning-col">
        <div class="slabel" style="margin-bottom: 12px">
          {{ editingId ? 'MODIFICA LAVORAZIONE' : 'NUOVA LAVORAZIONE' }}
        </div>
        <div class="card form-card">
          <div class="plan-form">

            <!-- Tab tipo -->
            <div class="type-tabs">
              <button
                v-for="t in planningTypes"
                :key="t"
                type="button"
                class="type-tab"
                :class="{ active: formData.type === t }"
                :style="formData.type === t ? { borderColor: ACT[t]?.color, color: ACT[t]?.color } : {}"
                @click="formData.type = t"
              >
                {{ ACT[t]?.emoji }} {{ ACT[t]?.label }}
              </button>
            </div>

            <!-- Campi POSA -->
            <template v-if="formData.type === 'posa'">
              <label class="field-label">N° ordine *</label>
              <input v-model="formData.orderNumber" class="field-input" type="text" placeholder="es. ORD-2025-001" />
              <label class="field-label">Attrezzatura *</label>
              <CatalogSelect v-model="formData.detail" value-field="label" />
              <label class="field-label">Link Maps cantiere</label>
              <input v-model="formData.mapsLink" class="field-input" type="url" placeholder="https://maps.google.com/..." />
            </template>

            <!-- Campi TRASFERIMENTO -->
            <template v-if="formData.type === 'trasferimento'">
              <label class="field-label">Destinazione</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Es. Parco Comunale..." />
              <label class="field-label" style="margin-top: 8px">Costi previsione</label>
              <div>
                <label class="field-label">Viaggio € (prev.)</label>
                <input v-model.number="formData.travelCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
              </div>
            </template>

            <!-- Campi ALTRO -->
            <template v-if="formData.type === 'altro'">
              <label class="field-label">Descrizione *</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Descrizione del lavoro..." />
            </template>

            <!-- Data -->
            <label class="field-label">Data *</label>
            <input v-model="formData.date" class="field-input" type="date" />

            <!-- Durata + Stima tempo affiancate -->
            <div v-if="!editingId" class="dur-stima-row">
              <div class="dur-stima-col">
                <label class="field-label">Durata</label>
                <div class="duration-row">
                  <button type="button" class="dur-btn" @click="formData.estimatedDuration = Math.max(1, formData.estimatedDuration - 1)">−</button>
                  <input v-model.number="formData.estimatedDuration" class="field-input dur-input" type="number" min="1" max="30" />
                  <button type="button" class="dur-btn" @click="formData.estimatedDuration = Math.min(30, formData.estimatedDuration + 1)">+</button>
                </div>
                <span class="dur-label">{{ formData.estimatedDuration === 1 ? 'giorno lav.' : 'giorni (Lun–Ven)' }}</span>
              </div>
              <div class="dur-stima-col">
                <label class="field-label">Stima tempo</label>
                <div class="duration-row">
                  <input v-model.number="formData.estimatedTimeH" class="field-input dur-input" type="number" min="0" max="23" placeholder="0" />
                  <span class="dur-sep">h</span>
                  <input v-model.number="formData.estimatedTimeM" class="field-input dur-input" type="number" min="0" max="59" step="15" placeholder="0" />
                  <span class="dur-sep">m</span>
                </div>
                <span class="dur-label">
                  <template v-if="formData.estimatedTimeH || formData.estimatedTimeM">{{ fmtEstimatedTime(formData.estimatedTimeH * 60 + formData.estimatedTimeM) }}</template>
                  <template v-else>ore · minuti</template>
                </span>
              </div>
            </div>

            <!-- Solo stima quando si modifica -->
            <template v-if="editingId">
              <div class="editing-single-day-note">ℹ Stai modificando questa singola giornata.</div>
              <label class="field-label">Stima tempo</label>
              <div class="duration-row">
                <input v-model.number="formData.estimatedTimeH" class="field-input dur-input" type="number" min="0" max="23" placeholder="0" />
                <span class="dur-sep">h</span>
                <input v-model.number="formData.estimatedTimeM" class="field-input dur-input" type="number" min="0" max="59" step="15" placeholder="0" />
                <span class="dur-sep">m</span>
                <span class="dur-label">
                  <template v-if="formData.estimatedTimeH || formData.estimatedTimeM">{{ fmtEstimatedTime(formData.estimatedTimeH * 60 + formData.estimatedTimeM) }}</template>
                </span>
              </div>
            </template>

            <!-- Preview date multi-giorno -->
            <div v-if="!editingId && formData.estimatedDuration > 1 && durationPreviewDates.length" class="duration-preview">
              <div class="duration-preview-title">Giornate che verranno create:</div>
              <div class="duration-preview-dates">
                <span v-for="(d, i) in durationPreviewDates" :key="d" class="duration-preview-chip">{{ i + 1 }}. {{ fmtShortDate(d) }}</span>
              </div>
            </div>

            <!-- Costi previsione POSA -->
            <template v-if="formData.type === 'posa'">
              <label class="field-label" style="margin-top: 8px">Costi previsione</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; margin-bottom:10px">
                <div>
                  <label class="field-label">Pranzo € (prev.)</label>
                  <input v-model.number="formData.lunchCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Materiale € (prev.)</label>
                  <input v-model.number="formData.materialCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Squadre esterne €</label>
                  <input v-model.number="formData.externalTeamCost" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Budget ordine €</label>
                  <input v-model.number="formData.budget" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
              </div>
            </template>

            <!-- Costi previsione ALTRO -->
            <template v-if="formData.type === 'altro'">
              <label class="field-label" style="margin-top: 8px">Costi previsione</label>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px 12px; margin-bottom:10px">
                <div>
                  <label class="field-label">Pranzo € (prev.)</label>
                  <input v-model.number="formData.lunchCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Materiale € (prev.)</label>
                  <input v-model.number="formData.materialCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Squadre esterne €</label>
                  <input v-model.number="formData.externalTeamCost" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Budget ordine €</label>
                  <input v-model.number="formData.budget" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
              </div>
            </template>

            <!-- Note -->
            <label class="field-label">Note</label>
            <textarea v-model="formData.note" class="field-textarea" rows="2" placeholder="Note aggiuntive..." />

            <div class="form-actions">
              <button class="btn btn-full" @click="saveForm">
                <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
                {{ editingId ? 'Salva modifiche' : 'Pianifica' }}
              </button>
              <button v-if="editingId" class="btn btn-ghost btn-full" @click="cancelForm">Annulla</button>
            </div>

          </div>
        </div>
      </div>

    </div><!-- /planning-top -->

  </div>
</template>

<style scoped lang="scss">
/* ─── Layout full-width ──────────────────────────────────────────── */
#view-planning {
  padding: 24px;
  width: 100%;
  box-sizing: border-box;
}

.planning-gantt {
  margin-bottom: 20px;
  width: 100%;
}

.planning-top {
  display: grid;
  grid-template-columns: 280px 1fr 300px;
  gap: 20px;
  align-items: start;
  width: 100%;
}

.planning-col {
  display: flex;
  flex-direction: column;
  gap: 0;
  min-width: 0;
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

.type-tabs {
  display: flex;
  gap: 6px;
  margin-bottom: 4px;
}

.type-tab {
  flex: 1;
  padding: 6px 8px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  color: var(--muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: border-color .15s, color .15s, background .15s;

  &.active {
    background: var(--surface3);
  }

  &:hover:not(.active) {
    background: var(--surface3);
    color: var(--text);
  }
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
  flex-direction: column;
  gap: 6px;
  margin-top: 4px;
}

.btn-full {
  width: 100%;
  justify-content: center;
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

.order-maps-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 5px;
  font-size: 12px;
  color: #4db6ac;
  text-decoration: none;
  font-weight: 500;

  &:hover { text-decoration: underline; }
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

/* ─── Blocco durata lavorazione ──────────────────────────────────── */
.duration-block {
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .field-label { margin-top: 0; }
}

// Dimensioni condivise fra input numerici e bottoni +/-
$dur-size: 36px;

.dur-stima-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.dur-stima-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 10px 8px;
  background: var(--surface2);

  &:first-child {
    border-right: 1px solid var(--border2);
  }

  .field-label { margin-top: 0; }
}

.dur-sep {
  font-size: 12px;
  color: var(--muted);
  flex-shrink: 0;
  width: 10px;
  text-align: center;
}

.duration-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

.dur-btn {
  width: $dur-size;
  height: $dur-size;
  flex-shrink: 0;
  background: var(--surface3);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  color: var(--text);
  font-size: 16px;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background .1s;
  &:hover { background: var(--orange); color: #fff; border-color: var(--orange); }
}

.dur-input {
  width: $dur-size !important;
  height: $dur-size;
  flex-shrink: 0;
  text-align: center;
  padding: 0 2px !important;
  font-size: 13px !important;
  font-weight: 400;
  font-family: 'DM Sans', sans-serif;
  box-sizing: border-box;
}

.dur-label {
  font-size: 12px;
  color: var(--muted);
  flex: 1;
}

/* Preview date generate */
.duration-preview {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.duration-preview-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--muted);
}

.duration-preview-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.duration-preview-chip {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--orange);
  background: rgba(255, 95, 0, .1);
  border: 1px solid rgba(255, 95, 0, .25);
  padding: 2px 8px;
  border-radius: 20px;
}

.duration-preview-note {
  font-size: 11px;
  color: var(--dim);
  font-style: italic;
  line-height: 1.4;
}

/* Nota modifica singolo giorno */
.editing-single-day-note {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface2);
  border: 1px solid var(--border);
  border-radius: var(--r-xs);
  padding: 7px 10px;
  line-height: 1.4;
}

/* Badge "Giorno X/Y" per ordini multi-giorno */
.day-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .3px;
  color: var(--muted);
  background: var(--surface3);
  border: 1px solid var(--border2);
  padding: 1px 6px;
  border-radius: 20px;
  margin-left: 6px;
  vertical-align: middle;
}

/* Chip stima tempo */
.time-estimate-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  font-weight: 600;
  color: var(--green);
  background: rgba(34, 197, 94, .1);
  padding: 1px 7px;
  border-radius: 20px;
}

/* Form inline spostamento data */
.move-form {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.move-date-input {
  flex: 1;
  min-width: 130px;
  padding: 6px 8px;
  font-size: 12px;
}

.btn-move-confirm {
  padding: 6px 12px;
  font-size: 12px;
  background: var(--orange);
  color: #fff;
  border: none;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-weight: 600;
  &:hover { background: var(--orange-d); }
}

.btn-move-cancel {
  padding: 6px 10px;
  font-size: 12px;
}

.icon-btn-active {
  background: rgba(255, 95, 0, .12) !important;
  color: var(--orange) !important;
  border-color: var(--orange) !important;
}

/* ─── Gantt HTML interattivo ─────────────────────────────────────── */

/* Hint testuale accanto all'etichetta quando un blocco è selezionato */
.gantt-hint {
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0;
  text-transform: none;
  color: var(--orange);
  margin-left: 8px;
  animation: blink 1.5s ease-in-out infinite;
}

/* Toolbar spostamento con input date */
.gantt-move-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--orange);
  border-radius: var(--r-sm);
  padding: 8px 12px;
  margin-bottom: 8px;
  flex-wrap: wrap;
}

.gantt-move-label {
  flex: 1;
  font-size: 12px;
  color: var(--text);
  min-width: 160px;
}

.gantt-move-input {
  flex: 0 0 auto;
  width: auto;
  padding: 5px 8px;
  font-size: 12px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  color: var(--text);
  outline: none;
  &:focus { border-color: var(--orange); }
}

.gantt-move-confirm {
  padding: 5px 14px;
  background: var(--orange);
  color: #fff;
  border: none;
  border-radius: var(--r-xs);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  &:hover { background: var(--orange-d); }
}

.gantt-move-cancel {
  padding: 5px 10px;
  background: var(--surface2);
  color: var(--muted);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  font-size: 12px;
  cursor: pointer;
  &:hover { background: var(--surface3); color: var(--text); }
}

/* Card Gantt: nessun padding, la griglia arriva ai bordi */
.gantt-card {
  padding: 0;
  overflow: hidden;
}

/* Wrapper con scroll orizzontale */
.gantt-grid-wrap {
  overflow-x: auto;
  overflow-y: visible;
  min-width: 0;
}

/* Riga header con le date */
.gantt-header-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 2;
}

/* Riga lavorazione */
.gantt-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(255,255,255,.015); }
}

/* Cella etichetta lavorazione (colonna fissa a sinistra) */
.gantt-label-cell {
  flex: 0 0 200px;
  min-width: 200px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
}

.gantt-label-header {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--muted);
  background: var(--surface);
}

.gantt-row-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.gantt-row-label {
  font-size: 11px;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 165px;
}

/* Header singolo giorno */
.gantt-day-header {
  flex: 0 0 36px;
  min-width: 36px;
  text-align: center;
  padding: 4px 2px;
  border-right: 1px solid var(--border);
  cursor: default;

  &:last-child { border-right: none; }

  &.gantt-day-weekend {
    background: rgba(255,255,255,.025);
  }

  &.gantt-day-today {
    background: rgba(255, 95, 0, .12);
    .gantt-day-num { color: var(--orange); font-weight: 700; }
  }
}

.gantt-day-name {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .3px;
  color: var(--muted);
  line-height: 1.2;
}

.gantt-day-num {
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  line-height: 1.2;
}

/* Singola cella giornaliera nella riga lavorazione */
.gantt-cell {
  flex: 0 0 36px;
  min-width: 36px;
  height: 36px;
  padding: 3px;
  border-right: 1px solid var(--border);
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;

  &:last-child { border-right: none; }

  &.gantt-cell-weekend {
    background: rgba(255,255,255,.025);
  }

  &.gantt-cell-today {
    background: rgba(255, 95, 0, .06);
  }

  &.gantt-cell-droptarget {
    cursor: crosshair;
    &:hover {
      background: rgba(255, 95, 0, .12);
      &::after {
        content: '+';
        position: absolute;
        color: var(--orange);
        font-size: 16px;
        font-weight: 700;
        line-height: 1;
      }
    }
  }
}

/* Blocco lavorazione dentro la cella */
.gantt-block {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  border: 1px solid transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: filter .12s, transform .1s, box-shadow .12s;
  position: relative;

  &:hover {
    filter: brightness(1.2);
    transform: scale(1.05);
  }

  &.gantt-block-selected {
    box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--orange);
    transform: scale(1.08);
    filter: brightness(1.25);
    z-index: 2;
  }
}

/* Badge "X/Y" nei blocchi multi-giorno */
.gantt-block-badge {
  font-size: 8px;
  font-weight: 800;
  color: rgba(255,255,255,.9);
  line-height: 1;
  text-shadow: 0 1px 2px rgba(0,0,0,.5);
  pointer-events: none;
}
</style>
