/**
 * ============================================================
 * useTimer – Cronometro live
 * ============================================================
 * Singleton: lo stato è a livello di modulo per essere condiviso
 * tra TimerView e qualunque altro componente che ne abbia bisogno.
 *
 * Aggiorna `elapsed` ogni 500ms calcolando la differenza tra
 * il timestamp di avvio e Date.now().
 */

import { ref } from 'vue'

/** Stringa display del cronometro in formato "HH:MM:SS" */
const elapsed = ref('00:00:00')

/** ID del setInterval attivo (null = timer fermo) */
let intervalId: ReturnType<typeof setInterval> | null = null

/** Timestamp ms dal quale calcolare il tempo trascorso */
let startTs: number | null = null

/**
 * Avvia il cronometro dal timestamp dato.
 * Se c'è già un interval attivo, lo ferma prima di ripartire.
 */
function start(startTimestamp: number): void {
  startTs = startTimestamp
  stop() // evita interval multipli accidentali

  // Aggiorna subito senza aspettare i 500ms del primo tick
  _tick()
  intervalId = setInterval(_tick, 500)
}

/** Ferma il cronometro e resetta il display a "00:00:00". */
function stop(): void {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
  elapsed.value = '00:00:00'
}

/** Calcola e aggiorna il valore di `elapsed`. */
function _tick(): void {
  if (startTs === null) return
  const seconds = Math.max(0, Math.floor((Date.now() - startTs) / 1000))
  const h = String(Math.floor(seconds / 3600)).padStart(2, '0')
  const m = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
  const s = String(seconds % 60).padStart(2, '0')
  elapsed.value = `${h}:${m}:${s}`
}

export function useTimer() {
  return { elapsed, start, stop }
}
