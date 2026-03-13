<script setup lang="ts">
/**
 * app.vue – Root component dell'applicazione
 * ─────────────────────────────────────────────────────────────────────
 * Struttura dell'app (rispecchia l'originale index.html):
 *
 *   #app
 *   ├── AppSidebar        (solo desktop, v-if="isDesktop")
 *   ├── #views-wrap
 *   │   ├── TimerView     (sempre presente, v-show="...")
 *   │   ├── SummaryView   (solo desktop, v-show="...")
 *   │   └── DashboardView (solo desktop, v-show="...")
 *   ├── AppBottomNav      (solo mobile, v-if="!isDesktop")
 *   │
 *   │   — Overlay globali (sempre nel DOM) —
 *   ├── ActivityModal
 *   ├── AppGpsLoader
 *   ├── AppLightbox
 *   └── AppToast
 *
 * La navigazione tra viste è gestita tramite v-show per mantenere
 * lo stato DOM (Leaflet, Chart.js) tra i cambi di vista senza
 * dover reinizializzare ogni volta.
 */
import { onMounted, onUnmounted } from 'vue'
import { useAppState } from '~/composables/useAppState'
import { useStore }    from '~/composables/useStore'

const { currentView, isDesktop, updateLayout } = useAppState()
const store = useStore()

onMounted(() => {
  // Imposta il layout iniziale e aggiorna al resize
  updateLayout()
  window.addEventListener('resize', updateLayout)

  // Sincronizzazione iniziale con GitHub Gist (no-op se non configurato)
  store.initSync()
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayout)
})
</script>

<template>
  <div id="app">

    <!-- Sidebar: visibile solo su desktop ─────────────────────── -->
    <AppSidebar v-if="isDesktop" />

    <!-- Area viste scrollabile ────────────────────────────────── -->
    <div id="views-wrap">
      <!--
        v-show invece di v-if: il DOM rimane montato per tutte le viste
        così Leaflet e Chart.js non vengono distrutti al cambio di vista.
      -->
      <TimerView     v-show="currentView === 'timer'" />
      <SummaryView   v-show="currentView === 'summary'" />
      <DashboardView v-show="currentView === 'dashboard'" />
    </div>

    <!-- Bottom nav: visibile solo su mobile ────────────────────── -->
    <AppBottomNav v-if="!isDesktop" />

    <!-- ─── Overlay globali ──────────────────────────────────────
         Sempre nel DOM (indipendenti dalla vista attiva)
         ────────────────────────────────────────────────────────── -->

    <!-- Modal bottom sheet per l'inserimento di una nuova attività -->
    <ActivityModal />

    <!-- Overlay spinner durante l'acquisizione GPS -->
    <AppGpsLoader />

    <!-- Lightbox foto a schermo intero -->
    <AppLightbox />

    <!-- Toast notification temporanea in cima -->
    <AppToast />

    <!-- Modal impostazioni GitHub Gist -->
    <GistSettingsModal />

  </div>
</template>
