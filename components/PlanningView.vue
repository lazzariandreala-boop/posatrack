<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStore }    from '~/composables/useStore'
import { useAppState } from '~/composables/useAppState'
import { useExport }   from '~/composables/useExport'
import { ACT } from '~/constants'
import type { WorkOrder, ActivityType } from '~/types'

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

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const [, m, d] = dateStr.split('-').map(Number)
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${d} ${months[m - 1]}`
}

function fmtShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split('-').map(Number)
  const days   = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab']
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  const date   = new Date(parseInt(dateStr.split('-')[0]), m - 1, d)
  return `${days[date.getDay()]} ${d} ${months[m - 1]}`
}

// ── Avatar helpers ────────────────────────────────────────────────────
const AVATAR_COLORS = ['#4f46e5','#0891b2','#059669','#d97706','#7c3aed','#db2777','#0284c7','#16a34a']

function getInitials(name: string): string {
  return name.split(' ').map((n: string) => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

function nameColor(name: string): string {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % AVATAR_COLORS.length
  return AVATAR_COLORS[Math.abs(h)]
}

// ── Status derivation ─────────────────────────────────────────────────
type WoStato = 'in_corso' | 'in_viaggio' | 'assegnato' | 'pianificato' | 'da_verificare' | 'bloccato' | 'completato'

const STATO_DOT: Record<WoStato, string> = {
  in_corso:      '#f5a524',
  in_viaggio:    '#3b82f6',
  assegnato:     '#3b82f6',
  pianificato:   '#6b7280',
  da_verificare: '#f59e0b',
  bloccato:      '#ef4444',
  completato:    '#10b981',
}

function getWoStato(wo: WorkOrder): WoStato {
  const linked = store.all().filter(a =>
    a.workOrderId === wo.id ||
    (wo.orderNumber && a.orderNumber === wo.orderNumber && a.date === wo.date)
  )
  if (linked.some(a => !a.endTime))        return 'in_corso'
  if (wo.statoManuale === 'bloccato')      return 'bloccato'
  if (wo.statoManuale === 'da_verificare') return 'da_verificare'
  if (wo.statoManuale === 'in_viaggio')    return 'in_viaggio'
  if (wo.statoManuale === 'assegnato')     return 'assegnato'
  if (wo.statoManuale === 'completato')    return 'completato'
  return 'pianificato'
}

// ── Week navigation ───────────────────────────────────────────────────
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
  const [, m1, d1] = days[0].dateStr.split('-').map(Number)
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

// ── Operator grid ─────────────────────────────────────────────────────
const searchQuery = ref('')

const weekOperators = computed<string[]>(() => {
  const nameSet = new Set<string>()
  for (const wo of currentWeekOrders.value) {
    wo.squadra?.forEach(n => { if (n) nameSet.add(n) })
  }
  return Array.from(nameSet).sort()
})

interface OperatorRow {
  name: string
  isUnassigned: boolean
  byDay: Record<string, WorkOrder[]>
}

const operatorGrid = computed((): OperatorRow[] => {
  const rows: OperatorRow[] = weekOperators.value.map(name => {
    const byDay: Record<string, WorkOrder[]> = {}
    for (const day of currentWeekDays.value) {
      byDay[day.dateStr] = currentWeekOrders.value.filter(
        wo => wo.date === day.dateStr && (wo.squadra?.includes(name) ?? false)
      )
    }
    return { name, isUnassigned: false, byDay }
  })

  // Fallback row for work orders without any operator assigned
  const unassigned = currentWeekOrders.value.filter(wo => !wo.squadra || wo.squadra.length === 0)
  if (unassigned.length > 0) {
    const byDay: Record<string, WorkOrder[]> = {}
    for (const day of currentWeekDays.value) {
      byDay[day.dateStr] = unassigned.filter(wo => wo.date === day.dateStr)
    }
    rows.push({ name: 'Non assegnato', isUnassigned: true, byDay })
  }

  return rows
})

const filteredOperatorGrid = computed((): OperatorRow[] => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) return operatorGrid.value
  return operatorGrid.value.filter(row =>
    row.name.toLowerCase().includes(q) ||
    Object.values(row.byDay).some(wos =>
      wos.some(wo =>
        [wo.orderNumber, wo.detail, wo.luogo, wo.cliente, ...(wo.squadra ?? [])].some(
          v => v?.toLowerCase().includes(q)
        )
      )
    )
  )
})

// ── Navigate to detail ────────────────────────────────────────────────
function openDetail(woId: string): void {
  appState.selectedLavorazioneId.value = woId
  appState.navigate('lavorazione-detail')
}

function handleCellClick(day: { dateStr: string }): void {
  openForm(day.dateStr)
}

// ── Form modal ────────────────────────────────────────────────────────
const isFormOpen = ref(false)
const editingId  = ref<string | null>(null)
const formData   = ref({
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

function openForm(date?: string): void {
  formData.value = {
    orderNumber:          '',
    type:                 formData.value.type,
    detail:               '',
    note:                 '',
    mapsLink:             '',
    date:                 date ?? todayStr,
    estimatedDuration:    1,
    estimatedTimeH:       0,
    estimatedTimeM:       0,
    travelCostEstimate:   0,
    lunchCostEstimate:    0,
    materialCostEstimate: 0,
    externalTeamCost:     0,
    budget:               0,
  }
  editingId.value  = null
  isFormOpen.value = true
}

function closeForm(): void {
  isFormOpen.value = false
  editingId.value  = null
}

function openEditForm(wo: WorkOrder): void {
  const et = wo.estimatedTime ?? 0
  editingId.value = wo.id
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
  isFormOpen.value = true
}

function saveForm(): void {
  const t = formData.value.type
  if (t === 'posa') {
    if (!formData.value.orderNumber.trim()) { appState.showToast('Inserire il numero ordine'); return }
    if (!formData.value.detail.trim())      { appState.showToast("Selezionare l'attrezzatura"); return }
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
  }

  closeForm()
}

// ── Move / delete ─────────────────────────────────────────────────────
const movingOrderId  = ref<string | null>(null)
const moveTargetDate = ref('')

function startMove(wo: WorkOrder): void {
  movingOrderId.value  = wo.id
  moveTargetDate.value = wo.date
}
function confirmMove(): void {
  if (!movingOrderId.value || !moveTargetDate.value) return
  store.updateWorkOrder(movingOrderId.value, { date: moveTargetDate.value })
  movingOrderId.value = null
  appState.showToast('Lavorazione spostata')
}
function cancelMove(): void { movingOrderId.value = null }

function deleteOrder(wo: WorkOrder): void {
  if (wo.groupId) {
    const groupCount = store.getAllWorkOrders().filter(o => o.groupId === wo.groupId).length
    if (groupCount > 1) {
      const deleteAll = confirm(
        `Questa è la giornata ${wo.dayIndex ?? '?'} di ${wo.totalDays ?? groupCount} di una lavorazione multi-giorno.\n\nPremi OK per eliminare TUTTA la pianificazione (${groupCount} giorni)\nPremi Annulla per eliminare solo questo giorno`
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

// ── Backlog ───────────────────────────────────────────────────────────
const backlogOrders = computed(() => {
  const weekDates = new Set(currentWeekDays.value.map(d => d.dateStr))
  return store.getAllWorkOrders()
    .filter(wo => !weekDates.has(wo.date) && wo.date >= todayStr)
    .sort((a, b) => a.date.localeCompare(b.date))
})

// ── Multi-day preview ─────────────────────────────────────────────────
const durationPreviewDates = computed(() => {
  if (!formData.value.date || formData.value.estimatedDuration <= 1) return []
  return getWorkingDays(formData.value.date, formData.value.estimatedDuration)
})

// ── Export ────────────────────────────────────────────────────────────
function exportCurrentMonth(): void {
  const d = currentWeekStart.value
  const y = d.getFullYear()
  const m = d.getMonth()
  const start  = `${y}-${String(m + 1).padStart(2, '0')}-01`
  const endDay = new Date(y, m + 1, 0)
  exporter.exportPlanning(start, toDateStr(endDay))
}

const workspaceName = computed(() => appState.activeWorkspaceName.value || 'Workspace')
</script>

<template>
  <div class="view" id="view-planning">

    <!-- ── Top bar ──────────────────────────────────────────────────── -->
    <div class="pl-top">
      <div class="pl-heading">
        <div class="pl-ws-label">{{ workspaceName }}</div>
        <h1 class="pl-title">Pianificazione</h1>
        <div class="pl-week-sub">Settimana {{ weekNumber }} · {{ weekRange }}</div>
      </div>

      <div class="pl-search-wrap">
        <svg class="pl-search-icon" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input v-model="searchQuery" type="text" class="pl-search" placeholder="Cerca lavorazioni, clienti, operatori..." />
        <kbd class="pl-search-kbd">⌘K</kbd>
      </div>

      <div class="pl-actions">
        <div class="pl-week-nav">
          <button @click="weekOffset--">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="pl-oggi-nav-btn" @click="weekOffset = 0">Oggi</button>
          <button @click="weekOffset++">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
        <button class="pl-btn-primary" @click="openForm()">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Pianifica
        </button>
        <button class="pl-bell-btn" title="Notifiche">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
        </button>
      </div>
    </div>

    <!-- ── Scrollable content ──────────────────────────────────────── -->
    <div class="pl-content">

      <!-- Operator weekly grid ─────────────────────────────────────── -->
      <div class="pl-og-wrap">

        <!-- Header row -->
        <div class="pl-og-header">
          <div class="pl-og-op-col-hdr">OPERATORE</div>
          <div
            v-for="day in currentWeekDays"
            :key="day.dateStr"
            class="pl-og-day-col-hdr"
            :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
          >
            <span class="pl-og-day-name">{{ day.name.toUpperCase() }} {{ day.num }}</span>
            <span v-if="day.isToday" class="pl-oggi-pill">OGGI</span>
          </div>
        </div>

        <!-- Empty state -->
        <div v-if="!currentWeekOrders.length" class="pl-empty">
          <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          Nessuna lavorazione questa settimana
        </div>

        <!-- Operator rows -->
        <div
          v-for="row in filteredOperatorGrid"
          :key="row.name"
          class="pl-og-row"
        >
          <!-- Operator info cell -->
          <div class="pl-og-op-cell">
            <div
              class="pl-op-avatar"
              :style="row.isUnassigned
                ? { background: 'var(--surface-3)', color: 'var(--muted)', fontSize: '12px' }
                : { background: nameColor(row.name) }"
            >
              {{ row.isUnassigned ? '?' : getInitials(row.name) }}
            </div>
            <div class="pl-op-info">
              <div class="pl-op-name">{{ row.name }}</div>
              <div class="pl-op-role">{{ row.isUnassigned ? 'Da assegnare' : 'Posatore' }}</div>
            </div>
          </div>

          <!-- Day cells -->
          <div
            v-for="day in currentWeekDays"
            :key="day.dateStr"
            class="pl-og-day-cell"
            :class="{ 'is-today': day.isToday, 'is-weekend': day.isWeekend }"
            @click="handleCellClick(day)"
          >
            <div
              v-for="wo in row.byDay[day.dateStr]"
              :key="wo.id"
              class="pl-pill"
              :class="{
                'pl-pill-live':   getWoStato(wo) === 'in_corso',
                'pl-pill-travel': getWoStato(wo) === 'in_viaggio' || getWoStato(wo) === 'assegnato',
              }"
              @click.stop="openDetail(wo.id)"
            >
              <span class="pl-pill-dot" :style="{ background: STATO_DOT[getWoStato(wo)] }" />
              <span class="pl-pill-text">{{ wo.orderNumber || wo.detail.slice(0, 12) }}<span v-if="wo.luogo" class="pl-pill-loc"> {{ wo.luogo }}</span></span>
            </div>
          </div>
        </div>

      </div><!-- /pl-og-wrap -->

      <!-- ── Bottom: backlog + stats ─────────────────────────────── -->
      <div class="pl-bottom-row">

        <!-- Backlog -->
        <div class="pl-backlog-section">
          <div class="pl-section-head">
            <span class="pl-section-title">Backlog · da assegnare</span>
            <span class="pl-count-badge">{{ backlogOrders.length }}</span>
          </div>
          <div v-if="!backlogOrders.length" class="pl-empty">
            <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
            Nessun ordine in backlog
          </div>
          <div v-else class="pl-backlog-list">
            <div
              v-for="wo in backlogOrders"
              :key="wo.id"
              class="pl-backlog-item"
              @click="openDetail(wo.id)"
            >
              <div class="pl-backlog-left">
                <div class="pl-backlog-id">{{ wo.orderNumber || '—' }}</div>
                <div class="pl-backlog-detail">
                  {{ wo.detail }}<template v-if="wo.cliente"> — {{ wo.cliente }}</template>
                </div>
                <div class="pl-backlog-meta">
                  <span v-if="wo.luogo">
                    <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    {{ wo.luogo }} ·
                  </span>
                  <span>
                    <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                    {{ fmtDate(wo.date) }}
                  </span>
                  <span v-if="wo.squadra?.length" class="pl-backlog-avatars">
                    <span
                      v-for="name in wo.squadra.slice(0, 3)"
                      :key="name"
                      class="pl-backlog-avatar"
                      :style="{ background: nameColor(name) }"
                      :title="name"
                    >{{ getInitials(name) }}</span>
                  </span>
                </div>
              </div>
              <div class="pl-backlog-right">
                <span class="pl-backlog-status">Pianificato</span>
                <span
                  class="pl-backlog-priority"
                  :style="{ background: `${ACT[wo.type]?.color}22`, color: ACT[wo.type]?.color }"
                >{{ ACT[wo.type]?.label }}</span>
                <div class="pl-backlog-actions" @click.stop>
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
        </div>

        <!-- Week stats -->
        <div class="pl-stats-section">
          <div class="pl-section-head">
            <span class="pl-section-title">Settimana {{ weekNumber }}</span>
          </div>
          <div class="pl-stat-rows">
            <div class="pl-stat-row">
              <span class="pl-stat-lbl">Lavorazioni pianificate</span>
              <span class="pl-stat-val">{{ weekStats.count }}</span>
            </div>
            <div class="pl-stat-row">
              <span class="pl-stat-lbl">Ore pianificate</span>
              <span class="pl-stat-val">{{ weekStats.hours }}</span>
            </div>
            <div class="pl-stat-row">
              <span class="pl-stat-lbl">Operatori coinvolti</span>
              <span class="pl-stat-val">{{ weekOperators.length }}</span>
            </div>
            <div class="pl-stat-row">
              <span class="pl-stat-lbl">Trasferte previste</span>
              <span class="pl-stat-val">{{ weekStats.travel }}</span>
            </div>
          </div>
          <div class="pl-stats-footer">
            <button class="pl-export-btn" @click="exportCurrentMonth()">
              <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
              Esporta planning Excel
            </button>
          </div>
        </div>

      </div><!-- /pl-bottom-row -->

    </div><!-- /pl-content -->

    <!-- ── Form slide-over modal ─────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="isFormOpen" class="pl-modal-overlay" @click.self="closeForm()">
        <div class="pl-modal">

          <div class="pl-modal-head">
            <span class="pl-modal-title">{{ editingId ? 'Modifica lavorazione' : 'Nuova lavorazione' }}</span>
            <button class="pl-modal-close" @click="closeForm()">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <div class="pl-form">

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

            <template v-if="formData.type === 'posa'">
              <label class="field-label">N° ORDINE *</label>
              <input v-model="formData.orderNumber" class="field-input" type="text" placeholder="es. ORD-2025-001" />
              <label class="field-label">ATTREZZATURA *</label>
              <CatalogSelect v-model="formData.detail" value-field="label" />
              <label class="field-label">LINK MAPS CANTIERE</label>
              <input v-model="formData.mapsLink" class="field-input" type="url" placeholder="https://maps.google.com/..." />
            </template>

            <template v-if="formData.type === 'trasferimento'">
              <label class="field-label">DESTINAZIONE</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Es. Parco Comunale..." />
              <label class="field-label">VIAGGIO € (PREV.)</label>
              <input v-model.number="formData.travelCostEstimate" class="field-input" type="number" min="0" step="0.01" placeholder="0" />
            </template>

            <template v-if="formData.type === 'altro'">
              <label class="field-label">DESCRIZIONE *</label>
              <input v-model="formData.detail" class="field-input" type="text" placeholder="Descrizione del lavoro..." />
            </template>

            <label class="field-label">DATA *</label>
            <input v-model="formData.date" class="field-input" type="date" />

            <div v-if="!editingId" class="pl-dur-row">
              <div class="pl-dur-col">
                <label class="field-label">DURATA</label>
                <div class="pl-dur-ctrl">
                  <button type="button" class="pl-dur-btn" @click="formData.estimatedDuration = Math.max(1, formData.estimatedDuration - 1)">−</button>
                  <input v-model.number="formData.estimatedDuration" class="field-input pl-dur-input" type="number" min="1" max="30" />
                  <button type="button" class="pl-dur-btn" @click="formData.estimatedDuration = Math.min(30, formData.estimatedDuration + 1)">+</button>
                </div>
                <span class="pl-dur-hint">{{ formData.estimatedDuration === 1 ? 'giorno lav.' : 'giorni (Lun–Ven)' }}</span>
              </div>
              <div class="pl-dur-col">
                <label class="field-label">STIMA TEMPO</label>
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
              <label class="field-label">STIMA TEMPO</label>
              <div class="pl-dur-ctrl">
                <input v-model.number="formData.estimatedTimeH" class="field-input pl-dur-input" type="number" min="0" max="23" placeholder="0" />
                <span class="pl-dur-sep">h</span>
                <input v-model.number="formData.estimatedTimeM" class="field-input pl-dur-input" type="number" min="0" max="59" step="15" placeholder="0" />
                <span class="pl-dur-sep">m</span>
              </div>
            </template>

            <div v-if="!editingId && formData.estimatedDuration > 1 && durationPreviewDates.length" class="pl-preview">
              <div class="pl-preview-title">Giornate che verranno create:</div>
              <div class="pl-preview-chips">
                <span v-for="(d, i) in durationPreviewDates" :key="d" class="pl-preview-chip">{{ i + 1 }}. {{ fmtShortDate(d) }}</span>
              </div>
            </div>

            <template v-if="formData.type === 'posa' || formData.type === 'altro'">
              <label class="field-label" style="margin-top:4px">COSTI PREVISIONE</label>
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

            <!-- Move form (visible when editing from backlog) -->
            <template v-if="editingId && movingOrderId === editingId">
              <label class="field-label">SPOSTA A DATA</label>
              <div class="pl-move-form">
                <input v-model="moveTargetDate" class="field-input" type="date" />
                <button class="pl-move-confirm" @click="confirmMove">Sposta</button>
                <button class="pl-btn-ghost-sm" @click="cancelMove">✕</button>
              </div>
            </template>

            <label class="field-label">NOTE</label>
            <textarea v-model="formData.note" class="field-input field-textarea" rows="2" placeholder="Note aggiuntive..." />

            <button class="pl-save-btn" @click="saveForm">
              <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
              {{ editingId ? 'Salva modifiche' : 'Pianifica' }}
            </button>

            <button v-if="editingId" class="pl-btn-ghost-sm pl-cancel-edit" @click="closeForm">Annulla</button>

          </div><!-- /pl-form -->

        </div><!-- /pl-modal -->
      </div>
    </Teleport>

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

// ── Top bar ───────────────────────────────────────────────────────────
.pl-top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 14px 24px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.pl-heading {
  flex-shrink: 0;
}

.pl-ws-label {
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  margin-bottom: 2px;
}

.pl-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  margin: 0 0 2px;
  line-height: 1.2;
}

.pl-week-sub {
  font-size: 11px;
  color: var(--muted);
}

// ── Search ────────────────────────────────────────────────────────────
.pl-search-wrap {
  flex: 1;
  max-width: 420px;
  position: relative;
  display: flex;
  align-items: center;
}

.pl-search-icon {
  position: absolute;
  left: 10px;
  width: 14px; height: 14px;
  stroke: var(--muted); fill: none;
  stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  pointer-events: none;
}

.pl-search {
  width: 100%;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--ink);
  font-family: var(--ff);
  font-size: 12px;
  padding: 7px 36px 7px 32px;
  outline: none;
  transition: border-color .12s;
  &:focus { border-color: var(--primary); }
  &::placeholder { color: var(--muted); }
}

.pl-search-kbd {
  position: absolute;
  right: 8px;
  font-size: 10px;
  font-family: var(--ff-mono);
  color: var(--muted);
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  padding: 1px 5px;
  pointer-events: none;
}

// ── Top actions ───────────────────────────────────────────────────────
.pl-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  margin-left: auto;
}

.pl-week-nav {
  display: flex;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;

  button {
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    cursor: pointer;
    color: var(--muted);
    font-family: var(--ff);
    font-size: 12px;
    font-weight: 500;
    transition: background .12s, color .12s;
    padding: 0 10px;

    &:hover { background: var(--surface-2); color: var(--ink); }
    &:not(:last-child) { border-right: 1px solid var(--border); }

    svg {
      width: 14px; height: 14px;
      stroke: currentColor; fill: none;
      stroke-width: 2; stroke-linecap: round; stroke-linejoin: round;
    }
  }
}

.pl-oggi-nav-btn {
  padding: 0 14px !important;
  font-weight: 600 !important;
}

.pl-btn-primary {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0 16px;
  height: 34px;
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

.pl-bell-btn {
  width: 34px; height: 34px;
  display: flex; align-items: center; justify-content: center;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--muted);
  cursor: pointer;
  transition: color .12s, background .12s;
  &:hover { color: var(--ink); background: var(--surface-2); }
  svg {
    width: 16px; height: 16px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

// ── Content area ──────────────────────────────────────────────────────
.pl-content {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

// ── Operator weekly grid ──────────────────────────────────────────────
.pl-og-wrap {
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
  overflow-x: auto;
}

$op-col: 188px;

.pl-og-header,
.pl-og-row {
  display: grid;
  grid-template-columns: $op-col repeat(7, 1fr);
  min-width: 860px;
}

.pl-og-header {
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 2;
}

.pl-og-op-col-hdr {
  padding: 8px 14px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: var(--muted);
  border-right: 1px solid var(--border);
}

.pl-og-day-col-hdr {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 10px;
  border-right: 1px solid var(--border);
  &:last-child { border-right: none; }

  &.is-today   { background: rgba(245, 165, 36, .1); }
  &.is-weekend { background: rgba(255,255,255,.02); }
}

.pl-og-day-name {
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);

  .is-today & { color: var(--live); }
}

.pl-oggi-pill {
  display: inline-block;
  background: var(--live);
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .5px;
  padding: 1px 5px;
  border-radius: 10px;
  line-height: 1.5;
}

.pl-og-row {
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
  &:hover { background: rgba(255,255,255,.01); }
}

.pl-og-op-cell {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-right: 1px solid var(--border);
}

.pl-op-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.pl-op-info { min-width: 0; }

.pl-op-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pl-op-role {
  font-size: 10px;
  color: var(--muted);
}

.pl-og-day-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 8px;
  border-right: 1px solid var(--border);
  min-height: 56px;
  cursor: pointer;
  transition: background .1s;

  &:last-child  { border-right: none; }
  &.is-today    { background: rgba(245, 165, 36, .05); }
  &.is-weekend  { background: rgba(255,255,255,.015); }
  &:hover       { background: rgba(255,255,255,.03); }
  &.is-today:hover { background: rgba(245, 165, 36, .1); }
}

// ── Job pills ─────────────────────────────────────────────────────────
.pl-pill {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 4px 7px;
  border-radius: 5px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  font-size: 11px;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  transition: background .1s, border-color .1s;
  max-width: 100%;

  &:hover { background: var(--surface-3); border-color: var(--primary); }

  &.pl-pill-live {
    background: rgba(245, 165, 36, .12);
    border-color: rgba(245, 165, 36, .35);
  }
  &.pl-pill-travel {
    background: rgba(59, 130, 246, .1);
    border-color: rgba(59, 130, 246, .3);
  }
}

.pl-pill-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
}

.pl-pill-text {
  color: var(--ink);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pl-pill-loc {
  color: var(--muted);
  font-weight: 400;
}

// ── Empty state ───────────────────────────────────────────────────────
.pl-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 20px;
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

// ── Bottom row ────────────────────────────────────────────────────────
.pl-bottom-row {
  display: grid;
  grid-template-columns: 3fr 1fr;
  flex: 1;
  min-height: 0;
  border-top: 1px solid var(--border);
}

.pl-backlog-section {
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.pl-stats-section {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ── Section head ──────────────────────────────────────────────────────
.pl-section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.pl-section-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  flex: 1;
}

.pl-count-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: var(--muted);
}

// ── Backlog list ──────────────────────────────────────────────────────
.pl-backlog-list {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.pl-backlog-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 11px 18px;
  border-bottom: 1px solid var(--border);
  cursor: pointer;
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
  flex-wrap: wrap;
  gap: 6px;
  font-size: 11px;
  color: var(--muted);

  span {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  svg {
    width: 11px; height: 11px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.pl-backlog-avatars {
  display: inline-flex;
  gap: -4px;

  & > span + span { margin-left: -6px; }
}

.pl-backlog-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px; height: 18px;
  border-radius: 50%;
  font-size: 8px;
  font-weight: 700;
  color: #fff;
  border: 1px solid var(--surface);
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

.pl-backlog-actions {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}

// ── Stats section ─────────────────────────────────────────────────────
.pl-stat-rows {
  padding: 4px 0;
  flex: 1;
}

.pl-stat-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 18px;
  border-bottom: 1px solid var(--border);
  &:last-child { border-bottom: none; }
}

.pl-stat-lbl {
  font-size: 12px;
  color: var(--muted);
}

.pl-stat-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
  font-variant-numeric: tabular-nums;
}

.pl-stats-footer {
  padding: 12px 16px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}

.pl-export-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  width: 100%;
  padding: 8px 12px;
  background: var(--surface-2);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;
  &:hover { background: var(--surface-3); color: var(--ink); }
  svg {
    width: 13px; height: 13px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

// ── Icon buttons ──────────────────────────────────────────────────────
.pl-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px; height: 26px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background: transparent;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;
  &:hover { background: var(--surface-2); color: var(--ink); }
  &.pl-icon-btn-danger:hover { background: var(--err-soft); color: var(--err); border-color: var(--err); }
  svg {
    width: 12px; height: 12px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

// ── Modal ─────────────────────────────────────────────────────────────
.pl-modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .45);
  z-index: 200;
  display: flex;
  align-items: stretch;
  justify-content: flex-end;
}

.pl-modal {
  width: 380px;
  max-width: 100vw;
  background: var(--surface);
  border-left: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  animation: slide-from-right .2s ease-out;
}

@keyframes slide-from-right {
  from { transform: translateX(40px); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}

.pl-modal-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 18px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}

.pl-modal-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--ink);
}

.pl-modal-close {
  width: 28px; height: 28px;
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
    stroke-width: 2; stroke-linecap: round;
  }
}

// ── Form (inside modal) ───────────────────────────────────────────────
.pl-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 16px;
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
  justify-content: center;
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

.pl-cancel-edit {
  width: 100%;
  margin-top: -4px;
}

.pl-move-form {
  display: flex;
  align-items: center;
  gap: 5px;
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

@media (min-width: 800px) {
  .pl-ws-label       { font-size: 13px; }
  .pl-title          { font-size: 22px; }
  .pl-week-sub       { font-size: 13px; }
  .pl-search         { font-size: 14px; }
  .pl-week-nav button { font-size: 14px; }
  .pl-btn-primary    { font-size: 15px; }
  .pl-og-day-name    { font-size: 13px; }
  .pl-op-name        { font-size: 14px; }
  .pl-pill           { font-size: 13px; }
  .pl-empty          { font-size: 14px; }
  .pl-section-title  { font-size: 14px; }
  .pl-count-badge    { font-size: 13px; }
  .pl-backlog-id     { font-size: 13px; }
  .pl-backlog-detail { font-size: 15px; }
  .pl-backlog-meta   { font-size: 13px; }
  .pl-stat-lbl       { font-size: 14px; }
  .pl-stat-val       { font-size: 16px; }
  .pl-export-btn     { font-size: 14px; }
  .pl-modal-title    { font-size: 16px; }
  .pl-type-tab       { font-size: 13px; }
  .field-input,
  .field-textarea    { font-size: 14px; }
  .pl-dur-sep        { font-size: 13px; }
  .pl-edit-note      { font-size: 13px; }
  .pl-btn-ghost-sm   { font-size: 13px; }
  .pl-save-btn       { font-size: 15px; }
  .pl-move-confirm   { font-size: 13px; }
}
</style>
