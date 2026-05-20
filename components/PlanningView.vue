<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore }    from '~/composables/useStore'
import { useAppState } from '~/composables/useAppState'
import { useExport }   from '~/composables/useExport'
import { ACT, MONTHS_IT } from '~/constants'
import type { WorkOrder, ActivityType } from '~/types'

const WEEK_HEADERS = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']

const store    = useStore()
const appState = useAppState()
const exporter = useExport()

// ── Utility ───────────────────────────────────────────────────────────
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const todayStr = toDateStr(new Date())

function getWorkingDays(startDateStr: string, count: number): string[] {
  const result: string[] = []
  const [y, m, d] = startDateStr.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  while (result.length < count) {
    const dow = date.getDay()
    if (dow !== 0 && dow !== 6) result.push(toDateStr(date))
    date.setDate(date.getDate() + 1)
  }
  return result
}

function fmtEstimatedTime(minutes: number): string {
  if (!minutes) return ''
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `~${h}h ${m}m`
  if (h > 0) return `~${h}h`
  return `~${m}m`
}

// ── Calendar ──────────────────────────────────────────────────────────
const calYear  = ref(new Date().getFullYear())
const calMonth = ref(new Date().getMonth())

const selectedDate = ref(todayStr)

const calTitle = computed(() => `${MONTHS_IT[calMonth.value]} ${calYear.value}`)

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate()
}
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

// ── Day orders ────────────────────────────────────────────────────────
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

// ── Form ──────────────────────────────────────────────────────────────
const editingId = ref<string | null>(null)
const formData  = ref({
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

function cancelForm(): void { resetFormData() }

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

// ── Move order ────────────────────────────────────────────────────────
const movingOrderId  = ref<string | null>(null)
const moveTargetDate = ref('')

function startMove(wo: WorkOrder): void {
  movingOrderId.value  = wo.id
  moveTargetDate.value = wo.date
}
function confirmMove(): void {
  if (!movingOrderId.value || !moveTargetDate.value) return
  store.updateWorkOrder(movingOrderId.value, { date: moveTargetDate.value })
  const [y, m] = moveTargetDate.value.split('-').map(Number)
  calYear.value      = y
  calMonth.value     = m - 1
  selectedDate.value = moveTargetDate.value
  movingOrderId.value = null
  appState.showToast('Lavorazione spostata')
}
function cancelMove(): void { movingOrderId.value = null }

// ── Delete order ──────────────────────────────────────────────────────
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

// ── Gantt (3-week, existing) ──────────────────────────────────────────
const GANTT_DAYS = 21
const DAY_NAMES  = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']

function ganttStart(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow)
  return d
}

const ganttDays = computed(() => {
  const start = ganttStart()
  return Array.from({ length: GANTT_DAYS }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    return { dateStr: toDateStr(d), num: d.getDate(), name: DAY_NAMES[dow], isToday: toDateStr(d) === todayStr, isWeekend: dow === 0 || dow === 6 }
  })
})

const ganttWindowOrders = computed(() => {
  const start = ganttStart()
  const end   = new Date(start)
  end.setDate(end.getDate() + GANTT_DAYS)
  const s = toDateStr(start)
  const e = toDateStr(new Date(end.getTime() - 86_400_000))
  return store.getAllWorkOrders().filter(wo => wo.date >= s && wo.date <= e)
})

interface GanttRow {
  key: string; label: string; color: string; ordersByDate: Record<string, WorkOrder>
}

const ganttRows = computed((): GanttRow[] => {
  const rowMap = new Map<string, GanttRow>()
  for (const wo of ganttWindowOrders.value) {
    const key = wo.groupId ?? wo.id
    if (!rowMap.has(key)) {
      const raw = `${wo.orderNumber} – ${wo.detail}`
      rowMap.set(key, { key, label: raw.length > 36 ? raw.substring(0, 34) + '…' : raw, color: ACT[wo.type]?.color ?? '#888', ordersByDate: {} })
    }
    rowMap.get(key)!.ordersByDate[wo.date] = wo
  }
  return Array.from(rowMap.values()).sort((a, b) => {
    const aFirst = Object.keys(a.ordersByDate).sort()[0] ?? ''
    const bFirst = Object.keys(b.ordersByDate).sort()[0] ?? ''
    return aFirst.localeCompare(bFirst)
  })
})

const selectedGanttBlock = ref<WorkOrder | null>(null)
const ganttMoveDate       = ref('')

function selectGanttBlock(wo: WorkOrder): void {
  if (selectedGanttBlock.value?.id === wo.id) { selectedGanttBlock.value = null; return }
  selectedGanttBlock.value = wo
  ganttMoveDate.value      = wo.date
}
function quickMoveGanttBlock(dateStr: string): void {
  if (!selectedGanttBlock.value) return
  store.updateWorkOrder(selectedGanttBlock.value.id, { date: dateStr })
  appState.showToast('Lavorazione spostata')
  selectedGanttBlock.value = null
}
function confirmGanttMove(): void {
  if (!selectedGanttBlock.value || !ganttMoveDate.value) return
  store.updateWorkOrder(selectedGanttBlock.value.id, { date: ganttMoveDate.value })
  appState.showToast('Lavorazione spostata')
  selectedGanttBlock.value = null
}

const durationPreviewDates = computed(() => {
  if (!formData.value.date || formData.value.estimatedDuration <= 1) return []
  return getWorkingDays(formData.value.date, formData.value.estimatedDuration)
})

function fmtShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  const days   = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const date   = new Date(parseInt(dateStr.split('-')[0]), m - 1, d)
  return `${days[date.getDay()]} ${d} ${months[m - 1]}`
}

function clearGanttBlock(): void { selectedGanttBlock.value = null }

function handleGanttCellClick(row: GanttRow, dateStr: string): void {
  const wo = row.ordersByDate[dateStr]
  if (wo) selectGanttBlock(wo)
  else if (selectedGanttBlock.value) quickMoveGanttBlock(dateStr)
}

// ── Week navigation (new) ─────────────────────────────────────────────
const weekOffset = ref(0)

const currentWeekStart = computed(() => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  const dow = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dow + weekOffset.value * 7)
  return d
})

const currentWeekDays = computed(() => {
  const start = currentWeekStart.value
  const shortDays = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom']
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(start)
    d.setDate(d.getDate() + i)
    const dow = d.getDay()
    return {
      dateStr:   toDateStr(d),
      num:       d.getDate(),
      name:      shortDays[(dow + 6) % 7],
      isToday:   toDateStr(d) === todayStr,
      isWeekend: dow === 0 || dow === 6,
    }
  })
})

const weekNumber = computed(() => {
  const d = currentWeekStart.value
  const startOfYear = new Date(d.getFullYear(), 0, 1)
  return Math.ceil(((d.getTime() - startOfYear.getTime()) / 86400000 + ((startOfYear.getDay() + 6) % 7)) / 7)
})

const weekRange = computed(() => {
  const days   = currentWeekDays.value
  const months = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
  const [y1, m1, d1] = days[0].dateStr.split('-').map(Number)
  const [y2, m2, d2] = days[6].dateStr.split('-').map(Number)
  if (m1 === m2) return `${d1}–${d2} ${months[m2 - 1]} ${y2}`
  return `${d1} ${months[m1 - 1]} – ${d2} ${months[m2 - 1]} ${y2}`
})

const currentWeekOrders = computed(() => {
  const dates = new Set(currentWeekDays.value.map(d => d.dateStr))
  return store.getAllWorkOrders().filter(wo => dates.has(wo.date))
})

const weekStats = computed(() => {
  const orders = currentWeekOrders.value
  const mins   = orders.reduce((s, wo) => s + (wo.estimatedTime ?? 0), 0)
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return {
    count:  orders.length,
    hours:  mins > 0 ? (m > 0 ? `${h}h ${m}m` : `${h}h`) : '—',
    travel: orders.filter(wo => wo.type === 'trasferimento').length,
  }
})

const weekGanttRows = computed((): GanttRow[] => {
  const rowMap = new Map<string, GanttRow>()
  for (const wo of currentWeekOrders.value) {
    const key = wo.groupId ?? wo.id
    if (!rowMap.has(key)) {
      const label = wo.detail.length > 32 ? wo.detail.substring(0, 30) + '…' : wo.detail
      rowMap.set(key, {
        key,
        label:        wo.orderNumber ? `${wo.orderNumber} – ${label}` : label,
        color:        ACT[wo.type]?.color ?? '#888',
        ordersByDate: {},
      })
    }
    rowMap.get(key)!.ordersByDate[wo.date] = wo
  }
  return Array.from(rowMap.values()).sort((a, b) => {
    const aFirst = Object.keys(a.ordersByDate).sort()[0] ?? ''
    const bFirst = Object.keys(b.ordersByDate).sort()[0] ?? ''
    return aFirst.localeCompare(bFirst)
  })
})

const backlogOrders = computed(() => {
  const weekDates = new Set(currentWeekDays.value.map(d => d.dateStr))
  return store.getAllWorkOrders()
    .filter(wo => !weekDates.has(wo.date) && wo.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6)
})

const workspaceName = computed(() => appState.activeWorkspaceName.value || 'Workspace')

const showGantt = ref(false)
</script>

<template>
  <div class="view" id="view-planning">

    <!-- ── Header ──────────────────────────────────────────────────── -->
    <div class="pl-top">
      <div class="pl-heading">
        <div class="pl-ws-label">{{ workspaceName }}</div>
        <h1 class="pl-title">Pianificazione</h1>
        <div class="pl-week-label">Settimana {{ weekNumber }} · {{ weekRange }}</div>
      </div>
      <div class="pl-actions">
        <button class="pl-btn-ghost" @click="weekOffset = 0">Oggi</button>
        <div class="pl-week-nav">
          <button @click="weekOffset--">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button @click="weekOffset++">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <button
          class="pl-btn-ghost"
          @click="exporter.exportPlanning(
            `${calYear}-${String(calMonth + 1).padStart(2, '0')}-01`,
            (() => { const d = new Date(calYear, calMonth + 1, 0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
          )"
        >
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
          Esporta Excel
        </button>
      </div>
    </div>

    <!-- ── Main grid ───────────────────────────────────────────────── -->
    <div class="pl-grid">

      <!-- Left: Weekly grid + Backlog ──────────────────────────────── -->
      <div class="pl-col-main">

        <!-- Weekly planning grid -->
        <div class="pl-section">
          <div class="pl-section-head">
            <span class="pl-section-title">Griglia settimanale</span>
            <span class="pl-section-sub">{{ weekStats.count }} lavorazioni</span>
          </div>

          <!-- Gantt move toolbar -->
          <div v-if="selectedGanttBlock" class="pl-gantt-toolbar">
            <span class="pl-gantt-toolbar-label">
              Sposta <strong>{{ selectedGanttBlock.detail }}</strong>
              <span v-if="selectedGanttBlock.totalDays && selectedGanttBlock.totalDays > 1">
                (Giorno {{ selectedGanttBlock.dayIndex }}/{{ selectedGanttBlock.totalDays }})
              </span>
            </span>
            <input v-model="ganttMoveDate" type="date" class="pl-gantt-date-input" />
            <button class="pl-gantt-confirm" @click="confirmGanttMove">Sposta</button>
            <button class="pl-gantt-cancel" @click="clearGanttBlock">✕</button>
          </div>

          <div v-if="!weekGanttRows.length" class="pl-empty">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Nessuna lavorazione questa settimana
          </div>
          <div v-else class="pl-week-wrap">
            <!-- Header row -->
            <div class="pl-week-header">
              <div class="pl-week-label-cell pl-week-label-hdr">Lavorazione</div>
              <div
                v-for="day in currentWeekDays"
                :key="day.dateStr"
                class="pl-week-day-hdr"
                :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
              >
                <div class="pl-week-day-name">{{ day.name }}</div>
                <div class="pl-week-day-num">{{ day.num }}</div>
              </div>
            </div>
            <!-- Rows -->
            <div v-for="row in weekGanttRows" :key="row.key" class="pl-week-row">
              <div class="pl-week-label-cell" :title="row.label">
                <div class="pl-week-row-dot" :style="{ background: row.color }" />
                <span class="pl-week-row-label">{{ row.label }}</span>
              </div>
              <div
                v-for="day in currentWeekDays"
                :key="day.dateStr"
                class="pl-week-cell"
                :class="{
                  'is-today':   day.isToday,
                  'is-weekend': day.isWeekend,
                  'is-drop':    selectedGanttBlock && !row.ordersByDate[day.dateStr],
                }"
                @click="handleGanttCellClick(row, day.dateStr)"
              >
                <div
                  v-if="row.ordersByDate[day.dateStr]"
                  class="pl-week-block"
                  :class="{ 'is-selected': selectedGanttBlock?.id === row.ordersByDate[day.dateStr].id }"
                  :style="{ background: row.color + 'CC', borderColor: row.color }"
                  :title="`${row.ordersByDate[day.dateStr].detail} · Ord. ${row.ordersByDate[day.dateStr].orderNumber}`"
                >
                  <span v-if="(row.ordersByDate[day.dateStr].totalDays ?? 0) > 1" class="pl-week-block-badge">
                    {{ row.ordersByDate[day.dateStr].dayIndex }}/{{ row.ordersByDate[day.dateStr].totalDays }}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Backlog -->
        <div class="pl-section">
          <div class="pl-section-head">
            <span class="pl-section-title">Backlog · da assegnare</span>
            <span class="pl-section-sub">{{ backlogOrders.length }} in coda</span>
          </div>
          <div v-if="!backlogOrders.length" class="pl-empty">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Nessun ordine in backlog
          </div>
          <div v-else class="pl-backlog-list">
            <div v-for="wo in backlogOrders" :key="wo.id" class="pl-backlog-item">
              <div class="pl-backlog-left">
                <div class="pl-backlog-id">{{ wo.orderNumber || '—' }}</div>
                <div class="pl-backlog-detail">{{ wo.detail }}</div>
                <div class="pl-backlog-meta">
                  <span v-if="wo.mapsLink" class="pl-backlog-loc">
                    <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    {{ fmtDate(wo.date) }}
                  </span>
                </div>
              </div>
              <div class="pl-backlog-right">
                <span class="pl-backlog-status">Pianificato</span>
                <span class="pl-backlog-priority" :style="{ background: `${ACT[wo.type]?.color}22`, color: ACT[wo.type]?.color }">
                  {{ ACT[wo.type]?.label }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <!-- Full 3-week Gantt (collapsed section) -->
        <div class="pl-section">
          <div class="pl-section-head pl-section-head-toggle" @click="showGantt = !showGantt">
            <span class="pl-section-title">Gantt 3 settimane</span>
            <span class="pl-section-sub">{{ ganttWindowOrders.length }} lavorazioni</span>
            <svg class="pl-toggle-arrow" :class="{ open: showGantt }" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
          </div>
          <div v-if="showGantt">
            <div v-if="selectedGanttBlock" class="pl-gantt-toolbar">
              <span class="pl-gantt-toolbar-label">
                Sposta <strong>{{ selectedGanttBlock.detail }}</strong>
              </span>
              <input v-model="ganttMoveDate" type="date" class="pl-gantt-date-input" />
              <button class="pl-gantt-confirm" @click="confirmGanttMove">Sposta</button>
              <button class="pl-gantt-cancel" @click="clearGanttBlock">✕</button>
            </div>
            <div v-if="!ganttWindowOrders.length" class="pl-empty">
              <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
              Nessuna lavorazione nelle prossime 3 settimane
            </div>
            <div v-else class="pl-week-wrap pl-week-wrap-scroll">
              <div class="pl-week-header">
                <div class="pl-week-label-cell pl-week-label-hdr">Lavorazione</div>
                <div
                  v-for="day in ganttDays"
                  :key="day.dateStr"
                  class="pl-week-day-hdr pl-week-day-hdr-sm"
                  :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
                >
                  <div class="pl-week-day-name">{{ day.name }}</div>
                  <div class="pl-week-day-num">{{ day.num }}</div>
                </div>
              </div>
              <div v-for="row in ganttRows" :key="row.key" class="pl-week-row">
                <div class="pl-week-label-cell" :title="row.label">
                  <div class="pl-week-row-dot" :style="{ background: row.color }" />
                  <span class="pl-week-row-label">{{ row.label }}</span>
                </div>
                <div
                  v-for="day in ganttDays"
                  :key="day.dateStr"
                  class="pl-week-cell pl-week-cell-sm"
                  :class="{
                    'is-today':   day.isToday,
                    'is-weekend': day.isWeekend,
                    'is-drop':    selectedGanttBlock && !row.ordersByDate[day.dateStr],
                  }"
                  @click="handleGanttCellClick(row, day.dateStr)"
                >
                  <div
                    v-if="row.ordersByDate[day.dateStr]"
                    class="pl-week-block"
                    :class="{ 'is-selected': selectedGanttBlock?.id === row.ordersByDate[day.dateStr].id }"
                    :style="{ background: row.color + 'CC', borderColor: row.color }"
                  >
                    <span v-if="(row.ordersByDate[day.dateStr].totalDays ?? 0) > 1" class="pl-week-block-badge">
                      {{ row.ordersByDate[day.dateStr].dayIndex }}/{{ row.ordersByDate[day.dateStr].totalDays }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div><!-- /pl-col-main -->

      <!-- Right: Calendar + Day orders + Stats + Form ───────────────── -->
      <div class="pl-col-side">

        <!-- Calendar -->
        <div class="pl-section">
          <div class="pl-section-head">
            <button class="pl-cal-nav" @click="prevMonth">
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="pl-section-title">{{ calTitle }}</span>
            <button class="pl-cal-nav" @click="nextMonth">
              <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>
          <div class="pl-cal-body">
            <div class="pl-cal-weekdays">
              <div v-for="d in WEEK_HEADERS" :key="d">{{ d }}</div>
            </div>
            <div class="pl-cal-days">
              <div
                v-for="(cell, idx) in calDays"
                :key="idx"
                class="pl-cal-cell"
                :class="{
                  'is-empty':    !cell,
                  'is-today':     cell?.dateStr === todayStr,
                  'is-selected':  cell?.dateStr === selectedDate,
                  'has-work':     cell && cell.orders > 0,
                }"
                @click="cell && selectDate(cell.dateStr)"
              >
                <template v-if="cell">
                  <span class="pl-cal-num">{{ cell.day }}</span>
                  <div v-if="cell.orders > 0" class="pl-cal-dots">
                    <span v-for="n in Math.min(cell.orders, 3)" :key="n" class="pl-cal-dot" />
                  </div>
                </template>
              </div>
            </div>
          </div>
        </div>

        <!-- Day orders -->
        <div class="pl-section">
          <div class="pl-section-head">
            <span class="pl-section-title">
              {{ fmtDate(selectedDate) }}
              <span v-if="selectedDate === todayStr" class="pl-today-tag">OGGI</span>
            </span>
            <span class="pl-section-sub">{{ selectedOrders.length }} lavorazioni</span>
          </div>
          <div v-if="!selectedOrders.length" class="pl-empty">
            <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
            Nessuna lavorazione
          </div>
          <div v-else class="pl-order-list">
            <div v-for="wo in selectedOrders" :key="wo.id" class="pl-order-item">
              <div class="pl-order-bar" :style="{ background: ACT[wo.type]?.color ?? '#888' }" />
              <div class="pl-order-body">
                <div class="pl-order-title">
                  {{ wo.detail }}
                  <span v-if="wo.groupId && wo.totalDays && wo.totalDays > 1" class="pl-day-badge">
                    {{ wo.dayIndex }}/{{ wo.totalDays }}
                  </span>
                </div>
                <div class="pl-order-meta">
                  <span class="pl-order-type-tag" :style="{ background: `${ACT[wo.type]?.color}22`, color: ACT[wo.type]?.color }">
                    {{ ACT[wo.type]?.emoji }} {{ ACT[wo.type]?.label }}
                  </span>
                  <span v-if="wo.orderNumber">{{ wo.orderNumber }}</span>
                  <span v-if="wo.estimatedTime" class="pl-time-chip">⏱ {{ fmtEstimatedTime(wo.estimatedTime) }}</span>
                </div>
                <div v-if="wo.note" class="pl-order-note">{{ wo.note }}</div>
                <a v-if="wo.mapsLink" :href="wo.mapsLink" target="_blank" rel="noopener" class="pl-maps-link">
                  <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                  Apri in Maps
                </a>
                <div v-if="movingOrderId === wo.id" class="pl-move-form">
                  <input v-model="moveTargetDate" class="field-input" type="date" />
                  <button class="pl-move-confirm" @click="confirmMove">Sposta</button>
                  <button class="pl-btn-ghost-sm" @click="cancelMove">✕</button>
                </div>
              </div>
              <div class="pl-order-actions">
                <button class="pl-icon-btn" :class="{ active: movingOrderId === wo.id }" title="Sposta" @click="movingOrderId === wo.id ? cancelMove() : startMove(wo)">
                  <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/><path d="M8 14h4m0 0l-2-2m2 2l-2 2"/></svg>
                </button>
                <button class="pl-icon-btn" title="Modifica" @click="openEditForm(wo)">
                  <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                </button>
                <button class="pl-icon-btn pl-icon-btn-danger" title="Elimina" @click="deleteOrder(wo)">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/></svg>
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Week stats -->
        <div class="pl-section">
          <div class="pl-section-head">
            <span class="pl-section-title">Settimana {{ weekNumber }}</span>
          </div>
          <div class="pl-stats-grid">
            <div class="pl-stat">
              <div class="pl-stat-val">{{ weekStats.count }}</div>
              <div class="pl-stat-label">Lavorazioni</div>
            </div>
            <div class="pl-stat">
              <div class="pl-stat-val">{{ weekStats.hours }}</div>
              <div class="pl-stat-label">Ore pianificate</div>
            </div>
            <div class="pl-stat">
              <div class="pl-stat-val">{{ weekStats.travel }}</div>
              <div class="pl-stat-label">Trasferte</div>
            </div>
          </div>
        </div>

        <!-- Add/edit form -->
        <div class="pl-section">
          <div class="pl-section-head">
            <span class="pl-section-title">{{ editingId ? 'Modifica' : 'Nuova lavorazione' }}</span>
            <button v-if="editingId" class="pl-btn-ghost-sm" @click="cancelForm">Annulla</button>
          </div>
          <div class="pl-form">

            <!-- Type tabs -->
            <div class="pl-type-tabs">
              <button
                v-for="t in planningTypes"
                :key="t"
                class="pl-type-tab"
                :class="{ active: formData.type === t }"
                :style="formData.type === t ? { borderColor: ACT[t]?.color, color: ACT[t]?.color } : {}"
                @click="formData.type = t"
              >{{ ACT[t]?.emoji }} {{ ACT[t]?.label }}</button>
            </div>

            <!-- Posa fields -->
            <template v-if="formData.type === 'posa'">
              <label class="field-label">N° ordine *</label>
              <input v-model="formData.orderNumber" class="field-input" type="text" placeholder="es. ORD-2025-001" />
              <label class="field-label">Attrezzatura *</label>
              <CatalogSelect v-model="formData.detail" value-field="label" />
              <label class="field-label">Link Maps cantiere</label>
              <input v-model="formData.mapsLink" class="field-input" type="url" placeholder="https://maps.google.com/..." />
            </template>

            <!-- Trasferimento fields -->
            <template v-if="formData.type === 'trasferimento'">
              <label class="field-label">Destinazione</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Es. Parco Comunale..." />
              <label class="field-label">Viaggio € (prev.)</label>
              <input v-model.number="formData.travelCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
            </template>

            <!-- Altro fields -->
            <template v-if="formData.type === 'altro'">
              <label class="field-label">Descrizione *</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Descrizione del lavoro..." />
            </template>

            <!-- Date -->
            <label class="field-label">Data *</label>
            <input v-model="formData.date" class="field-input" type="date" />

            <!-- Duration + time estimate -->
            <div v-if="!editingId" class="pl-dur-row">
              <div class="pl-dur-col">
                <label class="field-label">Durata</label>
                <div class="pl-dur-ctrl">
                  <button type="button" class="pl-dur-btn" @click="formData.estimatedDuration = Math.max(1, formData.estimatedDuration - 1)">−</button>
                  <input v-model.number="formData.estimatedDuration" class="field-input pl-dur-input" type="number" min="1" max="30" />
                  <button type="button" class="pl-dur-btn" @click="formData.estimatedDuration = Math.min(30, formData.estimatedDuration + 1)">+</button>
                </div>
                <span class="pl-dur-hint">{{ formData.estimatedDuration === 1 ? 'giorno lav.' : 'giorni (Lun–Ven)' }}</span>
              </div>
              <div class="pl-dur-col">
                <label class="field-label">Stima tempo</label>
                <div class="pl-dur-ctrl">
                  <input v-model.number="formData.estimatedTimeH" class="field-input pl-dur-input" type="number" min="0" max="23" placeholder="0" />
                  <span class="pl-dur-sep">h</span>
                  <input v-model.number="formData.estimatedTimeM" class="field-input pl-dur-input" type="number" min="0" max="59" step="15" placeholder="0" />
                  <span class="pl-dur-sep">m</span>
                </div>
              </div>
            </div>

            <template v-if="editingId">
              <div class="pl-edit-note">ℹ Stai modificando questa singola giornata.</div>
              <label class="field-label">Stima tempo</label>
              <div class="pl-dur-ctrl">
                <input v-model.number="formData.estimatedTimeH" class="field-input pl-dur-input" type="number" min="0" max="23" placeholder="0" />
                <span class="pl-dur-sep">h</span>
                <input v-model.number="formData.estimatedTimeM" class="field-input pl-dur-input" type="number" min="0" max="59" step="15" placeholder="0" />
                <span class="pl-dur-sep">m</span>
              </div>
            </template>

            <!-- Multi-day preview -->
            <div v-if="!editingId && formData.estimatedDuration > 1 && durationPreviewDates.length" class="pl-preview">
              <div class="pl-preview-title">Giornate che verranno create:</div>
              <div class="pl-preview-chips">
                <span v-for="(d, i) in durationPreviewDates" :key="d" class="pl-preview-chip">{{ i + 1 }}. {{ fmtShortDate(d) }}</span>
              </div>
            </div>

            <!-- Cost fields (posa + altro) -->
            <template v-if="formData.type === 'posa' || formData.type === 'altro'">
              <label class="field-label" style="margin-top: 4px">Costi previsione</label>
              <div class="pl-cost-grid">
                <div>
                  <label class="field-label">Pranzo €</label>
                  <input v-model.number="formData.lunchCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Materiale €</label>
                  <input v-model.number="formData.materialCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Squadre est. €</label>
                  <input v-model.number="formData.externalTeamCost" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
                <div>
                  <label class="field-label">Budget €</label>
                  <input v-model.number="formData.budget" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
                </div>
              </div>
            </template>

            <!-- Notes -->
            <label class="field-label">Note</label>
            <textarea v-model="formData.note" class="field-input field-textarea" rows="2" placeholder="Note aggiuntive..." />

            <button class="pl-save-btn" @click="saveForm">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              {{ editingId ? 'Salva modifiche' : 'Pianifica' }}
            </button>

          </div>
        </div>

      </div><!-- /pl-col-side -->

    </div><!-- /pl-grid -->

  </div>
</template>

<style scoped lang="scss">
// ── Layout ────────────────────────────────────────────────────────────
#view-planning {
  display: flex;
  flex-direction: column;
  padding: 0;
  height: 100%;
  overflow: hidden;
}

.pl-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  padding: 24px 28px 16px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  flex-wrap: wrap;
}

.pl-heading {
  min-width: 0;
}

.pl-ws-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 3px;
}

.pl-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 3px;
  line-height: 1.2;
}

.pl-week-label {
  font-size: 12px;
  color: var(--muted-2);
}

.pl-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.pl-btn-ghost {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: border-color .12s, color .12s;

  &:hover { border-color: var(--border-strong); color: var(--ink); }

  svg {
    width: 13px; height: 13px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.pl-week-nav {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;

  button {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--muted);
    transition: background .12s, color .12s;

    &:hover { background: var(--surface-2); color: var(--ink); }

    &:first-child { border-right: 1px solid var(--border); }

    svg {
      width: 14px; height: 14px;
      stroke: currentColor; fill: none;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }
  }
}

// ── Grid ──────────────────────────────────────────────────────────────
.pl-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 0;
  flex: 1;
  overflow: hidden;
}

.pl-col-main {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
  border-right: 1px solid var(--border);
}

.pl-col-side {
  display: flex;
  flex-direction: column;
  gap: 0;
  overflow-y: auto;
}

// ── Section ───────────────────────────────────────────────────────────
.pl-section {
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;

  &:last-child { border-bottom: none; }
}

.pl-section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.pl-section-head-toggle {
  cursor: pointer;
  user-select: none;
  &:hover { background: var(--surface-2); }
}

.pl-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  flex: 1;
}

.pl-section-sub {
  font-size: 11px;
  color: var(--muted);
}

.pl-toggle-arrow {
  width: 14px; height: 14px;
  stroke: var(--muted); fill: none;
  stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  transition: transform .15s;
  &.open { transform: rotate(180deg); }
}

.pl-today-tag {
  display: inline-block;
  background: var(--live);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .5px;
  padding: 1px 5px;
  border-radius: 10px;
  margin-left: 5px;
  vertical-align: middle;
}

.pl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 20px;
  color: var(--muted);
  font-size: 12px;
  text-align: center;

  svg {
    width: 20px; height: 20px;
    stroke: var(--muted); fill: none;
    stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round;
    opacity: .5;
  }
}

// ── Weekly gantt grid ─────────────────────────────────────────────────
.pl-gantt-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border-bottom: 1px solid var(--live);
  padding: 8px 18px;
  flex-wrap: wrap;
}

.pl-gantt-toolbar-label {
  flex: 1;
  font-size: 12px;
  color: var(--ink);
  min-width: 120px;
}

.pl-gantt-date-input {
  flex: 0 0 auto;
  padding: 5px 8px;
  font-size: 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--ink);
  font-family: var(--ff);
  outline: none;
  &:focus { border-color: var(--live); }
}

.pl-gantt-confirm {
  padding: 5px 12px;
  background: var(--live);
  color: #fff;
  border: none;
  border-radius: var(--radius-xs);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  font-family: var(--ff);
}

.pl-gantt-cancel {
  padding: 5px 10px;
  background: var(--surface-2);
  color: var(--muted);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  font-size: 12px;
  cursor: pointer;
  font-family: var(--ff);
  &:hover { color: var(--ink); }
}

.pl-week-wrap {
  overflow-x: auto;

  &.pl-week-wrap-scroll {
    max-height: 260px;
    overflow-y: auto;
  }
}

.pl-week-header {
  display: flex;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 2;
}

.pl-week-row {
  display: flex;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(255,255,255,.015); }
}

.pl-week-label-cell {
  flex: 0 0 180px;
  min-width: 180px;
  padding: 6px 12px;
  display: flex;
  align-items: center;
  gap: 7px;
  border-right: 1px solid var(--border);
  position: sticky;
  left: 0;
  background: var(--surface);
  z-index: 1;
}

.pl-week-label-hdr {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--muted);
}

.pl-week-row-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pl-week-row-label {
  font-size: 11px;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 145px;
}

.pl-week-day-hdr {
  flex: 1;
  min-width: 60px;
  text-align: center;
  padding: 6px 4px;
  border-right: 1px solid var(--border);
  &:last-child { border-right: none; }
  &.is-weekend { background: rgba(255,255,255,.02); }
  &.is-today   { background: rgba(245, 165, 36, .1); }
}

.pl-week-day-hdr-sm {
  flex: 0 0 36px;
  min-width: 36px;
}

.pl-week-day-name {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .3px;
  color: var(--muted);
  line-height: 1.2;
}

.pl-week-day-num {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);

  .is-today & { color: var(--live); }
}

.pl-week-cell {
  flex: 1;
  min-width: 60px;
  min-height: 38px;
  padding: 4px;
  border-right: 1px solid var(--border);
  cursor: default;
  &:last-child { border-right: none; }
  &.is-weekend { background: rgba(255,255,255,.015); }
  &.is-today   { background: rgba(245, 165, 36, .06); }
  &.is-drop    { cursor: crosshair; &:hover { background: rgba(245, 165, 36, .08); } }
}

.pl-week-cell-sm {
  flex: 0 0 36px;
  min-width: 36px;
}

.pl-week-block {
  height: 100%;
  min-height: 30px;
  border-radius: var(--radius-xs);
  border: 1px solid transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: filter .1s;
  &:hover   { filter: brightness(1.1); }
  &.is-selected { box-shadow: 0 0 0 2px var(--live); }
}

.pl-week-block-badge {
  font-size: 9px;
  font-weight: 700;
  color: rgba(255,255,255,.9);
}

// ── Backlog ───────────────────────────────────────────────────────────
.pl-backlog-list {
  display: flex;
  flex-direction: column;
}

.pl-backlog-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 12px 18px;
  border-bottom: 1px solid var(--border);
  transition: background .1s;
  &:last-child { border-bottom: none; }
  &:hover { background: var(--surface-2); }
}

.pl-backlog-left { flex: 1; min-width: 0; }

.pl-backlog-id {
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  margin-bottom: 2px;
}

.pl-backlog-detail {
  font-size: 13px;
  font-weight: 500;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 4px;
}

.pl-backlog-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: var(--muted);

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

.pl-backlog-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.pl-backlog-status {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  padding: 2px 7px;
  border-radius: 10px;
}

.pl-backlog-priority {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 7px;
  border-radius: 10px;
}

// ── Calendar ──────────────────────────────────────────────────────────
.pl-cal-nav {
  width: 26px; height: 26px;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
  border-radius: var(--radius-xs);
  transition: background .12s, color .12s;
  &:hover { background: var(--surface-2); color: var(--ink); }
  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  }
}

.pl-cal-body { padding: 8px 12px 12px; }

.pl-cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  margin-bottom: 4px;

  div {
    text-align: center;
    font-size: 10px;
    font-weight: 600;
    color: var(--muted);
    letter-spacing: .3px;
  }
}

.pl-cal-days {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
}

.pl-cal-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
  border-radius: var(--radius-xs);
  cursor: pointer;
  min-height: 28px;
  transition: background .1s;

  &.is-empty { pointer-events: none; }
  &:hover:not(.is-empty) { background: var(--surface-2); }

  &.is-today .pl-cal-num {
    background: var(--live);
    color: #fff;
    border-radius: 50%;
    width: 20px; height: 20px;
    display: flex; align-items: center; justify-content: center;
  }

  &.is-selected:not(.is-today) {
    background: rgba(245, 165, 36, .15);
    .pl-cal-num { color: var(--live); font-weight: 700; }
  }
}

.pl-cal-num {
  font-size: 11px;
  color: var(--ink);
  line-height: 1;
}

.pl-cal-dots {
  display: flex;
  gap: 2px;
  margin-top: 2px;
}

.pl-cal-dot {
  width: 3px; height: 3px;
  border-radius: 50%;
  background: var(--live);
}

// ── Week stats ────────────────────────────────────────────────────────
.pl-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  background: var(--border);
}

.pl-stat {
  padding: 14px 12px;
  background: var(--surface);
  text-align: center;
}

.pl-stat-val {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
  line-height: 1;
  margin-bottom: 4px;
}

.pl-stat-label {
  font-size: 10px;
  color: var(--muted);
  font-weight: 500;
}

// ── Form ──────────────────────────────────────────────────────────────
.pl-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px;
}

.pl-type-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 2px;
}

.pl-type-tab {
  flex: 1;
  padding: 6px 6px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--muted);
  font-family: var(--ff);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  text-align: center;
  transition: border-color .12s, color .12s, background .12s;
  &.active { background: var(--surface-3); }
  &:hover:not(.active) { background: var(--surface-3); color: var(--ink); }
}

.field-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .4px;
  margin-top: 2px;
}

.field-input,
.field-textarea {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: var(--ff);
  font-size: 12px;
  padding: 7px 9px;
  outline: none;
  box-sizing: border-box;
  transition: border-color .12s;
  &:focus { border-color: var(--live); }
}

.field-textarea { resize: vertical; }

.pl-dur-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.pl-dur-col {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 8px 8px 6px;
  background: var(--surface-2);
  &:first-child { border-right: 1px solid var(--border-strong); }
  .field-label { margin-top: 0; }
}

.pl-dur-ctrl {
  display: flex;
  align-items: center;
  gap: 3px;
}

.pl-dur-btn {
  width: 30px; height: 30px;
  flex-shrink: 0;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--ink);
  font-size: 15px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  &:hover { background: var(--live); color: #fff; border-color: var(--live); }
}

.pl-dur-input {
  width: 34px !important;
  height: 30px;
  flex-shrink: 0;
  text-align: center;
  padding: 0 2px !important;
  font-size: 12px !important;
  box-sizing: border-box;
}

.pl-dur-sep {
  font-size: 11px;
  color: var(--muted);
  flex-shrink: 0;
  width: 8px;
  text-align: center;
}

.pl-dur-hint {
  font-size: 10px;
  color: var(--muted);
}

.pl-edit-note {
  font-size: 11px;
  color: var(--muted);
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  padding: 6px 9px;
  line-height: 1.4;
}

.pl-preview {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.pl-preview-title {
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .4px;
  color: var(--muted);
}

.pl-preview-chips { display: flex; flex-wrap: wrap; gap: 4px; }

.pl-preview-chip {
  display: inline-block;
  font-size: 10px;
  font-weight: 600;
  color: var(--live);
  background: var(--live-soft);
  border: 1px solid rgba(245, 165, 36, .25);
  padding: 2px 7px;
  border-radius: 20px;
}

.pl-cost-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.pl-save-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 9px 14px;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  margin-top: 4px;
  transition: filter .12s;
  &:hover  { filter: brightness(1.1); }
  &:active { filter: brightness(.9); }
  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round;
  }
}

.pl-btn-ghost-sm {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  font-family: var(--ff);
  font-size: 11px;
  color: var(--muted);
  cursor: pointer;
  &:hover { background: var(--surface-2); color: var(--ink); }
}

// ── Day orders ────────────────────────────────────────────────────────
.pl-order-list { display: flex; flex-direction: column; }

.pl-order-item {
  display: flex;
  align-items: stretch;
  gap: 10px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}

.pl-order-bar {
  width: 3px;
  border-radius: 2px;
  flex-shrink: 0;
}

.pl-order-body { flex: 1; min-width: 0; }

.pl-order-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-order-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 3px;
  font-size: 11px;
  color: var(--muted);
}

.pl-order-type-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
}

.pl-order-note {
  font-size: 11px;
  color: var(--muted);
  margin-top: 3px;
  font-style: italic;
}

.pl-maps-link {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-top: 4px;
  font-size: 11px;
  color: #4db6ac;
  text-decoration: none;
  font-weight: 500;
  &:hover { text-decoration: underline; }
  svg {
    width: 11px; height: 11px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
  }
}

.pl-time-chip {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 10px;
  font-weight: 600;
  color: var(--ok-ink);
  background: var(--ok-soft);
  padding: 1px 6px;
  border-radius: 10px;
}

.pl-day-badge {
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  padding: 1px 5px;
  border-radius: 10px;
  margin-left: 5px;
  vertical-align: middle;
}

.pl-move-form {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.pl-move-confirm {
  padding: 5px 10px;
  font-size: 11px;
  background: var(--live);
  color: #fff;
  border: none;
  border-radius: var(--radius-xs);
  cursor: pointer;
  font-weight: 600;
  font-family: var(--ff);
}

.pl-order-actions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}

.pl-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px; height: 28px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;
  &:hover { background: var(--surface-2); color: var(--ink); }
  &.active { background: var(--live-soft); color: var(--live); border-color: var(--live); }
  &.pl-icon-btn-danger:hover { background: var(--err-soft); color: var(--err); border-color: var(--err); }
  svg {
    width: 13px; height: 13px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}
</style>
