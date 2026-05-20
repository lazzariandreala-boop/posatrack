<script setup lang="ts">
/**
 * ActivityModal – Bottom sheet per inserimento nuova attività
 * ─────────────────────────────────────────────────────────────────────
 * Si apre dal basso su mobile, come dialog centrato su desktop.
 * Gestisce i tre tipi di form: trasferimento, posa, altro.
 * Permette di allegare foto opzionali prima dell'avvio.
 *
 * Dipendenze:
 *   useAppState  → stato modal (isModalOpen, modalType, modalPhotos, photoTarget)
 *   useStore     → lettura/scrittura attività
 *   useGeo       → acquisizione GPS
 *   useTimer     → avvio cronometro
 *   usePhoto     → compressione foto
 */
import { computed, nextTick, ref, watch } from 'vue'
import { useAppState }               from '~/composables/useAppState'
import { useStore }                  from '~/composables/useStore'
import { useGeo }                    from '~/composables/useGeo'
import { useTimer }                  from '~/composables/useTimer'
import { usePhoto }                  from '~/composables/usePhoto'
import { ACT, CATALOG }              from '~/constants'
import type { Activity, ActivityType } from '~/types'

const appState = useAppState()
const store    = useStore()
const geo      = useGeo()
const timer    = useTimer()
const photo    = usePhoto()

// ── Titoli dei modal per tipo ────────────────────────────────────────
const MODAL_TITLES: Record<ActivityType, string> = {
  trasferimento: '🚐 Trasferimento',
  posa:          '🔧 Posa Attrezzatura',
  pausa_pranzo:  '🍽 Pausa Pranzo',
  altro:         '📋 Altra Attività',
}

const modalTitle = computed(() =>
  appState.modalType.value ? MODAL_TITLES[appState.modalType.value] : 'Nuova Attività'
)

// ── Campi del form ───────────────────────────────────────────────────
const mainValue        = ref('')   // campo principale (destinazione / attrezzatura / descrizione)
const noteValue        = ref('')   // note opzionali
const orderNumberValue = ref('')   // numero ordine (obbligatorio per 'posa')
const hasError         = ref(false) // true quando il campo obbligatorio è vuoto
const hasOrderError    = ref(false) // true quando il numero ordine è vuoto per 'posa'

/** Chiamato quando si apre il modal: pulisce i campi */
watch(() => appState.isModalOpen.value, (open) => {
  if (open) {
    mainValue.value        = ''
    noteValue.value        = ''
    orderNumberValue.value = ''
    hasError.value         = false
    hasOrderError.value    = false
    // Focus automatico sul primo campo dopo l'animazione (accessibilità e UX)
    nextTick(() => {
      setTimeout(() => {
        const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(
          '#modal-main-input, #modal-main-select'
        )
        el?.focus()
      }, 280)
    })
  }
})

// ── Foto nel modal ───────────────────────────────────────────────────

/** Ref nascosta all'input file */
const fileInputRef = ref<HTMLInputElement | null>(null)

/** Apre il picker foto impostando il target su "modal" */
function triggerModalPhotos(): void {
  appState.photoTarget.value = 'modal'
  if (fileInputRef.value) {
    fileInputRef.value.value = '' // reset per permettere ri-selezione
    fileInputRef.value.click()
  }
}

/** Handler change sull'input file nascosto */
async function handleFileInput(e: Event): Promise<void> {
  const input   = e.target as HTMLInputElement
  const files   = Array.from(input.files ?? [])
  if (!files.length) return

  appState.showToast('📸 Elaborazione foto...')
  const compressed = await photo.processFiles(files)
  appState.modalPhotos.value.push(...compressed)
}

/** Rimuove una foto dall'anteprima del modal (non ancora salvata) */
function removeModalPhoto(index: number): void {
  appState.modalPhotos.value.splice(index, 1)
}

// ── Logica avvio attività ────────────────────────────────────────────

/** Valida i campi, poi avvia l'attività */
async function confirmModal(): Promise<void> {
  const main        = mainValue.value.trim()
  const orderNumber = orderNumberValue.value.trim()
  const isPosa      = appState.modalType.value === 'posa'

  // Valida numero ordine (obbligatorio per posa)
  if (isPosa && !orderNumber) {
    hasOrderError.value = true
    return
  }
  hasOrderError.value = false

  if (!main) {
    hasError.value = true
    return
  }
  hasError.value = false

  // Per 'posa': converte l'ID catalogo nel testo leggibile
  let detail = main
  if (isPosa) {
    const item = CATALOG.find(c => c.id === main)
    detail = item ? `${item.label} — ${item.code}` : main
  }

  const photosSnapshot      = [...appState.modalPhotos.value]
  const typeSnapshot        = appState.modalType.value ?? 'altro'
  const noteSnapshot        = noteValue.value.trim()
  const orderNumberSnapshot = isPosa ? orderNumber : undefined

  appState.closeModal()
  await startActivity(typeSnapshot, detail, noteSnapshot, photosSnapshot, orderNumberSnapshot)
}

/** Avvia un'attività con tutti i campi forniti */
async function startActivity(
  type: ActivityType,
  detail: string,
  note: string,
  prePhotos: string[] = [],
  orderNumber?: string
): Promise<void> {
  appState.setGpsLoading(true)
  const location = await geo.get()
  const nowTs    = Date.now()
  const today    = todayStr()

  // Se c'è un'attività in corso, la termina automaticamente (risparmia una doppia chiamata GPS)
  if (appState.currentActivity.value) {
    await doStop(location, nowTs)
  }

  // Crea l'oggetto Activity
  const activity: Activity = {
    id:          `act_${nowTs}`,
    type,
    detail,
    note,
    date:        today,
    startTime:   nowTs,
    endTime:     null,
    startLoc:    location,
    endLoc:      null,
    duration:    null,
    photos:      prePhotos.map(data => ({ data, ts: nowTs })),
    orderNumber: orderNumber,
  }

  store.add(activity)
  appState.currentActivity.value = activity
  appState.setGpsLoading(false)
  timer.start(nowTs)
  appState.showToast(`▶ ${ACT[type]?.label} avviata`)
}

/** Termina l'attività corrente salvando posizione e durata */
async function doStop(endLocation: import('~/types').GpsLocation | null, endTimestamp: number): Promise<void> {
  if (!appState.currentActivity.value) return

  const duration = Math.floor((endTimestamp - appState.currentActivity.value.startTime) / 1000)

  store.update(appState.currentActivity.value.id, {
    endTime:  endTimestamp,
    endLoc:   endLocation,
    duration: duration,
  })

  timer.stop()
  appState.currentActivity.value = null
}

// ── Utility ─────────────────────────────────────────────────────────

/** Ritorna la data di oggi come stringa YYYY-MM-DD (fuso locale) */
function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Espone startActivity e doStop per essere usati anche da TimerView
defineExpose({ startActivity, doStop })
</script>

<template>
  <!-- Overlay: clic sull'overlay chiude il modal (ma non sul foglio) -->
  <div
    id="modal-bg"
    :class="{ open: appState.isModalOpen.value }"
    @click.self="appState.closeModal()"
  >
    <div id="modal-sheet">

      <!-- Maniglia decorativa (solo mobile, nascosta su desktop) -->
      <div class="modal-handle" />

      <!-- Titolo dinamico in base al tipo di attività -->
      <div class="modal-title">{{ modalTitle }}</div>

      <!-- ── Corpo del form: cambia in base al tipo ─────────────────── -->

      <!-- Trasferimento: campo testo destinazione -->
      <template v-if="appState.modalType.value === 'trasferimento'">
        <div class="form-group">
          <label for="modal-main-input">Destinazione *</label>
          <input
            id="modal-main-input"
            v-model="mainValue"
            type="text"
            placeholder="Es: Parco Comunale di Vicenza, Via Roma 10…"
            :class="{ 'input-error': hasError }"
            autocomplete="off"
            @input="hasError = false"
          >
        </div>
        <div class="form-group">
          <label for="modal-note-input">Note (opzionale)</label>
          <input
            id="modal-note-input"
            v-model="noteValue"
            type="text"
            placeholder="Es: Ingresso laterale, chiedere di Marco"
          >
        </div>
      </template>

      <!-- Posa: numero ordine (obbligatorio) + select catalogo attrezzature -->
      <template v-else-if="appState.modalType.value === 'posa'">
        <div class="form-group">
          <label for="modal-order-input">Numero ordine *</label>
          <input
            id="modal-order-input"
            v-model="orderNumberValue"
            type="text"
            placeholder="Es: ORD-2024-001"
            :class="{ 'input-error': hasOrderError }"
            autocomplete="off"
            @input="hasOrderError = false"
          >
          <div v-if="hasOrderError" class="field-error">Il numero ordine è obbligatorio</div>
        </div>
        <div class="form-group">
          <label>Attrezzatura da posare *</label>
          <CatalogSelect
            v-model="mainValue"
            :disabled="!orderNumberValue.trim()"
            :error="hasError"
            @update:model-value="hasError = false"
          />
          <div v-if="!orderNumberValue.trim()" class="field-hint">Inserisci prima il numero ordine per sbloccare la selezione</div>
        </div>
        <div class="form-group">
          <label for="modal-note-input">Posizione nel cantiere (opzionale)</label>
          <input
            id="modal-note-input"
            v-model="noteValue"
            type="text"
            placeholder="Es: Settore A, area giochi nord"
          >
        </div>
      </template>

      <!-- Altro: campo testo libero -->
      <template v-else>
        <div class="form-group">
          <label for="modal-main-input">Descrizione attività *</label>
          <input
            id="modal-main-input"
            v-model="mainValue"
            type="text"
            placeholder="Descrivi brevemente cosa stai facendo…"
            :class="{ 'input-error': hasError }"
            autocomplete="off"
            @input="hasError = false"
          >
        </div>
        <div class="form-group">
          <label for="modal-note-input">Note (opzionale)</label>
          <input
            id="modal-note-input"
            v-model="noteValue"
            type="text"
            placeholder=""
          >
        </div>
      </template>

      <!-- ── Sezione foto opzionale ─────────────────────────────────── -->
      <div style="margin-top: 8px">
        <div class="slabel" style="margin-bottom: 6px">FOTO OPZIONALI</div>

        <!-- Anteprime foto selezionate -->
        <div id="modal-photo-preview">
          <div
            v-for="(src, i) in appState.modalPhotos.value"
            :key="i"
            class="modal-photo-thumb"
          >
            <img :src="src" :alt="`Foto ${i + 1}`">
            <!-- Bottone X per rimuovere la foto prima dell'avvio -->
            <button class="modal-photo-del" @click="removeModalPhoto(i)">✕</button>
          </div>
        </div>

        <!-- Bottone aggiungi foto -->
        <button class="photo-btn" @click="triggerModalPhotos">
          <svg viewBox="0 0 24 24">
            <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/>
            <circle cx="12" cy="13" r="4"/>
          </svg>
          Scatta / allega foto
        </button>
      </div>

      <!-- ── Footer: Annulla e Avvia Timer ─────────────────────────── -->
      <div class="modal-footer">
        <button class="btn btn-ghost" style="flex: 1" @click="appState.closeModal()">
          Annulla
        </button>
        <button class="btn btn-primary" style="flex: 2" @click="confirmModal">
          <svg class="btn-icon" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10"/>
            <polyline points="12 6 12 12 16 14"/>
          </svg>
          Avvia Timer
        </button>
      </div>

    </div><!-- /modal-sheet -->
  </div><!-- /modal-bg -->

  <!-- Input file nascosto per cattura/selezione foto
       - accept="image/*": qualsiasi formato immagine
       - capture="environment": apre la fotocamera posteriore su mobile
       - multiple: permette più foto contemporaneamente -->
  <input
    ref="fileInputRef"
    type="file"
    accept="image/*"
    capture="environment"
    multiple
    style="display: none"
    @change="handleFileInput"
  >
</template>

<style scoped lang="scss">
/* Overlay scuro semitrasparente con blur */
#modal-bg {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .78);
  z-index: 200;
  display: none; // nascosto di default
  align-items: flex-end;
  justify-content: center;
  -webkit-backdrop-filter: blur(5px);
  backdrop-filter: blur(5px);

  &.open { display: flex; }
}

/* Foglio del modal che sale dal basso */
#modal-sheet {
  background: var(--surface);
  border-radius: 22px 22px 0 0;
  border-top: 1px solid var(--border2);
  padding: 0 20px calc(28px + var(--safe-b));
  width: 100%;
  max-width: 900px;
  animation: slideUp .24s cubic-bezier(.22, 1, .36, 1); // animazione in main.scss
  max-height: 95vh;
  overflow-y: auto;
}

/* Maniglia decorativa in cima al modal */
.modal-handle {
  width: 40px;
  height: 4px;
  background: var(--border2);
  border-radius: 2px;
  margin: 14px auto 22px;
}

/* Titolo dinamico del modal */
.modal-title {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 26px;
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: .5px;
  margin-bottom: 20px;
}

/* Riga bottoni Annulla / Avvia */
.modal-footer {
  display: flex;
  gap: 10px;
  margin-top: 20px;
}

/* Griglia anteprime foto nel modal */
#modal-photo-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  min-height: 0;
}

/* Contenitore singola foto in anteprima */
.modal-photo-thumb {
  position: relative;
  width: 76px;
  height: 76px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 9px;
    border: 2px solid var(--border2);
  }
}

/* Bottone X per rimuovere una foto dall'anteprima */
.modal-photo-del {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 20px;
  height: 20px;
  background: var(--red);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  border: 2px solid var(--bg);
}

/* Bottone aggiungi foto */
.photo-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  width: 100%;
  justify-content: center;
  background: var(--surface3);
  border: 1px solid var(--border2);
  border-radius: var(--r-xs);
  font-size: 11px;
  font-weight: 600;
  color: var(--muted);
  cursor: pointer;
  margin-top: 8px;
  transition: color .12s, border-color .12s;

  &:hover { color: var(--text); border-color: var(--orange); }

  svg {
    width: 12px;
    height: 12px;
    stroke: currentColor;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
}

/* Messaggio di errore sotto un campo */
.field-error {
  font-size: 11px;
  color: var(--red);
  margin-top: 5px;
  font-weight: 600;
}

/* Suggerimento sotto un campo */
.field-hint {
  font-size: 11px;
  color: var(--muted);
  margin-top: 5px;
}

/* Select disabilitata: aspetto visivamente attenuato */
select:disabled {
  opacity: .45;
  cursor: not-allowed;
}

/* Su desktop il modal diventa un dialog centrato */
@media (min-width: 800px) {
  #modal-bg    { align-items: center; }
  #modal-sheet {
    border-radius: 16px;
    padding: 0 28px 28px;
    margin-bottom: 0;
  }
  .modal-handle { display: none; } // non serve la maniglia su desktop
}
</style>
