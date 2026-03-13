<script setup lang="ts">
/**
 * GistSettingsModal – Configurazione sincronizzazione GitHub Gist
 * ─────────────────────────────────────────────────────────────────────
 * Permette all'utente di:
 *   1. Inserire il Personal Access Token GitHub (scope "gist")
 *   2. Creare automaticamente un nuovo Gist privato, oppure
 *      inserire l'ID di un Gist esistente
 *   3. Testare la connessione e salvare la configurazione
 *   4. Forzare una sincronizzazione manuale
 *   5. Rimuovere la configurazione (torna a offline-only)
 */
import { computed, ref } from 'vue'
import { useAppState }   from '~/composables/useAppState'
import { useGistSync }   from '~/composables/useGistSync'
import { useStore }      from '~/composables/useStore'

const appState = useAppState()
const gistSync = useGistSync()
const store    = useStore()

// ── Stato locale del form ────────────────────────────────────────────
const tokenInput   = ref('')
const gistIdInput  = ref('')
const showToken    = ref(false)
const isWorking    = ref(false)
const workingMsg   = ref('')
const feedback     = ref<{ ok: boolean; msg: string } | null>(null)

// ── Stato corrente ───────────────────────────────────────────────────
const cfg = computed(() => gistSync.getConfig())

/** Popola il form con la config esistente all'apertura del modal */
function onOpen(): void {
  const existing = gistSync.getConfig()
  tokenInput.value  = existing?.token  ?? ''
  gistIdInput.value = existing?.gistId ?? ''
  feedback.value    = null
}

// ── Helpers UI ───────────────────────────────────────────────────────

function close(): void {
  appState.closeGistSettings()
}

function formatLastSync(ts: number | null): string {
  if (!ts) return 'Mai'
  const d = new Date(ts)
  return d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Azioni ───────────────────────────────────────────────────────────

/** Crea un nuovo Gist privato usando il token inserito. */
async function createNewGist(): Promise<void> {
  if (!tokenInput.value.trim()) {
    feedback.value = { ok: false, msg: 'Inserisci prima il token GitHub.' }
    return
  }
  isWorking.value  = true
  workingMsg.value = 'Creazione Gist in corso…'
  feedback.value   = null
  const id = await gistSync.createGist(tokenInput.value.trim())
  isWorking.value  = false
  if (id) {
    gistIdInput.value = id
    feedback.value    = { ok: true, msg: `Gist creato con successo! ID: ${id}` }
  } else {
    feedback.value = { ok: false, msg: `Errore: ${gistSync.syncError.value}` }
  }
}

/** Salva la configurazione e verifica la connessione con un pull di prova. */
async function saveAndTest(): Promise<void> {
  const token  = tokenInput.value.trim()
  const gistId = gistIdInput.value.trim()
  if (!token || !gistId) {
    feedback.value = { ok: false, msg: 'Token e Gist ID sono obbligatori.' }
    return
  }
  isWorking.value  = true
  workingMsg.value = 'Verifica connessione…'
  feedback.value   = null

  gistSync.saveConfig({ token, gistId })
  const data = await gistSync.pull()
  isWorking.value = false

  if (data !== null) {
    feedback.value = { ok: true, msg: 'Connessione riuscita! Configurazione salvata.' }
    // Avvia la sync iniziale per allineare i dati
    await store.initSync()
  } else {
    feedback.value = { ok: false, msg: `Connessione fallita: ${gistSync.syncError.value}` }
    gistSync.clearConfig()
  }
}

/** Forza un push immediato dei dati locali sul Gist. */
async function syncNow(): Promise<void> {
  isWorking.value  = true
  workingMsg.value = 'Sincronizzazione in corso…'
  feedback.value   = null
  await store.initSync()
  isWorking.value = false
  if (gistSync.syncStatus.value === 'ok') {
    feedback.value = { ok: true, msg: 'Sincronizzazione completata.' }
  } else {
    feedback.value = { ok: false, msg: `Errore: ${gistSync.syncError.value}` }
  }
}

/** Rimuove la configurazione Gist (torna a offline). */
function removeConfig(): void {
  if (!confirm('Sei sicuro? I dati locali rimarranno invariati, ma la sincronizzazione verrà disabilitata.')) return
  gistSync.clearConfig()
  tokenInput.value  = ''
  gistIdInput.value = ''
  feedback.value    = { ok: true, msg: 'Configurazione rimossa. L\'app funziona ora solo in locale.' }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal-fade">
      <div
        v-if="appState.isGistSettingsOpen.value"
        class="gist-overlay"
        @click.self="close"
        @vue:mounted="onOpen"
      >
        <div class="gist-modal">

          <!-- Header ─────────────────────────────────────────────── -->
          <div class="gist-header">
            <div class="gist-header-title">
              <svg viewBox="0 0 24 24" class="gist-header-icon">
                <path d="M12 2C6.477 2 2 6.477 2 12c0 4.418 2.865 8.166 6.839 9.489.5.092.682-.217.682-.482 0-.237-.009-.868-.013-1.703-2.782.604-3.369-1.341-3.369-1.341-.454-1.154-1.11-1.462-1.11-1.462-.908-.62.069-.608.069-.608 1.003.07 1.531 1.03 1.531 1.03.892 1.529 2.341 1.087 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.11-4.555-4.943 0-1.091.39-1.984 1.029-2.683-.103-.253-.446-1.27.098-2.647 0 0 .84-.269 2.75 1.025A9.578 9.578 0 0112 6.836c.85.004 1.705.114 2.504.337 1.909-1.294 2.747-1.025 2.747-1.025.546 1.377.202 2.394.1 2.647.64.699 1.028 1.592 1.028 2.683 0 3.842-2.339 4.687-4.566 4.935.359.309.678.919.678 1.852 0 1.336-.012 2.415-.012 2.741 0 .267.18.578.688.48C19.138 20.161 22 16.416 22 12c0-5.523-4.477-10-10-10z"/>
              </svg>
              Sincronizzazione GitHub Gist
            </div>
            <button class="gist-close-btn" @click="close">
              <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>

          <!-- Body ───────────────────────────────────────────────── -->
          <div class="gist-body">

            <!-- Stato sync corrente ──────────────────────────────── -->
            <div class="gist-status-bar" :class="gistSync.syncStatus.value">
              <span class="gist-status-dot" />
              <span v-if="gistSync.syncStatus.value === 'idle'">Non configurato – solo locale</span>
              <span v-else-if="gistSync.syncStatus.value === 'syncing'">Sincronizzazione in corso…</span>
              <span v-else-if="gistSync.syncStatus.value === 'ok'">
                Sincronizzato · ultima sync {{ formatLastSync(gistSync.lastSync.value) }}
              </span>
              <span v-else-if="gistSync.syncStatus.value === 'error'">
                Errore: {{ gistSync.syncError.value }}
              </span>
            </div>

            <!-- Sezione configurazione ───────────────────────────── -->
            <div class="gist-section">
              <div class="gist-section-title">Configurazione</div>

              <!-- Token ─────────────── -->
              <label class="gist-label">
                Personal Access Token GitHub
                <span class="gist-label-hint">
                  (scope <code>gist</code> obbligatorio –
                  <a href="https://github.com/settings/tokens/new?scopes=gist&description=PosaTrack" target="_blank" rel="noopener">
                    genera qui
                  </a>)
                </span>
              </label>
              <div class="gist-input-wrap">
                <input
                  v-model="tokenInput"
                  :type="showToken ? 'text' : 'password'"
                  class="gist-input"
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="gist-eye-btn" @click="showToken = !showToken" type="button">
                  <svg v-if="!showToken" viewBox="0 0 24 24">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else viewBox="0 0 24 24">
                    <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>

              <!-- Gist ID ────────────── -->
              <label class="gist-label" style="margin-top: 14px;">
                Gist ID
              </label>
              <div class="gist-gistid-row">
                <input
                  v-model="gistIdInput"
                  type="text"
                  class="gist-input"
                  placeholder="a1b2c3d4e5f6… oppure crea uno nuovo →"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button class="gist-btn gist-btn-secondary" :disabled="isWorking" @click="createNewGist" type="button">
                  Crea nuovo
                </button>
              </div>

              <!-- Feedback ───────────── -->
              <div v-if="feedback" class="gist-feedback" :class="{ ok: feedback.ok, err: !feedback.ok }">
                {{ feedback.msg }}
              </div>

              <!-- Working indicator ───── -->
              <div v-if="isWorking" class="gist-working">
                <span class="gist-spinner" />
                {{ workingMsg }}
              </div>
            </div>

            <!-- Azioni principali ───────────────────────────────── -->
            <div class="gist-actions">
              <button
                class="gist-btn gist-btn-primary"
                :disabled="isWorking"
                @click="saveAndTest"
              >
                Salva e verifica connessione
              </button>

              <button
                v-if="cfg"
                class="gist-btn gist-btn-secondary"
                :disabled="isWorking"
                @click="syncNow"
              >
                Sincronizza ora
              </button>

              <button
                v-if="cfg"
                class="gist-btn gist-btn-danger"
                :disabled="isWorking"
                @click="removeConfig"
              >
                Rimuovi configurazione
              </button>
            </div>

            <!-- Info ────────────────────────────────────────────── -->
            <div class="gist-info">
              <strong>Come funziona:</strong> i dati vengono salvati localmente sul dispositivo
              e sincronizzati automaticamente su un Gist GitHub privato dopo ogni modifica (con ritardo di 2s).
              All'apertura dell'app viene scaricata la versione più recente disponibile.
              Il Gist è privato e accessibile solo con il tuo token.
            </div>

          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped lang="scss">
.gist-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, .65);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 200;
  padding: 16px;
}

.gist-modal {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

// ── Header ──────────────────────────────────────────────────────────
.gist-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 16px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.gist-header-title {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

.gist-header-icon {
  width: 20px;
  height: 20px;
  fill: var(--muted);
  flex-shrink: 0;
}

.gist-close-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--r-sm);
  color: var(--muted);
  transition: background .12s, color .12s;

  &:hover { background: var(--surface2); color: var(--text); }

  svg {
    width: 16px; height: 16px;
    stroke: currentColor; fill: none;
    stroke-width: 2; stroke-linecap: round;
  }
}

// ── Body ────────────────────────────────────────────────────────────
.gist-body {
  overflow-y: auto;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 18px;
}

// ── Status bar ──────────────────────────────────────────────────────
.gist-status-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border-radius: var(--r-sm);
  font-size: 13px;
  background: var(--surface2);
  color: var(--muted);

  &.ok     { background: rgba(34, 197, 94, .1);  color: var(--green); }
  &.error  { background: rgba(239, 68, 68, .1);  color: var(--red);   }
  &.syncing { background: rgba(255, 95, 0, .1);  color: var(--orange); }
}

.gist-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--muted);

  .ok &     { background: var(--green);  }
  .error &  { background: var(--red);    }
  .syncing & { background: var(--orange); animation: blink 1s infinite; }
}

// ── Section ─────────────────────────────────────────────────────────
.gist-section { display: flex; flex-direction: column; }

.gist-section-title {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: .6px;
  color: var(--muted);
  margin-bottom: 12px;
}

// ── Form ────────────────────────────────────────────────────────────
.gist-label {
  display: block;
  font-size: 13px;
  color: var(--muted);
  margin-bottom: 6px;
}

.gist-label-hint {
  font-size: 11px;
  color: var(--dim);
  margin-left: 4px;

  code {
    font-family: monospace;
    background: var(--surface3);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--orange);
  }

  a { color: var(--orange); text-decoration: none; &:hover { text-decoration: underline; } }
}

.gist-input-wrap {
  position: relative;
}

.gist-input {
  width: 100%;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 10px 40px 10px 12px;
  font-size: 13px;
  color: var(--text);
  font-family: monospace;
  outline: none;
  transition: border-color .15s;

  &::placeholder { color: var(--dim); font-family: 'DM Sans', sans-serif; }
  &:focus { border-color: var(--orange); }
}

.gist-eye-btn {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px; height: 28px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted);
  border-radius: var(--r-xs);
  transition: color .12s;

  &:hover { color: var(--text); }

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }
}

.gist-gistid-row {
  display: flex;
  gap: 8px;
  align-items: stretch;

  .gist-input { flex: 1; padding-right: 12px; }
}

// ── Feedback & Working ──────────────────────────────────────────────
.gist-feedback {
  margin-top: 10px;
  padding: 9px 12px;
  border-radius: var(--r-sm);
  font-size: 13px;
  word-break: break-all;

  &.ok  { background: rgba(34, 197, 94, .1);  color: var(--green); }
  &.err { background: rgba(239, 68, 68, .1);  color: var(--red);   }
}

.gist-working {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  font-size: 13px;
  color: var(--orange);
}

.gist-spinner {
  display: inline-block;
  width: 14px; height: 14px;
  border: 2px solid rgba(255, 95, 0, .3);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

// ── Buttons ─────────────────────────────────────────────────────────
.gist-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.gist-btn {
  padding: 11px 16px;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  border: none;
  transition: background .12s, opacity .12s;

  &:disabled { opacity: .45; cursor: default; }
}

.gist-btn-primary {
  background: var(--orange);
  color: #fff;
  &:not(:disabled):hover { background: var(--orange-d); }
}

.gist-btn-secondary {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border2);
  &:not(:disabled):hover { background: var(--surface3); }
}

.gist-btn-danger {
  background: rgba(239, 68, 68, .12);
  color: var(--red);
  border: 1px solid rgba(239, 68, 68, .25);
  &:not(:disabled):hover { background: rgba(239, 68, 68, .2); }
}

// ── Info box ─────────────────────────────────────────────────────────
.gist-info {
  font-size: 12px;
  color: var(--muted);
  background: var(--surface2);
  border-radius: var(--r-sm);
  padding: 12px 14px;
  line-height: 1.6;

  strong { color: var(--text); }
}

// ── Transition ───────────────────────────────────────────────────────
.modal-fade-enter-active,
.modal-fade-leave-active { transition: opacity .2s ease; }
.modal-fade-enter-from,
.modal-fade-leave-to    { opacity: 0; }
</style>
