<script setup lang="ts">
import { useAppState } from '~/composables/useAppState'

const { currentView, navigate, openWorkspaceModal } = useAppState()
</script>

<template>
  <nav id="bottom-nav">

    <!-- Oggi -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'timer' }"
      @click="navigate('timer')"
    >
      <svg viewBox="0 0 24 24">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
      <span class="nav-tab-label">Oggi</span>
    </button>

    <!-- Lavori -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'summary' }"
      @click="navigate('summary')"
    >
      <svg viewBox="0 0 24 24">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <path d="M8 21h8M12 17v4"/>
      </svg>
      <span class="nav-tab-label">Lavori</span>
    </button>

    <!-- Mappa -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'map' }"
      @click="navigate('map')"
    >
      <svg viewBox="0 0 24 24">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
        <line x1="8" y1="2" x2="8" y2="18"/>
        <line x1="16" y1="6" x2="16" y2="22"/>
      </svg>
      <span class="nav-tab-label">Mappa</span>
    </button>

    <!-- Profilo -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'profile' }"
      @click="openWorkspaceModal()"
    >
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="4"/>
        <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
      <span class="nav-tab-label">Profilo</span>
    </button>

  </nav>
</template>

<style scoped lang="scss">
/* Stili globali #bottom-nav e .nav-tab sono in main.scss */
</style>
