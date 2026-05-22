<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useAppState } from '~/composables/useAppState'
import { useStore }    from '~/composables/useStore'
import { useAuth }     from '~/composables/useAuth'
import { useGeo }      from '~/composables/useGeo'
import { ACT }         from '~/constants'
import type { WorkOrder, Activity } from '~/types'

const appState = useAppState()
const store    = useStore()
const auth     = useAuth()
const geo      = useGeo()

// ────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────────────────────

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function fmtDur(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (seconds >= 60) return `${Math.floor(seconds / 60)}m`
  return `${seconds}s`
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ────────────────────────────────────────────────────────────────────────────
// MOBILE: lista lavorazioni raggruppate per data
// ────────────────────────────────────────────────────────────────────────────

type MobileWoFilter = 'all' | 'today' | 'in_corso' | 'completate'
const mobileFilter = ref<MobileWoFilter>('all')
const todayDateStr = todayStr()

function getWoTotalTime(wo: WorkOrder): number {
  return getLinkedActivities(wo)
    .filter(a => !(a.isPlanned && a.duration === 0))
    .reduce((s, a) => s + (a.duration ?? 0), 0)
}

function getWoStatoBadge(stato: WoStato): string {
  if (stato === 'in_corso' || stato === 'in_viaggio') return 'badge-ok'
  if (stato === 'completato') return 'badge-ok'
  return 'badge-muted'
}

// Ordina: oggi prima, poi futuri (crescente), poi passati (decrescente)
function woSortKey(dateStr: string): number {
  if (dateStr === todayDateStr) return 0
  if (dateStr > todayDateStr)   return 1
  return 2
}

const allWorkOrdersMobile = computed<WorkOrder[]>(() =>
  store.getAllWorkOrders().slice().sort((a, b) => {
    const ka = woSortKey(a.date)
    const kb = woSortKey(b.date)
    if (ka !== kb) return ka - kb
    // Entrambi futuri: ordine crescente. Entrambi passati: decrescente.
    return ka === 2
      ? b.date.localeCompare(a.date)
      : a.date.localeCompare(b.date)
  })
)

const filteredWorkOrdersMobile = computed<WorkOrder[]>(() => {
  void _liveActivity.value  // forza tracciamento anche nel caso 'all'
  const all = allWorkOrdersMobile.value
  switch (mobileFilter.value) {
    case 'today':      return all.filter(wo => wo.date === todayDateStr)
    case 'in_corso':   return all.filter(wo => getWoStato(wo) === 'in_corso')
    case 'completate': return all.filter(wo => getWoStato(wo) === 'completato')
    default:           return all
  }
})

interface WoDayGroup {
  label:   string
  dateStr: string
  items:   WorkOrder[]
}

const groupedWoByDay = computed((): WoDayGroup[] => {
  const map = new Map<string, WoDayGroup>()
  filteredWorkOrdersMobile.value.forEach(wo => {
    if (!map.has(wo.date)) {
      const d = new Date(wo.date + 'T12:00:00')
      const labels: Record<string, string> = { [todayDateStr]: 'OGGI' }
      const tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1)
      labels[tmrw.toISOString().split('T')[0]] = 'DOMANI'
      const dayNames = ['DOM','LUN','MAR','MER','GIO','VEN','SAB']
      const months   = ['GEN','FEB','MAR','APR','MAG','GIU','LUG','AGO','SET','OTT','NOV','DIC']
      const label = labels[wo.date] ?? `${dayNames[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`
      map.set(wo.date, { label, dateStr: wo.date, items: [] })
    }
    map.get(wo.date)!.items.push(wo)
  })
  return Array.from(map.values())
})

const mobileFilterCounts = computed(() => {
  const all = allWorkOrdersMobile.value
  return {
    all:        all.length,
    today:      all.filter(wo => wo.date === todayDateStr).length,
    in_corso:   all.filter(wo => getWoStato(wo) === 'in_corso').length,
    completate: all.filter(wo => getWoStato(wo) === 'completato').length,
  }
})

// Computed che avvolge currentActivity — Vue traccia questa dipendenza
// in qualsiasi contesto reattivo (template, computed, filter)
const _liveActivity = computed<Activity | null>(() => {
  const cur = appState.currentActivity.value
  return (cur && !cur.endTime) ? cur : null
})

// Live clock — si aggiorna ogni secondo per il tempo elapsed live
const now = ref(Date.now())
let _nowInterval: ReturnType<typeof setInterval> | null = null
onMounted(() => { _nowInterval = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (_nowInterval) { clearInterval(_nowInterval); _nowInterval = null } })

function _isLinkedToWo(act: Activity, wo: WorkOrder): boolean {
  return act.workOrderId === wo.id ||
    !!(wo.orderNumber && act.orderNumber === wo.orderNumber && act.date === wo.date)
}

function getWoLiveActivity(wo: WorkOrder): Activity | null {
  // Prima controlla il computed reattivo (stessa fonte della scheda Oggi)
  const cur = _liveActivity.value
  if (cur && _isLinkedToWo(cur, wo)) return cur
  // Fallback: store (utile dopo reload quando currentActivity è null)
  return getLinkedActivities(wo).find(
    a => !a.endTime && !(a.isPlanned && a.duration === 0)
  ) ?? null
}

function getWoLiveElapsed(wo: WorkOrder): string {
  const live = getWoLiveActivity(wo)
  if (!live) return ''
  const secs = Math.floor((now.value - live.startTime) / 1000)
  return fmtDur(Math.max(0, secs))
}

// ────────────────────────────────────────────────────────────────────────────
// DESKTOP: tabella Lavorazioni (WorkOrders)
// ────────────────────────────────────────────────────────────────────────────

type WoStato = 'in_corso' | 'in_viaggio' | 'assegnato' | 'pianificato' | 'da_verificare' | 'bloccato' | 'completato'
type TabKey  = 'tutte' | 'mie' | 'in_corso' | 'pianificate' | 'bloccate' | 'da_verificare'

const searchQuery = ref('')
const activeTab   = ref<TabKey>('tutte')

const workspaceName  = computed(() => appState.activeWorkspaceName.value || 'Workspace')
const allWorkOrders  = computed<WorkOrder[]>(() =>
  store.getAllWorkOrders().slice().sort((a, b) => a.date.localeCompare(b.date))
)

function getLinkedActivities(wo: WorkOrder): Activity[] {
  return store.all().filter(a =>
    a.workOrderId === wo.id ||
    (wo.orderNumber && a.orderNumber === wo.orderNumber && a.date === wo.date)
  )
}

function getWoStato(wo: WorkOrder): WoStato {
  // Usa il computed reattivo — garantisce ri-render quando la sessione cambia
  const liveAct = getWoLiveActivity(wo)
  if (liveAct) return liveAct.type === 'trasferimento' ? 'in_viaggio' : 'in_corso'
  if (wo.statoManuale === 'completato')    return 'completato'
  if (wo.statoManuale === 'bloccato')      return 'bloccato'
  if (wo.statoManuale === 'da_verificare') return 'da_verificare'
  if (wo.statoManuale === 'in_viaggio')    return 'in_viaggio'
  if (wo.statoManuale === 'assegnato')     return 'assegnato'
  return 'assegnato'
}

function getWoWorkedSecs(wo: WorkOrder): number {
  return getLinkedActivities(wo)
    .filter(a => !(a.isPlanned && a.duration === 0))
    .reduce((s, a) => s + (a.duration ?? 0), 0)
}

function avBarWidth(workedSecs: number, plannedMins: number): number {
  return Math.min(115, (workedSecs / (plannedMins * 60)) * 100)
}

function avBarClass(workedSecs: number, plannedMins: number): string {
  const pct = (workedSecs / (plannedMins * 60)) * 100
  if (pct > 110) return 'lav-progress-fill-err'
  if (pct > 90)  return 'lav-progress-fill-warn'
  return 'lav-progress-fill-ok'
}

function avRemainStr(workedSecs: number, plannedMins: number): string {
  const diff = plannedMins * 60 - workedSecs
  if (diff < 0) return `+${fmtDur(-diff)} sforato`
  if (diff === 0) return 'Completato'
  return `-${fmtDur(diff)} rimanenti`
}

function avRemainIsOver(workedSecs: number, plannedMins: number): boolean {
  return workedSecs > plannedMins * 60
}

interface TableRow { wo: WorkOrder; stato: WoStato; workedSecs: number }

const tableRows = computed((): TableRow[] => {
  const all = allWorkOrders.value.map(wo => ({
    wo,
    stato:      getWoStato(wo),
    workedSecs: getWoWorkedSecs(wo),
  }))

  let filtered = all
  switch (activeTab.value) {
    case 'in_corso':      filtered = all.filter(r => r.stato === 'in_corso'); break
    case 'pianificate':   filtered = all.filter(r => r.stato === 'pianificato' || r.stato === 'assegnato'); break
    case 'bloccate':      filtered = all.filter(r => r.stato === 'bloccato'); break
    case 'da_verificare': filtered = all.filter(r => r.stato === 'da_verificare'); break
    case 'mie':           break
  }

  const q = searchQuery.value.trim().toLowerCase()
  if (q) {
    filtered = filtered.filter(r =>
      r.wo.detail?.toLowerCase().includes(q)       ||
      r.wo.orderNumber?.toLowerCase().includes(q)  ||
      (r.wo.cliente ?? '').toLowerCase().includes(q) ||
      (r.wo.luogo   ?? '').toLowerCase().includes(q)
    )
  }

  return filtered
})

const tabCounts = computed(() => {
  const stati = allWorkOrders.value.map(wo => getWoStato(wo))
  return {
    tutte:         allWorkOrders.value.length,
    mie:           allWorkOrders.value.length,
    in_corso:      stati.filter(s => s === 'in_corso').length,
    pianificate:   stati.filter(s => s === 'pianificato' || s === 'assegnato').length,
    bloccate:      stati.filter(s => s === 'bloccato').length,
    da_verificare: stati.filter(s => s === 'da_verificare').length,
  }
})

const subtitleCounts = computed(() => {
  const stati = allWorkOrders.value.map(wo => getWoStato(wo))
  return {
    total:    allWorkOrders.value.length,
    inCorso:  stati.filter(s => s === 'in_corso').length,
    bloccate: stati.filter(s => s === 'bloccato').length,
  }
})

interface ScadenzaFmt { text: string; isOverdue: boolean; isToday: boolean }

function fmtScadenza(dateStr: string): ScadenzaFmt {
  const today = todayStr()
  if (dateStr === today) return { text: 'Oggi', isOverdue: false, isToday: true }
  const yest = (() => { const d = new Date(); d.setDate(d.getDate() - 1); return d.toISOString().split('T')[0] })()
  const months = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic']
  const [, m, d] = dateStr.split('-').map(Number)
  const label = `${d} ${months[m - 1]}`
  if (dateStr === yest) return { text: 'Ieri', isOverdue: true, isToday: false }
  if (dateStr < today)  return { text: label,  isOverdue: true, isToday: false }
  return { text: label, isOverdue: false, isToday: false }
}

function getInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

const STATO_META: Record<WoStato, { label: string; cls: string }> = {
  in_corso:      { label: 'In corso',      cls: 'stato-in-corso'      },
  in_viaggio:    { label: 'In viaggio',    cls: 'stato-in-viaggio'    },
  assegnato:     { label: 'Assegnato',     cls: 'stato-assegnato'     },
  pianificato:   { label: 'Pianificato',   cls: 'stato-pianificato'   },
  da_verificare: { label: 'Da verificare', cls: 'stato-da-verificare' },
  bloccato:      { label: 'Bloccato',      cls: 'stato-bloccato'      },
  completato:    { label: 'Completato',    cls: 'stato-completato'    },
}

const PRIORITA_META = {
  urgente: { label: 'Urgente', color: 'var(--err)' },
  alta:    { label: 'Alta',    color: 'var(--live)' },
  media:   { label: 'Media',   color: 'var(--muted-2)' },
  bassa:   { label: 'Bassa',   color: 'var(--muted)' },
}

// Row context menu
const menuRowId = ref<string | null>(null)

function toggleRowMenu(woId: string, e: Event): void {
  e.stopPropagation()
  menuRowId.value = menuRowId.value === woId ? null : woId
}

function closeMenu(): void { menuRowId.value = null }

function openDetail(woId: string): void {
  appState.selectedLavorazioneId.value = woId
  appState.navigate('lavorazione-detail')
}

function deleteOrder(wo: WorkOrder): void {
  closeMenu()
  if (!confirm(`Eliminare la lavorazione "${wo.detail}"?`)) return
  if (wo.groupId) {
    const grpCount = store.getAllWorkOrders().filter(o => o.groupId === wo.groupId).length
    if (grpCount > 1 && confirm(`Questa è parte di una lavorazione multi-giorno. Eliminare tutti i ${grpCount} giorni?`)) {
      store.removeWorkOrderGroup(wo.groupId)
      return
    }
  }
  store.removeWorkOrder(wo.id)
  appState.showToast('Lavorazione eliminata')
}

// Avatar colors (stable per initial)
const AVATAR_COLORS = ['#2D5BFF','#FF5F00','#1F9D55','#8B5CF6','#DC2626','#F5B800']
function avatarColor(name: string): string {
  const idx = name.charCodeAt(0) % AVATAR_COLORS.length
  return AVATAR_COLORS[idx]
}
</script>

<template>

  <!-- ══════════════════════════════════════════════════════════════
       MOBILE: Lavori list (lavorazioni)
       ══════════════════════════════════════════════════════════════ -->
  <div v-if="!appState.isDesktop.value" class="lavori-view">

    <div class="lavori-header">
      <div class="lavori-title">Lavori</div>
      <button class="lavori-filter-btn">
        <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
      </button>
    </div>

    <div class="lavori-tabs">
      <button class="lavori-tab" :class="{ active: mobileFilter === 'all' }"        @click="mobileFilter = 'all'">Tutti {{ mobileFilterCounts.all }}</button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'today' }"      @click="mobileFilter = 'today'">Oggi {{ mobileFilterCounts.today }}</button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'in_corso' }"   @click="mobileFilter = 'in_corso'">
        <span class="lavori-tab-dot" />In corso {{ mobileFilterCounts.in_corso }}
      </button>
      <button class="lavori-tab" :class="{ active: mobileFilter === 'completate' }" @click="mobileFilter = 'completate'">Completati {{ mobileFilterCounts.completate }}</button>
    </div>

    <div v-if="!filteredWorkOrdersMobile.length" class="lavori-empty">
      <svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
      <div class="lavori-empty-title">Nessuna lavorazione</div>
      <div class="lavori-empty-sub">Aggiungi lavorazioni dalla scheda Pianificazione</div>
    </div>

    <div v-for="group in groupedWoByDay" :key="group.dateStr" class="lavori-group">
      <div class="lavori-group-label" :class="{ 'lavori-group-label--past': group.dateStr < todayDateStr }">{{ group.label }} · {{ group.items.length }}</div>
      <div v-for="wo in group.items" :key="wo.id" class="lavori-card" :class="{ 'lavori-card--live': getWoStato(wo) === 'in_corso' || getWoStato(wo) === 'in_viaggio' }" @click="openDetail(wo.id)">
        <div class="lavori-card-top">
          <div class="lavori-card-badges">
            <span class="badge" :class="getWoStatoBadge(getWoStato(wo))">{{ STATO_META[getWoStato(wo)].label }}</span>
            <span class="badge badge-muted">{{ ACT[wo.type]?.label ?? wo.type }}</span>
          </div>
          <span v-if="getWoStato(wo) === 'in_corso' || getWoStato(wo) === 'in_viaggio'" class="lavori-card-time lavori-card-time--live">{{ getWoLiveElapsed(wo) }}</span>
          <span v-else-if="getWoTotalTime(wo) > 0" class="lavori-card-time">{{ fmtDur(getWoTotalTime(wo)) }}</span>
        </div>
        <div class="lavori-card-name">{{ wo.detail || '—' }}</div>
        <div class="lavori-card-meta">
          <span v-if="wo.luogo" class="lavori-card-loc">
            <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            {{ wo.luogo }}
          </span>
          <span v-if="wo.orderNumber" class="lavori-card-photos">{{ wo.orderNumber }}</span>
          <span v-if="wo.squadra?.length" class="lavori-card-dur">{{ wo.squadra.join(', ') }}</span>
        </div>
      </div>
    </div>

  </div><!-- /lavori-view -->


  <!-- ══════════════════════════════════════════════════════════════
       DESKTOP: Lavorazioni table
       ══════════════════════════════════════════════════════════════ -->
  <div v-else class="lav-view" id="view-summary" @click="closeMenu">

    <!-- ── Topbar ─────────────────────────────────────────────────── -->
    <div class="lav-top">
      <div class="lav-top-left">
        <div class="lav-breadcrumb">{{ workspaceName }}</div>
        <div class="lav-title-row">
          <h1 class="lav-title">Lavorazioni</h1>
          <span class="lav-subtitle">
            {{ subtitleCounts.total }} totali
            <template v-if="subtitleCounts.inCorso > 0"> · <span class="lav-sub-live">{{ subtitleCounts.inCorso }} in corso</span></template>
            <template v-if="subtitleCounts.bloccate > 0"> · <span class="lav-sub-err">{{ subtitleCounts.bloccate }} bloccate</span></template>
          </span>
        </div>
      </div>
      <div class="lav-top-center">
        <div class="lav-search">
          <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cerca lavorazioni, clienti, operatori..."
          />
          <kbd>⌘K</kbd>
        </div>
      </div>
      <div class="lav-top-right">
        <button class="lav-btn-ghost">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/></svg>
          Esporta
        </button>
        <button class="lav-btn-fill" @click="appState.navigate('planning')">
          <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Nuova
        </button>
        <button class="lav-bell">
          <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
        </button>
      </div>
    </div>

    <!-- ── Filter tabs ─────────────────────────────────────────────── -->
    <div class="lav-filter-bar">
      <div class="lav-tabs">
        <button class="lav-tab" :class="{ active: activeTab === 'tutte' }"         @click="activeTab = 'tutte'">
          Tutte <span class="lav-tab-cnt">{{ tabCounts.tutte }}</span>
        </button>
        <button class="lav-tab" :class="{ active: activeTab === 'mie' }"           @click="activeTab = 'mie'">
          Mie <span class="lav-tab-cnt">{{ tabCounts.mie }}</span>
        </button>
        <button class="lav-tab lav-tab-live" :class="{ active: activeTab === 'in_corso' }" @click="activeTab = 'in_corso'">
          In corso <span class="lav-tab-cnt lav-tab-cnt-live">{{ tabCounts.in_corso }}</span>
        </button>
        <button class="lav-tab" :class="{ active: activeTab === 'pianificate' }"   @click="activeTab = 'pianificate'">
          Pianificate <span class="lav-tab-cnt">{{ tabCounts.pianificate }}</span>
        </button>
        <button class="lav-tab lav-tab-err" :class="{ active: activeTab === 'bloccate' }" @click="activeTab = 'bloccate'">
          Bloccate <span class="lav-tab-cnt">{{ tabCounts.bloccate }}</span>
        </button>
        <button class="lav-tab" :class="{ active: activeTab === 'da_verificare' }" @click="activeTab = 'da_verificare'">
          Da verificare <span class="lav-tab-cnt">{{ tabCounts.da_verificare }}</span>
        </button>
      </div>
      <div class="lav-filter-actions">
        <button class="lav-filter-btn">
          <svg viewBox="0 0 24 24"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
          Filtri
        </button>
        <button class="lav-filter-btn">
          <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
          Ordina · Scadenza
        </button>
        <button class="lav-filter-btn">
          <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
          Vista · Tabella
        </button>
      </div>
    </div>

    <!-- ── Table ──────────────────────────────────────────────────── -->
    <div class="lav-table-wrap">

      <!-- Empty state -->
      <div v-if="!tableRows.length" class="lav-empty">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        <div class="lav-empty-title">Nessuna lavorazione</div>
        <div class="lav-empty-sub">
          {{ searchQuery ? 'Nessun risultato per la ricerca' : 'Aggiungi una lavorazione dalla Pianificazione' }}
        </div>
        <button v-if="!searchQuery" class="lav-empty-cta" @click="appState.navigate('planning')">
          + Nuova lavorazione
        </button>
      </div>

      <table v-else class="lav-table">
        <thead>
          <tr>
            <th class="col-id">ID</th>
            <th class="col-lav">LAVORAZIONE</th>
            <th class="col-cli">CLIENTE</th>
            <th class="col-loc">LOCALITÀ</th>
            <th class="col-scad">SCADENZA</th>
            <th class="col-stato">STATO</th>
            <th class="col-pri">PRIORITÀ</th>
            <th class="col-sq">SQUADRA</th>
            <th class="col-av">AVANZAM.</th>
            <th class="col-act"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in tableRows"
            :key="row.wo.id"
            class="lav-row"
            @click="openDetail(row.wo.id)"
          >
            <!-- ID -->
            <td class="col-id">
              <span class="lav-id">{{ row.wo.orderNumber || '—' }}</span>
            </td>

            <!-- Lavorazione -->
            <td class="col-lav">
              <div class="lav-detail">{{ row.wo.detail || '—' }}</div>
              <div class="lav-type-tag" :style="{ color: ACT[row.wo.type]?.color }">
                {{ ACT[row.wo.type]?.emoji }} {{ ACT[row.wo.type]?.label }}
              </div>
            </td>

            <!-- Cliente -->
            <td class="col-cli">
              <span class="lav-cell-text">{{ row.wo.cliente || '—' }}</span>
            </td>

            <!-- Località -->
            <td class="col-loc">
              <span v-if="row.wo.luogo || row.wo.mapsLink" class="lav-loc">
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {{ row.wo.luogo || '📍 Maps' }}
              </span>
              <span v-else class="lav-cell-muted">—</span>
            </td>

            <!-- Scadenza -->
            <td class="col-scad">
              <span
                class="lav-scad"
                :class="{
                  'lav-scad-overdue': fmtScadenza(row.wo.date).isOverdue,
                  'lav-scad-today':   fmtScadenza(row.wo.date).isToday,
                }"
              >{{ fmtScadenza(row.wo.date).text }}</span>
            </td>

            <!-- Stato -->
            <td class="col-stato">
              <span class="lav-stato-badge" :class="STATO_META[row.stato].cls">
                {{ STATO_META[row.stato].label }}
              </span>
            </td>

            <!-- Priorità -->
            <td class="col-pri">
              <template v-if="row.wo.priorita">
                <span class="lav-pri">
                  <span class="lav-pri-dot" :style="{ background: PRIORITA_META[row.wo.priorita].color }" />
                  {{ PRIORITA_META[row.wo.priorita].label }}
                </span>
              </template>
              <span v-else class="lav-cell-muted">—</span>
            </td>

            <!-- Squadra -->
            <td class="col-sq">
              <template v-if="row.wo.squadra?.length">
                <div class="lav-avatars">
                  <div
                    v-for="(name, idx) in row.wo.squadra.slice(0, 3)"
                    :key="idx"
                    class="lav-avatar"
                    :style="{ background: avatarColor(name), zIndex: 3 - idx }"
                    :title="name"
                  >{{ getInitials(name) }}</div>
                  <div v-if="row.wo.squadra.length > 3" class="lav-avatar lav-avatar-more">
                    +{{ row.wo.squadra.length - 3 }}
                  </div>
                </div>
              </template>
              <span v-else class="lav-cell-muted">Non assegnato</span>
            </td>

            <!-- Avanzamento -->
            <td class="col-av">
              <template v-if="!row.wo.estimatedTime">
                <span class="lav-av-unplanned">NON PIANIFICATO</span>
              </template>
              <template v-else-if="row.workedSecs === 0">
                <div class="lav-av">
                  <div class="lav-progress-bar"><div class="lav-progress-fill" style="width:0%" /></div>
                  <span class="lav-av-counts">0h / {{ fmtDur(row.wo.estimatedTime * 60) }}</span>
                  <span class="lav-av-label">Da iniziare</span>
                </div>
              </template>
              <template v-else>
                <div class="lav-av">
                  <div class="lav-progress-bar">
                    <div
                      class="lav-progress-fill"
                      :class="avBarClass(row.workedSecs, row.wo.estimatedTime)"
                      :style="{ width: `${avBarWidth(row.workedSecs, row.wo.estimatedTime)}%` }"
                    />
                  </div>
                  <span class="lav-av-counts">{{ fmtDur(row.workedSecs) }} / {{ fmtDur(row.wo.estimatedTime * 60) }}</span>
                  <span class="lav-av-remain" :class="avRemainIsOver(row.workedSecs, row.wo.estimatedTime) ? 'lav-av-remain--over' : 'lav-av-remain--ok'">
                    {{ avRemainStr(row.workedSecs, row.wo.estimatedTime) }}
                  </span>
                </div>
              </template>
            </td>

            <!-- Actions -->
            <td class="col-act" @click.stop>
              <button class="lav-menu-btn" @click="toggleRowMenu(row.wo.id, $event)">
                <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
              </button>
              <div v-if="menuRowId === row.wo.id" class="lav-row-menu">
                <button @click="openDetail(row.wo.id); closeMenu()">
                  <svg viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Apri
                </button>
                <button @click="appState.navigate('planning'); closeMenu()">
                  <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  Modifica
                </button>
                <button @click="deleteOrder(row.wo)">
                  <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6M10 11v6M14 11v6"/></svg>
                  Elimina
                </button>
              </div>
            </td>

          </tr>
        </tbody>
      </table>
    </div><!-- /lav-table-wrap -->

  </div><!-- /lav-view -->

</template>

<style scoped lang="scss">
// ════════════════════════════════════════════════════════════════════
// MOBILE
// ════════════════════════════════════════════════════════════════════

.lavori-view {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--bg);
  padding-bottom: calc(var(--nav-h) + 16px);
}

.lavori-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 12px;
}

.lavori-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
}

.lavori-filter-btn {
  width: 36px;
  height: 36px;
  border: none;
  background: var(--surface-2);
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);

  svg {
    width: 15px;
    height: 15px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.lavori-tabs {
  display: flex;
  gap: 6px;
  padding: 0 16px 12px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.lavori-tab {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 20px;
  border: 1px solid var(--border);
  background: transparent;
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  transition: all .12s;

  &.active {
    background: var(--surface-3);
    border-color: var(--border-strong);
    color: var(--ink);
    font-weight: 600;
  }
}

.lavori-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
  animation: blink 1s infinite;
}

.lavori-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 60px 24px;
  gap: 8px;
  color: var(--muted);

  svg {
    width: 36px;
    height: 36px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: .5;
  }
}

.lavori-empty-title { font-size: 15px; font-weight: 600; color: var(--ink-2); }
.lavori-empty-sub   { font-size: 13px; color: var(--muted); }

.lavori-group { padding: 0 16px 12px; }

.lavori-group-label {
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .6px;
  text-transform: uppercase;
  color: var(--ink);
  padding: 12px 4px 8px;
}

.lavori-group-label--past {
  color: var(--muted);
  font-size: 11px;
}

.lavori-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 14px 16px;
  margin-bottom: 8px;
}

.lavori-card--live {
  border-color: var(--ok);
  transition: border-color .15s;
}

.lavori-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.lavori-card-badges {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.lavori-card-time {
  font-size: 11px;
  color: var(--muted);
  font-family: var(--ff-mono);
}

.lavori-card-time--live {
  color: var(--ok-ink);
  font-weight: 700;
}

.badge {
  padding: 2px 8px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .4px;
}

.badge-live { background: var(--live-soft);   color: var(--live); }
.badge-ok   { background: var(--ok-soft);     color: var(--ok-ink); }
.badge-muted{ background: var(--surface-3);   color: var(--muted); }

.lavori-card-name {
  font-size: 14px;
  font-weight: 600;
  color: var(--ink);
  margin-bottom: 6px;
  line-height: 1.3;
}

.lavori-card-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 11px;
  color: var(--muted);
}

.lavori-card-loc {
  display: flex;
  align-items: center;
  gap: 3px;

  svg {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.lavori-card-photos {
  display: flex;
  align-items: center;
  gap: 3px;

  svg {
    width: 11px;
    height: 11px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.lavori-card-dur { font-family: var(--ff-mono); }

.lavori-card-note {
  font-size: 12px;
  color: var(--muted);
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid var(--border);
  font-style: italic;
}

// ════════════════════════════════════════════════════════════════════
// DESKTOP: Lavorazioni table
// ════════════════════════════════════════════════════════════════════

.lav-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  padding: 0 !important;
}

// ── Topbar ────────────────────────────────────────────────────────────
.lav-top {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 28px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.lav-top-left { flex-shrink: 0; }
.lav-top-center { flex: 1; }
.lav-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.lav-breadcrumb {
  font-size: 11px;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: .8px;
  font-weight: 600;
  margin-bottom: 4px;
}

.lav-title-row { display: flex; align-items: baseline; gap: 12px; }

.lav-title {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
}

.lav-subtitle { font-size: 13px; color: var(--muted); }
.lav-sub-live { color: var(--live); font-weight: 600; }
.lav-sub-err  { color: var(--err);  font-weight: 600; }

.lav-search {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  height: 36px;

  svg {
    width: 14px;
    height: 14px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    background: transparent;
    border: none;
    font-family: var(--ff);
    font-size: 13px;
    color: var(--ink);
    outline: none;

    &::placeholder { color: var(--muted); }
  }

  kbd {
    font-size: 10px;
    color: var(--muted);
    font-family: var(--ff);
    background: var(--surface-2);
    border-radius: 3px;
    padding: 1px 5px;
  }
}

.lav-btn-ghost {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 14px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  transition: all .12s;

  &:hover { background: var(--surface-2); }

  svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; }
}

.lav-btn-fill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 16px;
  background: var(--ink);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: var(--bg);
  cursor: pointer;
  transition: opacity .12s;

  &:hover { opacity: .88; }

  svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; }
}

.lav-bell {
  width: 34px;
  height: 34px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: var(--radius-sm);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);
  transition: all .12s;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg { width: 15px; height: 15px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
}

// ── Filter bar ────────────────────────────────────────────────────────
.lav-filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 28px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.lav-tabs {
  display: flex;
  align-items: center;
  gap: 0;
}

.lav-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all .12s;
  margin-bottom: -1px;

  &:hover { color: var(--ink); }

  &.active {
    color: var(--ink);
    font-weight: 600;
    border-bottom-color: var(--primary);
  }

  &.lav-tab-live.active { border-bottom-color: var(--live); color: var(--live); }
  &.lav-tab-err.active  { border-bottom-color: var(--err);  color: var(--err); }
}

.lav-tab-cnt {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--surface-2);
  border-radius: 9px;
  font-size: 10px;
  font-weight: 700;
  color: var(--muted);
}

.lav-tab-cnt-live {
  background: var(--live-soft);
  color: var(--live);
}

.lav-filter-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lav-filter-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 10px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: var(--radius-xs);
  font-family: var(--ff);
  font-size: 11px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: all .12s;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg { width: 11px; height: 11px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
}

// ── Table ─────────────────────────────────────────────────────────────
.lav-table-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: auto;
}

.lav-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 24px;
  gap: 8px;

  svg {
    width: 40px;
    height: 40px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: .4;
    margin-bottom: 8px;
  }
}

.lav-empty-title { font-size: 16px; font-weight: 600; color: var(--ink-2); }
.lav-empty-sub   { font-size: 13px; color: var(--muted); }
.lav-empty-cta {
  margin-top: 12px;
  padding: 8px 20px;
  background: var(--primary);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 600;
  color: #fff;
  cursor: pointer;
  transition: opacity .12s;

  &:hover { opacity: .88; }
}

.lav-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;

  thead tr {
    border-bottom: 1px solid var(--border);
  }

  th {
    padding: 10px 14px;
    text-align: left;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .8px;
    text-transform: uppercase;
    color: var(--muted);
    white-space: nowrap;
    background: var(--bg);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  td {
    padding: 12px 14px;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }
}

.lav-row {
  cursor: pointer;
  transition: background .1s;

  &:hover {
    background: var(--surface);

    .lav-menu-btn { opacity: 1; }
  }
}

// Column widths
.col-id   { width: 100px; }
.col-lav  { min-width: 160px; max-width: 240px; overflow: hidden; }
.col-cli  { width: 110px; overflow: hidden; }
.col-loc  { width: 110px; }
.col-scad { width: 90px; }
.col-stato{ width: 120px; }
.col-pri  { width: 100px; }
.col-sq   { width: 100px; }
.col-av   { width: 170px; }
.col-act  { width: 48px; }

.lav-id {
  font-family: var(--ff-mono);
  font-size: 11px;
  color: var(--muted);
  font-weight: 500;
}

.lav-detail {
  font-weight: 600;
  color: var(--ink);
  line-height: 1.3;
}

.lav-type-tag {
  font-size: 11px;
  margin-top: 2px;
  color: var(--muted);
}

.lav-cell-text  { color: var(--ink-2); }
.lav-cell-muted { color: var(--muted); font-style: italic; }

.lav-loc {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--ink-2);

  svg { width: 12px; height: 12px; stroke: var(--muted); fill: none; stroke-width: 1.8; stroke-linecap: round; flex-shrink: 0; }
}

.lav-scad {
  font-size: 12px;
  color: var(--ink-2);
  font-weight: 500;

  &.lav-scad-overdue { color: var(--err); font-weight: 600; }
  &.lav-scad-today   { color: var(--live); font-weight: 600; }
}

// ── Stato badge ───────────────────────────────────────────────────────
.lav-stato-badge {
  display: inline-flex;
  align-items: center;
  padding: 3px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 600;
  white-space: nowrap;
  border: 1px solid transparent;

  &.stato-in-corso      { background: var(--live-soft);    color: var(--live);       border-color: color-mix(in srgb, var(--live) 30%, transparent); }
  &.stato-in-viaggio    { background: rgba(45,91,255,.1);  color: var(--primary-ink); border-color: rgba(45,91,255,.3); }
  &.stato-assegnato     { background: rgba(45,91,255,.1);  color: var(--primary-ink); border-color: rgba(45,91,255,.3); }
  &.stato-pianificato   { background: transparent;         color: var(--muted);       border-color: var(--border-strong); }
  &.stato-da-verificare { background: rgba(245,165,36,.1); color: var(--live);        border-color: rgba(245,165,36,.3); }
  &.stato-bloccato      { background: var(--err-soft);     color: var(--err);         border-color: rgba(220,38,38,.3); }
  &.stato-completato    { background: var(--ok-soft);      color: var(--ok-ink);      border-color: rgba(31,157,85,.3); }
}

// ── Priorità ──────────────────────────────────────────────────────────
.lav-pri {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--ink-2);
}

.lav-pri-dot {
  width: 7px;
  height: 7px;
  border-radius: 2px;
  flex-shrink: 0;
}

// ── Squadra avatars ───────────────────────────────────────────────────
.lav-avatars {
  display: flex;
  align-items: center;
}

.lav-avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--bg);
  margin-left: -6px;
  flex-shrink: 0;

  &:first-child { margin-left: 0; }
}

.lav-avatar-more {
  background: var(--surface-3);
  color: var(--muted);
  font-size: 9px;
}

// ── Avanzamento ───────────────────────────────────────────────────────
.lav-av {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.lav-progress-bar {
  width: 100%;
  height: 5px;
  background: var(--surface-3);
  border-radius: 3px;
  overflow: hidden;
}

.lav-progress-fill {
  height: 100%;
  border-radius: 3px;
  background: var(--primary);
  transition: width .3s;

  &.lav-progress-fill-ok   { background: var(--ok); }
  &.lav-progress-fill-warn { background: var(--warn); }
  &.lav-progress-fill-err  { background: var(--err); }
}

.lav-av-counts {
  font-size: 11px;
  font-family: var(--ff-mono);
  color: var(--muted);
  white-space: nowrap;
}

.lav-av-remain {
  font-size: 11px;
  font-weight: 600;
  font-family: var(--ff-mono);
  white-space: nowrap;

  &.lav-av-remain--ok   { color: var(--ok-ink); }
  &.lav-av-remain--over { color: var(--err-ink); }
}

.lav-av-label {
  font-size: 11px;
  color: var(--muted);
}

.lav-av-unplanned {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .5px;
  color: var(--warn-ink);
}

// ── Row menu ──────────────────────────────────────────────────────────
.lav-menu-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: var(--radius-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);
  opacity: 0;
  transition: all .1s;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg { width: 14px; height: 14px; fill: currentColor; stroke: none; }
}

.lav-row-menu {
  position: absolute;
  right: 12px;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  z-index: 100;
  overflow: hidden;
  min-width: 140px;

  button {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 9px 14px;
    border: none;
    background: transparent;
    font-family: var(--ff);
    font-size: 13px;
    color: var(--ink-2);
    cursor: pointer;
    text-align: left;
    transition: background .1s;

    &:hover { background: var(--surface-2); }

    &:last-child { color: var(--err); }

    svg { width: 13px; height: 13px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  }
}

.col-act { position: relative; }

@media (min-width: 800px) {
  .lav-breadcrumb    { font-size: 13px; }
  .lav-title         { font-size: 24px; }
  .lav-subtitle      { font-size: 15px; }
  .lav-search input  { font-size: 15px; }
  .lav-btn-ghost     { font-size: 15px; }
  .lav-btn-fill      { font-size: 15px; }
  .lav-tab           { font-size: 15px; }
  .lav-filter-btn    { font-size: 13px; }
  .lav-table         { font-size: 15px; }
  .lav-empty-title   { font-size: 18px; }
  .lav-empty-sub     { font-size: 15px; }
  .lav-empty-cta     { font-size: 15px; }
  .lav-id            { font-size: 13px; }
  .lav-type-tag      { font-size: 13px; }
  .lav-scad          { font-size: 14px; }
  .lav-stato-badge   { font-size: 13px; }
  .lav-pri           { font-size: 14px; }
  .lav-av-counts     { font-size: 13px; }
  .lav-av-remain     { font-size: 13px; }
  .lav-row-menu button { font-size: 15px; }
}
</style>
