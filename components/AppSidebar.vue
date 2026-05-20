<script setup lang="ts">
import { useAppState } from '~/composables/useAppState'
import { useAuth }     from '~/composables/useAuth'
import { useStore }    from '~/composables/useStore'

const appState = useAppState()
const auth     = useAuth()
const store    = useStore()

const { currentView, navigate, openWorkspaceModal } = appState

async function handleLogout(): Promise<void> {
  if (!confirm('Sei sicuro di voler uscire dall\'app?')) return
  store.clearWorkspace()
  appState.clearActiveWorkspace()
  await auth.logout()
}

const userDisplayName = computed(() => auth.currentUser.value?.displayName || auth.currentUser.value?.email || 'Utente')
const userInitials = computed(() => {
  const name = auth.currentUser.value?.displayName || auth.currentUser.value?.email || 'U'
  return name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
})
const workspaceName = computed(() => appState.activeWorkspaceName.value || 'Workspace')

import { computed } from 'vue'
</script>

<template>
  <aside id="sidebar">

    <!-- ── Logo / Brand ──────────────────────────────────────────── -->
    <div class="sb-brand">
      <div class="sb-logo">P</div>
      <div class="sb-brand-name">Posatrack</div>
      <button class="sb-search-btn" title="Cerca">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
      </button>
    </div>

    <!-- ── New lavorazione CTA ──────────────────────────────────── -->
    <div class="sb-cta-wrap">
      <button class="sb-cta-btn" @click="navigate('planning')">
        <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        Nuova lavorazione
      </button>
    </div>

    <!-- ── Navigation ─────────────────────────────────────────────── -->
    <nav class="sb-nav">

      <button class="sb-nav-item" :class="{ active: currentView === 'dashboard' }" @click="navigate('dashboard')">
        <svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/></svg>
        Dashboard
      </button>

      <button class="sb-nav-item" :class="{ active: currentView === 'summary' }" @click="navigate('summary')">
        <svg viewBox="0 0 24 24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        Lavorazioni
        <span v-if="store.syncStatus.value === 'ok'" class="sb-badge sb-badge-live">live</span>
      </button>

      <button class="sb-nav-item sb-nav-disabled">
        <svg viewBox="0 0 24 24"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
        Live map
      </button>

      <button class="sb-nav-item" :class="{ active: currentView === 'planning' }" @click="navigate('planning')">
        <svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
        Pianificazione
      </button>

      <button class="sb-nav-item sb-nav-disabled">
        <svg viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>
        Squadre
      </button>

      <button class="sb-nav-item sb-nav-disabled">
        <svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
        Report
      </button>

    </nav>

    <!-- ── Workspace section ──────────────────────────────────────── -->
    <div class="sb-section-label">WORKSPACE</div>
    <div class="sb-workspace-items">
      <button class="sb-nav-item" @click="openWorkspaceModal">
        <svg viewBox="0 0 24 24"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        Priorità urgenti
      </button>
      <button class="sb-nav-item sb-nav-disabled">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Ritardi
      </button>
      <button class="sb-nav-item sb-nav-disabled">
        <svg viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
        Esportazioni
      </button>
    </div>

    <div class="sb-spacer" />

    <!-- ── Sync status ─────────────────────────────────────────────── -->
    <div class="sb-sync">
      <span class="sb-sync-dot" :class="store.syncStatus.value" />
      <span class="sb-sync-text">
        <template v-if="store.syncStatus.value === 'syncing'">Connessione…</template>
        <template v-else-if="store.syncStatus.value === 'error'">Errore sync</template>
        <template v-else>Sync live attivo</template>
      </span>
    </div>

    <!-- ── User / workspace footer ───────────────────────────────── -->
    <div class="sb-user" v-if="auth.currentUser.value">
      <div class="sb-user-avatar">
        <img v-if="auth.currentUser.value.photoURL"
             :src="auth.currentUser.value.photoURL"
             :alt="userDisplayName"
             referrerpolicy="no-referrer" />
        <span v-else>{{ userInitials }}</span>
      </div>
      <div class="sb-user-info">
        <div class="sb-user-name">{{ userDisplayName }}</div>
        <div class="sb-user-ws">{{ workspaceName }}</div>
      </div>
      <button class="sb-user-settings" @click="openWorkspaceModal" title="Impostazioni workspace">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
      </button>
    </div>

  </aside>
</template>

<style scoped lang="scss">
#sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  flex-shrink: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
  overflow-x: hidden;
}

// ── Brand ─────────────────────────────────────────────────────────────
.sb-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 16px 14px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sb-logo {
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  background: var(--primary);
  color: #fff;
  font-size: 14px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.sb-brand-name {
  flex: 1;
  font-size: 15px;
  font-weight: 700;
  color: var(--ink);
}

.sb-search-btn {
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--muted);
  border-radius: var(--radius-xs);
  transition: color .12s, background .12s;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

// ── CTA ───────────────────────────────────────────────────────────────
.sb-cta-wrap {
  padding: 12px 12px 8px;
}

.sb-cta-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  transition: filter .12s;

  &:hover   { filter: brightness(1.1); }
  &:active  { filter: brightness(.9); }

  svg {
    width: 14px; height: 14px;
    stroke: currentColor; fill: none;
    stroke-width: 2.5; stroke-linecap: round;
  }
}

// ── Navigation ────────────────────────────────────────────────────────
.sb-nav {
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  gap: 1px;
}

.sb-nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: var(--ff);
  font-size: 13px;
  font-weight: 500;
  transition: background .12s, color .12s;
  text-align: left;
  width: 100%;

  &:hover { background: var(--surface-2); color: var(--ink); }

  &.active {
    background: var(--primary-soft);
    color: var(--primary-ink);
    font-weight: 600;
  }

  svg {
    width: 16px; height: 16px;
    stroke: currentColor; fill: none;
    stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
  }
}

.sb-nav-disabled {
  opacity: .45;
  cursor: default;
  pointer-events: none;
}

.sb-badge {
  margin-left: auto;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: .5px;
}

.sb-badge-live {
  background: var(--live-soft);
  color: var(--live);
}

// ── Section label ─────────────────────────────────────────────────────
.sb-section-label {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: var(--muted);
  padding: 12px 18px 4px;
}

.sb-workspace-items {
  display: flex;
  flex-direction: column;
  padding: 0 8px;
  gap: 1px;
}

// ── Spacer ────────────────────────────────────────────────────────────
.sb-spacer { flex: 1; }

// ── Sync ──────────────────────────────────────────────────────────────
.sb-sync {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 18px;
}

.sb-sync-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
  flex-shrink: 0;

  &.ok      { background: var(--ok); }
  &.error   { background: var(--err); }
  &.syncing { background: var(--live); animation: blink 1s infinite; }
  &.idle    { background: var(--muted); }
}

.sb-sync-text {
  font-size: 11px;
  color: var(--muted);
}

// ── User footer ───────────────────────────────────────────────────────
.sb-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 14px;
  border-top: 1px solid var(--border);
}

.sb-user-avatar {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  background: var(--primary-soft);
  color: var(--primary-ink);
  font-size: 11px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  img { width: 100%; height: 100%; object-fit: cover; }
}

.sb-user-info {
  flex: 1;
  overflow: hidden;
}

.sb-user-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--ink);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-user-ws {
  font-size: 10px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-user-settings {
  width: 26px; height: 26px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-xs);
  color: var(--muted);
  transition: color .12s, background .12s;
  flex-shrink: 0;

  &:hover { color: var(--ink); background: var(--surface-2); }

  svg {
    width: 13px; height: 13px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}
</style>
