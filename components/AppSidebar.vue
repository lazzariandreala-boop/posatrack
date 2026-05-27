<script setup lang="ts">
/**
 * AppSidebar – Navigazione desktop
 * ─────────────────────────────────────────────────────────────────────
 * Visibile solo su desktop (≥ 800px). Contiene:
 *   - Brand / logo dell'app
 *   - Bottoni di navigazione
 *   - Stato sincronizzazione Firebase
 *   - Info utente + workspace
 *   - Bottone logout
 */
import { useAppState } from '~/composables/useAppState'
import { useAuth }     from '~/composables/useAuth'
import { useStore }    from '~/composables/useStore'

const appState = useAppState()
const auth     = useAuth()
const store    = useStore()

const { currentView, navigate } = appState

async function handleLogout(): Promise<void> {
  if (!confirm('Sei sicuro di voler uscire dall\'app?')) return
  store.clearWorkspace()
  appState.clearActiveWorkspace()
  await auth.logout()
}
</script>

<template>
  <aside id="sidebar">

    <!-- Brand ────────────────────────────────────────────────────── -->
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">🏗 PosaTrack</div>
      <div class="sidebar-brand-sub" style="margin-bottom: 10px;">Gestione Cantiere</div>
      <img src="../Logo.png" alt="Pozza Logo" width="200" height="150" />
    </div>

    <!-- Navigazione ──────────────────────────────────────────────── -->
    <nav class="sidebar-nav">

      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'timer' }"
        @click="navigate('timer')"
      >
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
        Timer &amp; Attività
      </button>

      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'summary' }"
        @click="navigate('summary')"
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        Riepilogo giornata
      </button>

      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'dashboard' }"
        @click="navigate('dashboard')"
      >
        <svg viewBox="0 0 24 24">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6"  y1="20" x2="6"  y2="14"/>
        </svg>
        Dashboard
      </button>

      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'planning' }"
        @click="navigate('planning')"
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2"/>
          <path d="M16 2v4M8 2v4M3 10h18"/>
          <line x1="8" y1="14" x2="8" y2="14" stroke-linecap="round" stroke-width="2.5"/>
          <line x1="12" y1="14" x2="16" y2="14"/>
          <line x1="8" y1="18" x2="8" y2="18" stroke-linecap="round" stroke-width="2.5"/>
          <line x1="12" y1="18" x2="16" y2="18"/>
        </svg>
        Pianificazione
      </button>

    </nav>

    <!-- Bottom: sync + workspace + utente ────────────────────────── -->
    <div class="sidebar-bottom">

      <!-- Stato connessione Firestore (solo indicatore, nessuna azione manuale) -->
      <div class="sidebar-sync-status">
        <svg viewBox="0 0 24 24">
          <polyline points="23 4 23 10 17 10"/>
          <polyline points="1 20 1 14 7 14"/>
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/>
        </svg>
        <span v-if="store.syncStatus.value === 'syncing'">Connessione…</span>
        <span v-else-if="store.syncStatus.value === 'error'" class="sync-err">Errore connessione</span>
        <span v-else>Sincronizzazione live</span>
        <span class="sync-badge" :class="store.syncStatus.value" />
      </div>

      <!-- Utente loggato ──────────────────────────────────────────── -->
      <div v-if="auth.currentUser.value" class="sidebar-user">
        <div class="sidebar-user-avatar">
          <img
            v-if="auth.currentUser.value.photoURL"
            :src="auth.currentUser.value.photoURL"
            :alt="auth.currentUser.value.displayName"
            referrerpolicy="no-referrer"
          />
          <span v-else>{{ auth.currentUser.value.displayName[0]?.toUpperCase() }}</span>
        </div>
        <div class="sidebar-user-info">
          <div class="sidebar-user-name">{{ auth.currentUser.value.displayName }}</div>
          <div class="sidebar-user-email">{{ auth.currentUser.value.email }}</div>
        </div>
        <button class="sidebar-logout-btn" @click="handleLogout" title="Esci">
          <svg viewBox="0 0 24 24">
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
          </svg>
        </button>
      </div>

    </div>

    <div class="sidebar-version">v3.1 · PosaTrack · Firebase</div>

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
}

.sidebar-brand {
  padding: 28px 20px 22px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-brand-name {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 30px;
  font-weight: 900;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 1px;
  line-height: 1;
}

.sidebar-brand-sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  letter-spacing: .4px;
}

.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 14px 10px;
  gap: 3px;
  flex: 1;
}

.sidebar-nav-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  transition: background .12s, color .12s;
  text-align: left;
  width: 100%;

  &:hover { background: var(--surface2); color: var(--text); }

  &.active {
    background: rgba(255, 95, 0, .13);
    color: var(--orange);
    font-weight: 600;
  }

  svg {
    width: 18px; height: 18px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
  }
}

.sidebar-bottom {
  padding: 10px 10px 6px;
  border-top: 1px solid var(--border);
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

// ── Sync button ──────────────────────────────────────────────────────
.sidebar-sync-status {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 9px 14px;
  border-radius: 10px;
  color: var(--dim);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
    flex-shrink: 0;
  }

  .sync-err { color: var(--red); }
}

.sync-badge {
  width: 7px; height: 7px;
  border-radius: 50%;
  margin-left: auto;
  flex-shrink: 0;
  background: var(--dim);

  &.ok      { background: var(--green);  }
  &.error   { background: var(--red);    }
  &.syncing { background: var(--orange); animation: blink 1s infinite; }
  &.idle    { background: var(--dim);    }
}

// ── Workspace button ─────────────────────────────────────────────────
.sidebar-ws-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// ── User row ─────────────────────────────────────────────────────────
.sidebar-user {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  margin-top: 4px;
  border-top: 1px solid var(--border);
}

.sidebar-user-avatar {
  width: 32px; height: 32px;
  border-radius: 50%;
  background: rgba(255,95,0,.2);
  color: var(--orange);
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  img { width: 100%; height: 100%; object-fit: cover; }
}

.sidebar-user-info {
  flex: 1;
  overflow: hidden;
}

.sidebar-user-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-user-email {
  font-size: 11px;
  color: var(--dim);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sidebar-logout-btn {
  width: 28px; height: 28px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--r-sm);
  color: var(--muted);
  transition: color .12s, background .12s;
  flex-shrink: 0;

  &:hover { color: var(--red); background: rgba(239,68,68,.1); }

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.sidebar-version {
  padding: 10px 20px 14px;
  font-size: 11px;
  color: var(--dim);
  flex-shrink: 0;
}
</style>
