<script setup lang="ts">
/**
 * AppToast – Notifica temporanea in alto allo schermo
 * ─────────────────────────────────────────────────────────────────────
 * Mostra un messaggio brevemente (default 2.6s) poi sparisce.
 * Appare con un'animazione elastica dall'alto.
 * Controllato da toastMessage in useAppState:
 *   stringa non vuota → visibile
 *   stringa vuota     → nascosto
 */
import { computed }    from 'vue'
import { useAppState } from '~/composables/useAppState'

const { toastMessage } = useAppState()

/** Il toast è visibile quando toastMessage non è vuoto */
const isVisible = computed(() => toastMessage.value.length > 0)
</script>

<template>
  <div id="toast" :class="{ show: isVisible }">
    {{ toastMessage }}
  </div>
</template>

<style scoped lang="scss">
/* Toast – pillola flottante in cima allo schermo */
#toast {
  position: fixed;
  top: calc(16px + var(--safe-t));
  left: 50%;
  // Inizialmente fuori schermo verso l'alto
  transform: translateX(-50%) translateY(-90px);
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: 30px;
  padding: 10px 22px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
  z-index: 400;
  // Animazione rimbalzo con cubic-bezier elastico
  transition: transform .30s cubic-bezier(.34, 1.56, .64, 1);
  white-space: nowrap;
  box-shadow: 0 8px 28px rgba(0, 0, 0, .55);
  pointer-events: none; // non intercetta i click

  // Classe aggiunta quando il messaggio è non vuoto
  &.show { transform: translateX(-50%) translateY(0); }
}
</style>
