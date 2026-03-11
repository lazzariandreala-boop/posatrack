<script setup lang="ts">
/**
 * AppLightbox – Visualizzatore foto a schermo intero
 * ─────────────────────────────────────────────────────────────────────
 * Si apre tramite openLightbox(src) da useAppState.
 * Si chiude cliccando sull'overlay o sul bottone ✕.
 */
import { useAppState } from '~/composables/useAppState'

const { isLightboxOpen, lightboxSrc, closeLightbox } = useAppState()
</script>

<template>
  <!-- Overlay: clic su sfondo o bottone chiude il lightbox -->
  <div
    id="lightbox"
    :class="{ open: isLightboxOpen }"
    @click.self="closeLightbox"
  >
    <!-- Bottone chiudi angolo in alto a destra -->
    <button id="lightbox-close" @click="closeLightbox">✕</button>

    <!-- Immagine adattata al viewport mantenendo aspect ratio -->
    <img
      id="lightbox-img"
      :src="lightboxSrc"
      alt="Foto attività"
    >
  </div>
</template>

<style scoped lang="scss">
/* Lightbox – overlay scuro a schermo intero */
#lightbox {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .94);
  z-index: 500;
  display: none; // nascosto di default
  align-items: center;
  justify-content: center;

  // Classe aggiunta quando isLightboxOpen = true
  &.open { display: flex; }
}

/* Immagine: adattamento al viewport, bordo arrotondato */
#lightbox-img {
  max-width: 92vw;
  max-height: 86vh;
  border-radius: 10px;
  object-fit: contain;
  box-shadow: 0 20px 60px rgba(0, 0, 0, .7);
}

/* Bottone chiudi – cerchio semitrasparente in alto a destra */
#lightbox-close {
  position: absolute;
  top: 18px;
  right: 18px;
  width: 38px;
  height: 38px;
  background: rgba(255, 255, 255, .12);
  border: 1px solid rgba(255, 255, 255, .18);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 18px;
  color: #fff;
  transition: background .12s;

  &:hover { background: rgba(255, 255, 255, .22); }
}
</style>
