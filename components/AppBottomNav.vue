<script setup lang="ts">
/**
 * AppBottomNav – Navigazione mobile (bottom bar)
 * ─────────────────────────────────────────────────────────────────────
 * Visibile solo su mobile (< 800px).
 * Su mobile l'app è uno strumento di registrazione in campo:
 * mostra SOLO il tab Timer. Il Riepilogo e la Dashboard sono
 * accessibili esclusivamente da desktop.
 */
import { useAppState } from '~/composables/useAppState'
import { useGistSync } from '~/composables/useGistSync'

const { currentView, navigate, openGistSettings } = useAppState()
const { syncStatus, isConfigured } = useGistSync()
</script>

<template>
  <nav id="bottom-nav">

    <!-- Unico tab su mobile: Timer -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'timer' }"
      @click="navigate('timer')"
    >
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      Timer
    </button>

    <!-- Impostazioni / Sync -->
    <button class="nav-tab nav-tab-settings" @click="openGistSettings">
      <div class="nav-tab-icon-wrap">
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/>
        </svg>
        <span class="nav-sync-dot" :class="isConfigured() ? syncStatus : 'idle'" />
      </div>
      Sync
    </button>

  </nav>
</template>

<style scoped lang="scss">
.nav-tab-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-sync-dot {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dim);
  border: 1.5px solid var(--surface);

  &.ok      { background: var(--green);  }
  &.error   { background: var(--red);    }
  &.syncing { background: var(--orange); animation: blink 1s infinite; }
  &.idle    { background: var(--dim);    }
}
</style>

<!-- Gli stili di #bottom-nav e .nav-tab sono in main.scss (globali)
     perché interagiscono con il layout dell'app shell. -->
