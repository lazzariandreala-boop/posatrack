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

const { currentView, navigate } = useAppState()
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

  </nav>
</template>

<!-- Gli stili di #bottom-nav e .nav-tab sono in main.scss (globali)
     perché interagiscono con il layout dell'app shell. -->
