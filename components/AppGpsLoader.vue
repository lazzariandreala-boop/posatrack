<script setup lang="ts">
/**
 * AppGpsLoader – Overlay durante acquisizione GPS
 * ─────────────────────────────────────────────────────────────────────
 * Mostrato come overlay full-screen con backdrop blur mentre
 * l'app attende la risposta di navigator.geolocation.
 * Controllato da isGpsLoading in useAppState.
 */
import { useAppState } from '~/composables/useAppState'

const { isGpsLoading } = useAppState()
</script>

<template>
  <!-- v-show per non ricreare il DOM ad ogni acquisizione GPS -->
  <div id="gps-loader" :class="{ open: isGpsLoading }">
    <div class="gps-spinner" />
    <p>Acquisizione posizione GPS...</p>
  </div>
</template>

<style scoped lang="scss">
/* Overlay GPS – copre tutta la viewport con blur */
#gps-loader {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .68);
  display: none; // nascosto di default
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 16px;
  z-index: 300;
  -webkit-backdrop-filter: blur(3px);
  backdrop-filter: blur(3px);

  // Classe aggiunta quando isGpsLoading = true
  &.open { display: flex; }

  p {
    font-size: 14px;
    color: var(--muted);
    font-weight: 500;
  }
}

/* Spinner rotante: bordo arancione su sfondo grigio */
.gps-spinner {
  width: 42px;
  height: 42px;
  border: 3px solid var(--border2);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: spin .75s linear infinite; // animazione in main.scss
}
</style>
