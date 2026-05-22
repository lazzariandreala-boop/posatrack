<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useAppState } from '~/composables/useAppState'
import { useStore }    from '~/composables/useStore'
import { useAuth }     from '~/composables/useAuth'
import { ACT }         from '~/constants'
import type { WorkOrder, Activity } from '~/types'
import { photoSrc } from '~/types'

const appState = useAppState()
const store    = useStore()
const auth     = useAuth()

// ── Selected work order ───────────────────────────────────────────────
const wo = computed<WorkOrder | undefined>(() =>
  store.getAllWorkOrders().find(w => w.id === appState.selectedLavorazioneId.value)
)

// ── Linked activities ─────────────────────────────────────────────────
const linkedActivities = computed<Activity[]>(() => {
  if (!wo.value) return []
  return store.all()
    .filter(a =>
      a.workOrderId === wo.value!.id ||
      (wo.value!.orderNumber && a.orderNumber === wo.value!.orderNumber && a.date === wo.value!.date)
    )
    .sort((a, b) => b.startTime - a.startTime)
})

const liveActivity = computed<Activity | null>(() =>
  linkedActivities.value.find(a => !a.endTime) ?? null
)

// ── Live timer ────────────────────────────────────────────────────────
const elapsedDisplay = ref('00:00:00')
let timerInterval: ReturnType<typeof setInterval> | null = null

function startTimer(startTs: number): void {
  if (timerInterval) clearInterval(timerInterval)
  const tick = () => {
    const secs = Math.max(0, Math.floor((Date.now() - startTs) / 1000))
    const h = String(Math.floor(secs / 3600)).padStart(2, '0')
    const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
    const s = String(secs % 60).padStart(2, '0')
    elapsedDisplay.value = `${h}:${m}:${s}`
  }
  tick()
  timerInterval = setInterval(tick, 1000)
}

function stopTimer(): void {
  if (timerInterval) { clearInterval(timerInterval); timerInterval = null }
  elapsedDisplay.value = '00:00:00'
}

watch(liveActivity, act => {
  if (act && !act.endTime) startTimer(act.startTime)
  else stopTimer()
}, { immediate: true })

onUnmounted(() => stopTimer())

// ── Status derivation ─────────────────────────────────────────────────
type WoStato = 'in_corso' | 'in_viaggio' | 'assegnato' | 'pianificato' | 'da_verificare' | 'bloccato' | 'completato'

const statoCorrente = computed<WoStato>(() => {
  const w = wo.value
  if (!w) return 'pianificato'
  if (liveActivity.value)                   return 'in_corso'
  if (w.statoManuale === 'bloccato')        return 'bloccato'
  if (w.statoManuale === 'da_verificare')   return 'da_verificare'
  if (w.statoManuale === 'in_viaggio')      return 'in_viaggio'
  if (w.statoManuale === 'assegnato')       return 'assegnato'
  if (w.statoManuale === 'completato')      return 'completato'
  return 'pianificato'
})

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
  media:   { label: 'Media',   color: 'var(--muted-2, #93908A)' },
  bassa:   { label: 'Bassa',   color: 'var(--muted)' },
}

// ── Progress ──────────────────────────────────────────────────────────
const progress = computed<number | null>(() => {
  const w = wo.value
  if (!w?.estimatedTime) return null
  const elapsed = linkedActivities.value.reduce((s, a) => s + (a.duration ?? 0), 0)
  return Math.min(100, Math.round((elapsed / (w.estimatedTime * 60)) * 100))
})

// ── Countdown ─────────────────────────────────────────────────────────
const countdown = computed(() => {
  if (!wo.value?.date) return ''
  const target = new Date(wo.value.date + 'T23:59:59')
  const diff   = Math.floor((target.getTime() - Date.now()) / 1000)
  if (diff < 0) return 'scaduta'
  const h = Math.floor(diff / 3600)
  const m = Math.floor((diff % 3600) / 60)
  if (h > 48) {
    const days = Math.floor(h / 24)
    return `tra ${days}g`
  }
  return `tra ${h}h ${m}m`
})

// ── Date formatting ───────────────────────────────────────────────────
function fmtDateLong(dateStr: string): string {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const months = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic']
  return `${d} ${months[m - 1]}`
}

function fmtTime(ts: number): string {
  const d = new Date(ts)
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
}

function fmtRelTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 60000)
  if (diff < 1)  return 'adesso'
  if (diff < 60) return `${diff}m fa`
  return `${Math.floor(diff / 60)}h fa`
}

function fmtDur(secs: number): string {
  if (secs >= 3600) {
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    return m > 0 ? `${h}h ${m}m` : `${h}h`
  }
  if (secs >= 60) return `${Math.floor(secs / 60)}m`
  return `${secs}s`
}

function fmtEstTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (h > 0 && m > 0) return `${h}h ${m}m`
  if (h > 0) return `${h}h`
  return `${m}m`
}

// ── All photos from linked activities ─────────────────────────────────
const allPhotos = computed(() =>
  linkedActivities.value.flatMap(a =>
    (a.photos ?? []).map(p => ({ src: photoSrc(p), ts: p.ts, actId: a.id }))
  ).sort((a, b) => a.ts - b.ts)
)

// ── Day note ─────────────────────────────────────────────────────────
const dayNote = computed(() =>
  wo.value ? store.getDayNote(wo.value.date) : ''
)

// ── Tabs ─────────────────────────────────────────────────────────────
type TabKey = 'panoramica' | 'timeline' | 'gps' | 'foto' | 'note' | 'costi' | 'documenti'
const activeTab = ref<TabKey>('panoramica')

// ── Aggiorna stato dropdown ───────────────────────────────────────────
const showStatoMenu = ref(false)
const STATO_OPTIONS: Array<{ value: WorkOrder['statoManuale']; label: string }> = [
  { value: 'assegnato',     label: 'Assegnato'     },
  { value: 'in_viaggio',   label: 'In viaggio'    },
  { value: 'da_verificare',label: 'Da verificare' },
  { value: 'bloccato',     label: 'Bloccato'      },
  { value: 'completato',   label: 'Completato'    },
]

function aggiornaStato(val: WorkOrder['statoManuale']): void {
  if (!wo.value) return
  store.updateWorkOrder(wo.value.id, { statoManuale: val })
  showStatoMenu.value = false
  appState.showToast('Stato aggiornato')
}

function goBack(): void {
  appState.navigate('summary')
}

// ── Avatar helpers ────────────────────────────────────────────────────
function getInitials(name: string): string {
  return name.split(' ').map(n => n[0] ?? '').join('').toUpperCase().slice(0, 2)
}

const AVATAR_COLORS = ['#2D5BFF','#FF5F00','#1F9D55','#8B5CF6','#DC2626','#F5B800']
function avatarColor(name: string): string {
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length]
}

// ── Lightbox ──────────────────────────────────────────────────────────
function openPhoto(src: string): void {
  appState.openLightbox(src)
}

// ── Cost helpers ─────────────────────────────────────────────────────
function fmtEur(v?: number): string {
  if (!v) return '—'
  return `€ ${v.toFixed(2).replace('.', ',')}`
}

function costPct(actual?: number, budget?: number): number {
  if (!budget || !actual) return 0
  return Math.min(100, Math.round((actual / budget) * 100))
}

function costOverPct(actual?: number, budget?: number): string {
  if (!budget || !actual) return ''
  const pct = Math.round(((actual - budget) / budget) * 100)
  if (pct > 0) return `+${pct}% sopra preventivo`
  if (pct < 0) return `${Math.abs(pct)}% sotto preventivo`
  return 'In linea'
}

function isOverBudget(actual?: number, budget?: number): boolean {
  return !!(actual && budget && actual > budget)
}

// ── Live elapsed for linked sessions ─────────────────────────────────
const totalElapsedSecs = computed<number>(() =>
  linkedActivities.value.reduce((s, a) => s + (a.duration ?? 0), 0)
)
</script>

<template>
  <div class="det-view view" id="view-lav-detail" @click="showStatoMenu = false">

    <!-- ── Fallback if WO not found ──────────────────────────────── -->
    <div v-if="!wo" class="det-not-found">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      <div>Lavorazione non trovata</div>
      <button @click="goBack">← Torna alle lavorazioni</button>
    </div>

    <template v-else>

      <!-- ── Topbar ────────────────────────────────────────────────── -->
      <div class="det-top">
        <div class="det-top-left">
          <nav class="det-breadcrumb">
            <button class="det-back-btn" @click="goBack" title="Torna alle lavorazioni">
              <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <button class="det-bc-link" @click="goBack">Lavorazioni</button>
            <span class="det-bc-sep">/</span>
            <span class="det-bc-cur">{{ wo.orderNumber || wo.detail.slice(0, 24) }}</span>
          </nav>
          <div class="det-title-row">
            <h1 class="det-title">{{ wo.detail }}</h1>
            <span v-if="wo.cliente" class="det-cliente">{{ wo.cliente }}</span>
          </div>
        </div>
        <div class="det-top-right">
          <button class="det-btn-ghost">PDF</button>
          <button class="det-btn-ghost det-btn-icon">
            <svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>
          </button>
          <div class="det-stato-wrap" @click.stop>
            <button class="det-btn-fill" @click="showStatoMenu = !showStatoMenu">
              Aggiorna stato
              <svg viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <div v-if="showStatoMenu" class="det-stato-menu">
              <div class="det-stato-menu-title">Cambia stato</div>
              <button
                v-for="opt in STATO_OPTIONS"
                :key="opt.value"
                class="det-stato-opt"
                :class="{ active: wo.statoManuale === opt.value }"
                @click="aggiornaStato(opt.value)"
              >{{ opt.label }}</button>
            </div>
          </div>
          <button class="det-bell">
            <svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
          </button>
        </div>
      </div>

      <!-- ── Hero card ─────────────────────────────────────────────── -->
      <div class="det-hero">
        <div class="det-hero-inner">

          <!-- Top meta row -->
          <div class="det-hero-meta">
            <div class="det-hero-badges">
              <span class="det-stato-badge" :class="STATO_META[statoCorrente].cls">
                <span class="det-stato-dot" />
                {{ STATO_META[statoCorrente].label }}
              </span>
              <span v-if="wo.priorita" class="det-pri-badge" :style="{ color: PRIORITA_META[wo.priorita].color, borderColor: PRIORITA_META[wo.priorita].color + '44', background: PRIORITA_META[wo.priorita].color + '11' }">
                ■ {{ PRIORITA_META[wo.priorita].label }}
              </span>
              <span v-if="wo.luogo || wo.mapsLink" class="det-loc-badge">
                <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                {{ wo.luogo || 'Vedi mappa' }}
              </span>
            </div>
            <div class="det-scad-wrap">
              <div class="det-scad-label">SCADENZA</div>
              <div class="det-scad-date">{{ fmtDateLong(wo.date) }}</div>
              <div class="det-scad-countdown">{{ countdown }}</div>
            </div>
          </div>

          <div class="det-hero-title">{{ wo.detail }}</div>
          <div v-if="wo.note" class="det-hero-sub">{{ wo.note }}</div>

          <!-- Live session block -->
          <div v-if="liveActivity" class="det-live-block">
            <div class="det-live-header">
              <span class="det-live-dot"></span>
              <span class="det-live-label">SESSIONE LIVE · {{ ACT[liveActivity.type]?.label?.toUpperCase() }}</span>
            </div>
            <div class="det-live-body">
              <div class="det-live-timer">{{ elapsedDisplay }}</div>
              <div class="det-live-meta">
                <span>Avvio · {{ fmtTime(liveActivity.startTime) }}</span>
                <span v-if="wo.estimatedTime"> · Stima · {{ fmtEstTime(wo.estimatedTime) }}</span>
              </div>
            </div>
            <div v-if="progress !== null" class="det-live-progress-wrap">
              <span class="det-live-progress-label">Avanzamento</span>
              <div class="det-live-progress-bar">
                <div class="det-live-progress-fill" :style="{ width: `${progress}%` }" />
              </div>
              <span class="det-live-progress-pct">{{ progress }}%</span>
            </div>
          </div>

        </div>
      </div>

      <!-- ── Tab navigation ────────────────────────────────────────── -->
      <div class="det-tabs">
        <button class="det-tab" :class="{ active: activeTab === 'panoramica' }"  @click="activeTab = 'panoramica'">Panoramica</button>
        <button class="det-tab" :class="{ active: activeTab === 'timeline' }"    @click="activeTab = 'timeline'">Timeline</button>
        <button class="det-tab" :class="{ active: activeTab === 'gps' }"         @click="activeTab = 'gps'">GPS &amp; Tracce</button>
        <button class="det-tab" :class="{ active: activeTab === 'foto' }"        @click="activeTab = 'foto'">
          Foto <span v-if="allPhotos.length" class="det-tab-cnt">{{ allPhotos.length }}</span>
        </button>
        <button class="det-tab" :class="{ active: activeTab === 'note' }"        @click="activeTab = 'note'">
          Note <span v-if="dayNote" class="det-tab-cnt">1</span>
        </button>
        <button class="det-tab" :class="{ active: activeTab === 'costi' }"       @click="activeTab = 'costi'">Costi</button>
        <button class="det-tab" :class="{ active: activeTab === 'documenti' }"   @click="activeTab = 'documenti'">Documenti</button>
      </div>

      <!-- ── Tab content ───────────────────────────────────────────── -->
      <div class="det-content">

        <!-- ══ PANORAMICA ══════════════════════════════════════════════ -->
        <div v-if="activeTab === 'panoramica'" class="det-panoramica">

          <!-- LEFT column -->
          <div class="det-col-main">

            <!-- Attività di oggi -->
            <div class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Attività di oggi</span>
                <span class="det-section-sub">{{ linkedActivities.length }} sessioni</span>
              </div>

              <div v-if="!linkedActivities.length" class="det-empty-sm">
                <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
                Nessuna attività registrata
              </div>

              <div v-else class="det-feed">
                <div v-for="a in linkedActivities.slice(0, 8)" :key="a.id" class="det-feed-item">
                  <div class="det-feed-avatar" :style="{ background: ACT[a.type]?.color ?? '#888' }">
                    {{ ACT[a.type]?.emoji }}
                  </div>
                  <div class="det-feed-body">
                    <div class="det-feed-main">
                      <span class="det-feed-act" :style="{ color: ACT[a.type]?.color }">
                        {{ ACT[a.type]?.label }}
                      </span>
                      <span v-if="a.detail" class="det-feed-detail"> · {{ a.detail.slice(0, 36) }}</span>
                      <span v-if="!a.endTime" class="det-feed-live">live</span>
                    </div>
                    <div class="det-feed-time">
                      {{ fmtTime(a.startTime) }}
                      <template v-if="a.endTime"> → {{ fmtTime(a.endTime) }}</template>
                      <template v-if="a.duration"> · {{ fmtDur(a.duration) }}</template>
                      <span class="det-feed-rel"> · {{ fmtRelTime(a.startTime) }}</span>
                    </div>
                  </div>
                  <div class="det-feed-indicator" :class="{ live: !a.endTime }" />
                </div>
              </div>
            </div>

            <!-- Foto cantiere -->
            <div class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Foto cantiere</span>
                <button v-if="allPhotos.length > 4" class="det-link-btn" @click="activeTab = 'foto'">
                  Vedi tutte ({{ allPhotos.length }})
                </button>
              </div>

              <div v-if="!allPhotos.length" class="det-empty-sm">
                <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Nessuna foto
              </div>
              <div v-else class="det-photo-grid">
                <div
                  v-for="p in allPhotos.slice(0, 4)"
                  :key="p.ts"
                  class="det-photo-thumb"
                  @click="openPhoto(p.src)"
                >
                  <img :src="p.src" alt="Foto cantiere" loading="lazy" />
                  <div class="det-photo-ts">{{ fmtTime(p.ts) }}</div>
                </div>
              </div>
            </div>

            <!-- Note tecniche -->
            <div v-if="dayNote" class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Note tecniche</span>
                <button class="det-link-btn" @click="activeTab = 'note'">Tutte le note</button>
              </div>
              <div class="det-note-card">
                <div class="det-note-text">{{ dayNote }}</div>
                <div class="det-note-meta">
                  <div class="det-note-avatar">N</div>
                  <span class="det-note-date">{{ fmtDateLong(wo.date) }}</span>
                </div>
              </div>
            </div>

          </div><!-- /det-col-main -->

          <!-- RIGHT column -->
          <div class="det-col-side">

            <!-- Squadra -->
            <div class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Squadra assegnata</span>
                <button class="det-icon-add">
                  <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>

              <div v-if="!wo.squadra?.length" class="det-empty-sm">
                <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
                Nessun operatore assegnato
              </div>
              <div v-else class="det-squadra-list">
                <div v-for="(name, idx) in wo.squadra" :key="idx" class="det-operatore">
                  <div class="det-op-avatar" :style="{ background: avatarColor(name) }">
                    {{ getInitials(name) }}
                  </div>
                  <div class="det-op-info">
                    <div class="det-op-name">{{ name }}</div>
                    <div class="det-op-role">Operatore</div>
                  </div>
                  <div v-if="liveActivity" class="det-op-live">
                    <span class="det-op-live-dot"></span>
                    live
                  </div>
                </div>
              </div>
            </div>

            <!-- Traccia GPS (placeholder) -->
            <div class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Traccia GPS</span>
                <span v-if="linkedActivities.some(a => a.startLoc)" class="det-gps-badge">
                  <span class="det-gps-dot"></span>
                  {{ linkedActivities.filter(a => a.startLoc).length }} punti
                </span>
              </div>
              <div class="det-map-placeholder">
                <div class="det-map-grid"></div>
                <template v-if="linkedActivities.some(a => a.startLoc)">
                  <div class="det-map-route"></div>
                  <div class="det-map-pin det-map-pin-start">
                    <div class="det-map-pin-dot"></div>
                    <div class="det-map-pin-label">Start · {{ wo.date }}</div>
                  </div>
                  <div class="det-map-pin det-map-pin-now">
                    <div class="det-map-pin-avatar">
                      <template v-if="wo.squadra?.length">{{ getInitials(wo.squadra[0]) }}</template>
                      <template v-else>?</template>
                    </div>
                    <div class="det-map-pin-label">now</div>
                  </div>
                </template>
                <div v-else class="det-map-empty">
                  <svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
                  Nessun dato GPS
                </div>
                <!-- GPS stats below map -->
                <div v-if="linkedActivities.some(a => a.startLoc)" class="det-map-stats">
                  <div class="det-map-stat">
                    <div class="det-map-stat-val">—</div>
                    <div class="det-map-stat-label">DISTANZA</div>
                  </div>
                  <div class="det-map-stat">
                    <div class="det-map-stat-val">—</div>
                    <div class="det-map-stat-label">TEMPO VIAGGIO</div>
                  </div>
                  <div class="det-map-stat">
                    <div class="det-map-stat-val" style="color:var(--ok-ink)">✓ ok</div>
                    <div class="det-map-stat-label">GEOFENCE</div>
                  </div>
                </div>
              </div>
            </div>

            <!-- Dettagli -->
            <div class="det-section">
              <div class="det-section-head">
                <span class="det-section-title">Dettagli</span>
              </div>
              <div class="det-kv-list">
                <div v-if="wo.orderNumber" class="det-kv">
                  <span class="det-kv-key">N° ordine</span>
                  <span class="det-kv-val det-mono">{{ wo.orderNumber }}</span>
                </div>
                <div class="det-kv">
                  <span class="det-kv-key">Attrezzatura</span>
                  <span class="det-kv-val">{{ wo.detail }}</span>
                </div>
                <div v-if="wo.cliente" class="det-kv">
                  <span class="det-kv-key">Cliente</span>
                  <span class="det-kv-val">{{ wo.cliente }}</span>
                </div>
                <div v-if="wo.luogo" class="det-kv">
                  <span class="det-kv-key">Indirizzo</span>
                  <span class="det-kv-val">{{ wo.luogo }}</span>
                </div>
                <div v-if="wo.mapsLink" class="det-kv">
                  <span class="det-kv-key">Maps</span>
                  <a :href="wo.mapsLink" target="_blank" rel="noopener" class="det-kv-link">
                    <svg viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    Apri in Maps
                  </a>
                </div>
                <div class="det-kv">
                  <span class="det-kv-key">Apertura cantiere</span>
                  <span class="det-kv-val">{{ fmtDateLong(wo.date) }}</span>
                </div>
                <div v-if="wo.estimatedTime" class="det-kv">
                  <span class="det-kv-key">Durata stimata</span>
                  <span class="det-kv-val">{{ fmtEstTime(wo.estimatedTime) }}</span>
                </div>
                <div v-if="totalElapsedSecs > 0" class="det-kv">
                  <span class="det-kv-key">Ore tracciate</span>
                  <span class="det-kv-val det-mono">{{ fmtDur(totalElapsedSecs) }}</span>
                </div>
                <div v-if="wo.note" class="det-kv">
                  <span class="det-kv-key">Note</span>
                  <span class="det-kv-val">{{ wo.note }}</span>
                </div>
              </div>
            </div>

          </div><!-- /det-col-side -->

        </div><!-- /panoramica -->

        <!-- ══ TIMELINE ═══════════════════════════════════════════════ -->
        <div v-else-if="activeTab === 'timeline'" class="det-tab-placeholder">
          <div class="det-tab-placeholder-inner">
            <svg viewBox="0 0 24 24"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            <div>Timeline dettagliata</div>
            <div class="det-tab-placeholder-sub">{{ linkedActivities.length }} sessioni registrate</div>
          </div>
        </div>

        <!-- ══ GPS ════════════════════════════════════════════════════ -->
        <div v-else-if="activeTab === 'gps'" class="det-tab-placeholder">
          <div class="det-tab-placeholder-inner">
            <svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
            <div>GPS &amp; Tracce</div>
            <div class="det-tab-placeholder-sub">Mappa completa del percorso</div>
          </div>
        </div>

        <!-- ══ FOTO ════════════════════════════════════════════════════ -->
        <div v-else-if="activeTab === 'foto'" class="det-foto-tab">
          <div class="det-section-head" style="padding: 20px 24px 12px;">
            <span class="det-section-title">Foto cantiere</span>
            <span class="det-section-sub">{{ allPhotos.length }} foto</span>
          </div>
          <div v-if="!allPhotos.length" class="det-tab-placeholder">
            <div class="det-tab-placeholder-inner">
              <svg viewBox="0 0 24 24"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              <div>Nessuna foto</div>
            </div>
          </div>
          <div v-else class="det-foto-grid">
            <div
              v-for="p in allPhotos"
              :key="p.ts"
              class="det-foto-item"
              @click="openPhoto(p.src)"
            >
              <img :src="p.src" alt="Foto" loading="lazy" />
              <div class="det-foto-ts">{{ fmtTime(p.ts) }}</div>
            </div>
          </div>
        </div>

        <!-- ══ NOTE ════════════════════════════════════════════════════ -->
        <div v-else-if="activeTab === 'note'" class="det-note-tab">
          <div class="det-section-head" style="padding: 20px 24px 12px;">
            <span class="det-section-title">Note tecniche</span>
          </div>
          <div v-if="!dayNote" class="det-tab-placeholder">
            <div class="det-tab-placeholder-inner">
              <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              <div>Nessuna nota per questo giorno</div>
            </div>
          </div>
          <div v-else style="padding: 0 24px 24px;">
            <div class="det-note-card det-note-card-lg">
              <div class="det-note-text">{{ dayNote }}</div>
              <div class="det-note-meta">
                <div class="det-note-avatar">N</div>
                <span class="det-note-date">{{ fmtDateLong(wo.date) }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- ══ COSTI ═══════════════════════════════════════════════════ -->
        <div v-else-if="activeTab === 'costi'" class="det-costi-tab">
          <div class="det-costi-head">
            <span class="det-section-title">Costi · preventivo vs consuntivo</span>
            <span v-if="totalElapsedSecs > 0" class="det-section-sub">Aggiornato {{ fmtRelTime(Date.now()) }}</span>
          </div>
          <div class="det-costi-grid">

            <!-- Viaggio -->
            <div class="det-costo-card" :class="{ overbudget: isOverBudget(wo.travelCostActual, wo.travelCostEstimate) }">
              <div class="det-costo-label">VIAGGIO</div>
              <div class="det-costo-actual">{{ fmtEur(wo.travelCostActual) }}</div>
              <div class="det-costo-budget">/ {{ fmtEur(wo.travelCostEstimate) }} previsto</div>
              <div class="det-costo-bar">
                <div class="det-costo-fill" :class="{ over: isOverBudget(wo.travelCostActual, wo.travelCostEstimate) }" :style="{ width: `${costPct(wo.travelCostActual, wo.travelCostEstimate)}%` }" />
              </div>
              <div class="det-costo-status" :class="{ err: isOverBudget(wo.travelCostActual, wo.travelCostEstimate) }">
                {{ costOverPct(wo.travelCostActual, wo.travelCostEstimate) || '—' }}
              </div>
            </div>

            <!-- Pranzo -->
            <div class="det-costo-card" :class="{ overbudget: isOverBudget(wo.lunchCostActual, wo.lunchCostEstimate) }">
              <div class="det-costo-label">PRANZO</div>
              <div class="det-costo-actual">{{ fmtEur(wo.lunchCostActual) }}</div>
              <div class="det-costo-budget">/ {{ fmtEur(wo.lunchCostEstimate) }} previsto</div>
              <div class="det-costo-bar">
                <div class="det-costo-fill" :class="{ over: isOverBudget(wo.lunchCostActual, wo.lunchCostEstimate) }" :style="{ width: `${costPct(wo.lunchCostActual, wo.lunchCostEstimate)}%` }" />
              </div>
              <div class="det-costo-status" :class="{ err: isOverBudget(wo.lunchCostActual, wo.lunchCostEstimate) }">
                {{ costOverPct(wo.lunchCostActual, wo.lunchCostEstimate) || '—' }}
              </div>
            </div>

            <!-- Materiale -->
            <div class="det-costo-card" :class="{ overbudget: isOverBudget(wo.materialCostActual, wo.materialCostEstimate) }">
              <div class="det-costo-label">MATERIALE</div>
              <div class="det-costo-actual">{{ fmtEur(wo.materialCostActual) }}</div>
              <div class="det-costo-budget">/ {{ fmtEur(wo.materialCostEstimate) }} previsto</div>
              <div class="det-costo-bar">
                <div class="det-costo-fill" :class="{ over: isOverBudget(wo.materialCostActual, wo.materialCostEstimate) }" :style="{ width: `${costPct(wo.materialCostActual, wo.materialCostEstimate)}%` }" />
              </div>
              <div class="det-costo-status" :class="{ err: isOverBudget(wo.materialCostActual, wo.materialCostEstimate) }">
                {{ costOverPct(wo.materialCostActual, wo.materialCostEstimate) || '—' }}
              </div>
            </div>

            <!-- Ore squadra -->
            <div class="det-costo-card" :class="{ overbudget: isOverBudget(wo.externalTeamCost, wo.budget) }">
              <div class="det-costo-label">ORE SQUADRA</div>
              <div class="det-costo-actual">{{ fmtEur(wo.externalTeamCost) }}</div>
              <div class="det-costo-budget">/ {{ fmtEur(wo.budget) }} budget</div>
              <div class="det-costo-bar">
                <div class="det-costo-fill" :class="{ over: isOverBudget(wo.externalTeamCost, wo.budget) }" :style="{ width: `${costPct(wo.externalTeamCost, wo.budget)}%` }" />
              </div>
              <div class="det-costo-status" :class="{ err: isOverBudget(wo.externalTeamCost, wo.budget) }">
                {{ costOverPct(wo.externalTeamCost, wo.budget) || '—' }}
              </div>
            </div>

          </div>
        </div>

        <!-- ══ DOCUMENTI ═══════════════════════════════════════════════ -->
        <div v-else class="det-tab-placeholder">
          <div class="det-tab-placeholder-inner">
            <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
            <div>Documenti</div>
            <div class="det-tab-placeholder-sub">Allegati e file relativi a questa lavorazione</div>
          </div>
        </div>

      </div><!-- /det-content -->

    </template>

  </div><!-- /det-view -->
</template>

<style scoped lang="scss">
.det-view {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  padding: 0 !important;
}

.det-not-found {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  color: var(--muted);

  svg {
    width: 40px;
    height: 40px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    opacity: .5;
  }

  button {
    padding: 8px 20px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-family: var(--ff);
    font-size: 13px;
    color: var(--ink-2);
    cursor: pointer;
    margin-top: 4px;
    transition: background .12s;

    &:hover { background: var(--surface-2); }
  }
}

// ── Topbar ────────────────────────────────────────────────────────────
.det-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 28px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.det-top-left { flex: 1; min-width: 0; }
.det-top-right {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.det-breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 6px;
  font-size: 12px;
}

.det-back-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
  padding: 0;
  margin-right: 2px;
  transition: color .1s;
  flex-shrink: 0;

  &:hover { color: var(--ink); }

  svg {
    width: 16px;
    height: 16px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

.det-bc-link {
  background: transparent;
  border: none;
  cursor: pointer;
  font-family: var(--ff);
  font-size: 12px;
  color: var(--muted);
  padding: 0;
  transition: color .1s;

  &:hover { color: var(--ink); }
}

.det-bc-sep { color: var(--muted); }
.det-bc-cur { color: var(--ink-2); font-weight: 500; }

.det-title-row { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }

.det-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--ink);
  margin: 0;
  line-height: 1.2;
}

.det-cliente { font-size: 14px; color: var(--muted); }

.det-btn-ghost {
  height: 32px;
  padding: 0 14px;
  border: 1px solid var(--border);
  background: transparent;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 500;
  color: var(--ink-2);
  cursor: pointer;
  transition: all .12s;

  &:hover { background: var(--surface-2); }
}

.det-btn-icon {
  width: 32px;
  height: 32px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  svg { width: 14px; height: 14px; fill: currentColor; stroke: none; }
}

.det-stato-wrap { position: relative; }

.det-btn-fill {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 32px;
  padding: 0 14px;
  background: var(--ink);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--ff);
  font-size: 12px;
  font-weight: 600;
  color: var(--bg);
  cursor: pointer;
  transition: opacity .12s;

  &:hover { opacity: .88; }

  svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
}

.det-stato-menu {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: 0 8px 24px rgba(0,0,0,.3);
  z-index: 200;
  min-width: 160px;
  overflow: hidden;
}

.det-stato-menu-title {
  padding: 8px 14px 4px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .8px;
  text-transform: uppercase;
  color: var(--muted);
}

.det-stato-opt {
  display: block;
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
  &.active { color: var(--primary-ink); font-weight: 600; }
}

.det-bell {
  width: 32px;
  height: 32px;
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

  svg { width: 14px; height: 14px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
}

// ── Hero card ─────────────────────────────────────────────────────────
.det-hero {
  padding: 16px 28px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border);
}

.det-hero-inner {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px 24px;
}

.det-hero-meta {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 14px;
}

.det-hero-badges { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

.det-stato-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid transparent;

  &.stato-in-corso      { background: var(--live-soft);    color: var(--live);        border-color: color-mix(in srgb, var(--live) 30%, transparent); }
  &.stato-in-viaggio    { background: rgba(45,91,255,.1);  color: var(--primary-ink); border-color: rgba(45,91,255,.3); }
  &.stato-assegnato     { background: rgba(45,91,255,.1);  color: var(--primary-ink); border-color: rgba(45,91,255,.3); }
  &.stato-pianificato   { background: var(--surface-2);    color: var(--muted);       border-color: var(--border-strong); }
  &.stato-da-verificare { background: rgba(245,165,36,.1); color: var(--live);        border-color: rgba(245,165,36,.3); }
  &.stato-bloccato      { background: var(--err-soft);     color: var(--err);         border-color: rgba(220,38,38,.3); }
  &.stato-completato    { background: var(--ok-soft);      color: var(--ok-ink);      border-color: rgba(31,157,85,.3); }
}

.det-stato-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;

  .stato-in-corso & { animation: blink 1s infinite; }
}

.det-pri-badge {
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  border: 1px solid;
}

.det-loc-badge {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: var(--muted);

  svg { width: 12px; height: 12px; stroke: var(--muted); fill: none; stroke-width: 1.8; stroke-linecap: round; }
}

.det-scad-wrap { text-align: right; }
.det-scad-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; color: var(--muted); margin-bottom: 2px; }
.det-scad-date  { font-size: 15px; font-weight: 700; color: var(--ink); }
.det-scad-countdown { font-size: 11px; color: var(--live); font-weight: 600; margin-top: 2px; }

.det-hero-title { font-size: 18px; font-weight: 700; color: var(--ink); line-height: 1.3; margin-bottom: 4px; }
.det-hero-sub   { font-size: 13px; color: var(--muted); line-height: 1.5; }

// ── Live session block ────────────────────────────────────────────────
.det-live-block {
  margin-top: 16px;
  background: rgba(245, 165, 36, .07);
  border: 1px solid rgba(245, 165, 36, .25);
  border-radius: var(--radius-sm);
  padding: 16px 20px;
}

.det-live-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
}

.det-live-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--live);
  animation: blink 1s infinite;
  flex-shrink: 0;
}

.det-live-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: var(--live);
}

.det-live-body {
  display: flex;
  align-items: baseline;
  gap: 20px;
  margin-bottom: 12px;
}

.det-live-timer {
  font-family: var(--ff-mono);
  font-size: 32px;
  font-weight: 700;
  color: var(--ink);
  letter-spacing: -1px;
}

.det-live-meta { font-size: 12px; color: var(--muted); }

.det-live-progress-wrap {
  display: flex;
  align-items: center;
  gap: 10px;
}

.det-live-progress-label { font-size: 11px; color: var(--muted); flex-shrink: 0; }

.det-live-progress-bar {
  flex: 1;
  height: 4px;
  background: rgba(245,165,36,.2);
  border-radius: 2px;
  overflow: hidden;
}

.det-live-progress-fill {
  height: 100%;
  background: var(--live);
  border-radius: 2px;
  transition: width .5s;
}

.det-live-progress-pct { font-size: 11px; font-family: var(--ff-mono); color: var(--live); font-weight: 600; flex-shrink: 0; width: 36px; text-align: right; }

// ── Tabs ──────────────────────────────────────────────────────────────
.det-tabs {
  display: flex;
  align-items: center;
  padding: 0 28px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
  overflow-x: auto;
  scrollbar-width: none;
  &::-webkit-scrollbar { display: none; }
}

.det-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 11px 14px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  white-space: nowrap;
  margin-bottom: -1px;
  transition: all .12s;

  &:hover { color: var(--ink); }

  &.active {
    color: var(--ink);
    font-weight: 600;
    border-bottom-color: var(--primary);
  }
}

.det-tab-cnt {
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

// ── Content area ──────────────────────────────────────────────────────
.det-content {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
}

// ── Panoramica ────────────────────────────────────────────────────────
.det-panoramica {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: 0;
  min-height: 100%;
}

.det-col-main {
  padding: 20px 24px;
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.det-col-side {
  padding: 20px 20px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

// ── Sections ──────────────────────────────────────────────────────────
.det-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.det-section-title { font-size: 13px; font-weight: 700; color: var(--ink); }
.det-section-sub   { font-size: 12px; color: var(--muted); }

.det-link-btn {
  background: transparent;
  border: none;
  font-family: var(--ff);
  font-size: 12px;
  color: var(--primary-ink);
  cursor: pointer;
  padding: 0;
  transition: opacity .1s;

  &:hover { opacity: .8; }
}

.det-empty-sm {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--muted);
  padding: 12px 0;

  svg { width: 16px; height: 16px; stroke: var(--muted); fill: none; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; opacity: .5; flex-shrink: 0; }
}

// ── Activity feed ─────────────────────────────────────────────────────
.det-feed { display: flex; flex-direction: column; gap: 2px; }

.det-feed-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  transition: background .1s;

  &:hover { background: var(--surface); }
}

.det-feed-avatar {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
}

.det-feed-body { flex: 1; min-width: 0; }

.det-feed-main {
  font-size: 13px;
  color: var(--ink-2);
  line-height: 1.4;
}

.det-feed-act { font-weight: 600; }
.det-feed-detail { color: var(--muted); }

.det-feed-live {
  display: inline-block;
  background: var(--live-soft);
  color: var(--live);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: .5px;
  padding: 1px 6px;
  border-radius: 6px;
  margin-left: 6px;
  vertical-align: middle;
}

.det-feed-time {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
  font-family: var(--ff-mono);
}

.det-feed-rel { font-family: var(--ff); color: var(--muted); }

.det-feed-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 2px solid var(--border-strong);
  background: transparent;
  flex-shrink: 0;
  margin-top: 10px;

  &.live {
    background: var(--live);
    border-color: var(--live);
    animation: blink 1s infinite;
  }
}

// ── Photo grid ────────────────────────────────────────────────────────
.det-photo-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 6px;
}

.det-photo-thumb {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--surface-2);

  &:hover img { transform: scale(1.04); }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform .2s;
  }
}

.det-photo-ts {
  position: absolute;
  bottom: 4px;
  right: 4px;
  font-size: 9px;
  font-family: var(--ff-mono);
  color: #fff;
  background: rgba(0,0,0,.55);
  padding: 1px 5px;
  border-radius: 3px;
}

// ── Notes ─────────────────────────────────────────────────────────────
.det-note-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 14px 16px;

  &.det-note-card-lg { padding: 20px; }
}

.det-note-text { font-size: 13px; color: var(--ink-2); line-height: 1.6; margin-bottom: 12px; }

.det-note-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}

.det-note-avatar {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-ink);
  font-size: 10px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.det-note-date { font-size: 11px; color: var(--muted); }

// ── Squadra ───────────────────────────────────────────────────────────
.det-icon-add {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border);
  border-radius: var(--radius-xs);
  background: transparent;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--muted);
  transition: all .1s;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 2.5; stroke-linecap: round; }
}

.det-squadra-list { display: flex; flex-direction: column; gap: 8px; }

.det-operatore {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
}

.det-op-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.det-op-info { flex: 1; min-width: 0; }
.det-op-name { font-size: 13px; font-weight: 600; color: var(--ink); }
.det-op-role { font-size: 11px; color: var(--muted); }

.det-op-live {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--live);
  font-weight: 600;
}

.det-op-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
  animation: blink 1s infinite;
}

// ── Map placeholder ───────────────────────────────────────────────────
.det-map-placeholder {
  position: relative;
  height: 160px;
  background: #0E1620;
  border-radius: var(--radius-sm);
  overflow: hidden;
  border: 1px solid var(--border);
  margin-bottom: 8px;
}

.det-map-grid {
  position: absolute;
  inset: 0;
  background-image:
    repeating-linear-gradient(0deg, rgba(255,255,255,.03) 0 1px, transparent 1px 40px),
    repeating-linear-gradient(90deg, rgba(255,255,255,.03) 0 1px, transparent 1px 40px);
}

.det-map-route {
  position: absolute;
  top: 30%;
  left: 15%;
  right: 25%;
  height: 2px;
  background: linear-gradient(90deg, var(--live) 60%, transparent);
  border-radius: 1px;
  opacity: .7;
  border-top: 1px dashed var(--live);
}

.det-map-pin {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.det-map-pin-start {
  top: 22%;
  left: 12%;
}

.det-map-pin-now {
  top: 18%;
  right: 22%;
}

.det-map-pin-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--live);
  border: 2px solid rgba(255,255,255,.4);
}

.det-map-pin-avatar {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--live);
  border: 2px solid #fff;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
}

.det-map-pin-label {
  font-size: 9px;
  color: var(--ink-2);
  background: rgba(0,0,0,.5);
  padding: 1px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.det-map-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);

  svg { width: 20px; height: 20px; stroke: var(--muted); fill: none; stroke-width: 1.5; opacity: .4; }
}

.det-map-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.det-map-stat {
  padding: 8px 10px;
  border-right: 1px solid var(--border);
  text-align: center;

  &:last-child { border-right: none; }
}

.det-map-stat-val   { font-size: 13px; font-weight: 700; color: var(--ink); margin-bottom: 2px; font-family: var(--ff-mono); }
.det-map-stat-label { font-size: 9px; font-weight: 700; letter-spacing: .8px; text-transform: uppercase; color: var(--muted); }

// ── Key-value list ────────────────────────────────────────────────────
.det-kv-list { display: flex; flex-direction: column; gap: 0; }

.det-kv {
  display: flex;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);

  &:last-child { border-bottom: none; }
}

.det-kv-key  { font-size: 11px; color: var(--muted); width: 110px; flex-shrink: 0; padding-top: 1px; }
.det-kv-val  { font-size: 13px; color: var(--ink-2); flex: 1; line-height: 1.4; }
.det-mono    { font-family: var(--ff-mono); }

.det-kv-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13px;
  color: var(--primary-ink);
  text-decoration: none;
  transition: opacity .1s;

  &:hover { opacity: .8; }

  svg { width: 12px; height: 12px; stroke: currentColor; fill: none; stroke-width: 1.8; stroke-linecap: round; }
}

// ── GPS badge ─────────────────────────────────────────────────────────
.det-gps-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  color: var(--live);
  font-weight: 600;
}

.det-gps-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--live);
}

// ── Tab placeholders ──────────────────────────────────────────────────
.det-tab-placeholder {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 60px 24px;
}

.det-tab-placeholder-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 15px;
  font-weight: 500;

  svg {
    width: 36px;
    height: 36px;
    stroke: var(--muted);
    fill: none;
    stroke-width: 1.5;
    stroke-linecap: round;
    stroke-linejoin: round;
    opacity: .4;
    margin-bottom: 4px;
  }
}

.det-tab-placeholder-sub { font-size: 12px; color: var(--muted); font-weight: 400; }

// ── Foto tab ──────────────────────────────────────────────────────────
.det-foto-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 8px;
  padding: 0 24px 24px;
}

.det-foto-item {
  position: relative;
  aspect-ratio: 1;
  border-radius: var(--radius-sm);
  overflow: hidden;
  cursor: pointer;
  background: var(--surface-2);

  &:hover img { transform: scale(1.04); }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    transition: transform .2s;
  }
}

.det-foto-ts {
  position: absolute;
  bottom: 4px;
  left: 4px;
  font-size: 9px;
  font-family: var(--ff-mono);
  color: #fff;
  background: rgba(0,0,0,.6);
  padding: 1px 5px;
  border-radius: 3px;
}

// ── Costi tab ─────────────────────────────────────────────────────────
.det-costi-tab { padding: 0; }

.det-costi-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--border);
}

.det-costi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0;
  padding: 24px;
  gap: 16px;
}

.det-costo-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 18px 20px;

  &.overbudget { border-color: rgba(220,38,38,.3); }
}

.det-costo-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .8px;
  text-transform: uppercase;
  color: var(--muted);
  margin-bottom: 8px;
}

.det-costo-actual {
  font-size: 22px;
  font-weight: 700;
  color: var(--ink);
  font-family: var(--ff-mono);
  margin-bottom: 2px;
}

.det-costo-budget { font-size: 11px; color: var(--muted); margin-bottom: 12px; }

.det-costo-bar {
  height: 4px;
  background: var(--surface-3);
  border-radius: 2px;
  overflow: hidden;
  margin-bottom: 8px;
}

.det-costo-fill {
  height: 100%;
  background: var(--ok);
  border-radius: 2px;
  transition: width .4s;

  &.over { background: var(--err); }
}

.det-costo-status {
  font-size: 11px;
  color: var(--ok-ink);
  font-weight: 600;

  &.err { color: var(--err); }
}

// ── Note tab ──────────────────────────────────────────────────────────
.det-note-tab { padding: 0; }

@media (min-width: 800px) {
  .det-breadcrumb         { font-size: 14px; }
  .det-bc-link            { font-size: 14px; }
  .det-title              { font-size: 22px; }
  .det-cliente            { font-size: 16px; }
  .det-btn-ghost          { font-size: 14px; }
  .det-btn-fill           { font-size: 14px; }
  .det-stato-opt          { font-size: 15px; }
  .det-stato-badge        { font-size: 14px; }
  .det-loc-badge          { font-size: 14px; }
  .det-scad-date          { font-size: 17px; }
  .det-scad-countdown     { font-size: 13px; }
  .det-hero-title         { font-size: 20px; }
  .det-hero-sub           { font-size: 15px; }
  .det-live-meta          { font-size: 14px; }
  .det-live-progress-label { font-size: 13px; }
  .det-live-progress-pct  { font-size: 13px; }
  .det-tab                { font-size: 15px; }
  .det-section-title      { font-size: 15px; }
  .det-section-sub        { font-size: 14px; }
  .det-link-btn           { font-size: 14px; }
  .det-empty-sm           { font-size: 14px; }
  .det-feed-main          { font-size: 15px; }
  .det-feed-time          { font-size: 13px; }
  .det-map-empty          { font-size: 14px; }
  .det-map-stat-val       { font-size: 15px; }
  .det-kv-key             { font-size: 13px; }
  .det-kv-val             { font-size: 15px; }
  .det-kv-link            { font-size: 15px; }
  .det-gps-badge          { font-size: 13px; }
  .det-tab-placeholder-inner { font-size: 17px; }
  .det-tab-placeholder-sub { font-size: 14px; }
  .det-costo-actual       { font-size: 24px; }
  .det-costo-budget       { font-size: 13px; }
  .det-costo-status       { font-size: 13px; }
  .det-note-text          { font-size: 15px; }
  .det-note-date          { font-size: 13px; }
  .det-op-name            { font-size: 15px; }
  .det-op-role            { font-size: 13px; }
  .det-op-live            { font-size: 13px; }
}
</style>
