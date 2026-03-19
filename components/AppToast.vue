<script setup lang="ts">
/**
 * AppToast – Notifica temporanea in alto allo schermo
 * Appare con animazione elastica dall'alto.
 * Colore automatico: verde = successo (✅/completata), rosso = errore (❌/Errore/⚠️)
 */
import { computed }    from 'vue'
import { useAppState } from '~/composables/useAppState'

const { toastMessage } = useAppState()

const isVisible = computed(() => toastMessage.value.length > 0)

const toastType = computed(() => {
  const msg = toastMessage.value
  if (msg.includes('❌') || msg.toLowerCase().includes('errore')) return 'error'
  if (msg.includes('⚠️'))                                          return 'warning'
  if (msg.includes('✅') || msg.toLowerCase().includes('completat')) return 'success'
  return 'info'
})
</script>

<template>
  <div id="toast" :class="['toast-' + toastType, { show: isVisible }]">
    {{ toastMessage }}
  </div>
</template>

<style scoped lang="scss">
#toast {
  position: fixed;
  top: calc(20px + var(--safe-t));
  left: 50%;
  transform: translateX(-50%) translateY(-120px);
  border-radius: 14px;
  padding: 14px 28px;
  font-size: 15px;
  font-weight: 700;
  z-index: 400;
  transition: transform .32s cubic-bezier(.34, 1.56, .64, 1);
  white-space: nowrap;
  box-shadow: 0 10px 36px rgba(0, 0, 0, .6);
  pointer-events: none;
  letter-spacing: .01em;

  &.show { transform: translateX(-50%) translateY(0); }

  &.toast-info    { background: #2a2a2a; border: 1.5px solid #444;          color: #f0f0f0; }
  &.toast-success { background: #1b3a22; border: 1.5px solid var(--green);  color: #6fcf80; }
  &.toast-error   { background: #3a1b1b; border: 1.5px solid var(--red);    color: #f07070; }
  &.toast-warning { background: #3a2f1b; border: 1.5px solid var(--orange); color: #f0b860; }

  @media (min-width: 800px) {
    font-size: 17px;
    padding: 16px 36px;
    border-radius: 16px;
  }
}
</style>
