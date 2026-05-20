<script setup lang="ts">
/**
 * AuthView – Schermata di accesso
 * ─────────────────────────────────────────────────────────────────────
 * Gestisce login e registrazione con:
 *   - Email + Password (tab Login / Registrazione)
 *   - Google (pulsante sempre disponibile)
 *   - Microsoft (pulsante disponibile se MICROSOFT_CLIENT_ID è configurato)
 *
 * Si mostra quando currentUser === null in app.vue.
 */
import { ref, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'

const auth = useAuth()

const config = useRuntimeConfig()
const isMicrosoftConfigured = computed(
  () => !!(config.public.microsoftClientId as string)
)

// ── Tab attivo ──────────────────────────────────────────────────────
type Tab = 'login' | 'register' | 'reset'
const activeTab = ref<Tab>('login')

// ── Campi form ──────────────────────────────────────────────────────
const email       = ref('')
const password    = ref('')
const displayName = ref('')
const showPw      = ref(false)
const isLoading   = ref(false)
const feedback    = ref<{ ok: boolean; msg: string } | null>(null)

function resetForm(): void {
  email.value       = ''
  password.value    = ''
  displayName.value = ''
  showPw.value      = false
  feedback.value    = null
  auth.authError.value = null
}

function switchTab(tab: Tab): void {
  activeTab.value = tab
  resetForm()
}

// ── Azioni ──────────────────────────────────────────────────────────

async function handleEmailSubmit(): Promise<void> {
  feedback.value = null
  if (!email.value.trim() || !password.value) {
    feedback.value = { ok: false, msg: 'Compila tutti i campi.' }
    return
  }
  isLoading.value = true
  try {
    if (activeTab.value === 'login') {
      await auth.loginEmail(email.value.trim(), password.value)
    } else {
      if (!displayName.value.trim()) {
        feedback.value = { ok: false, msg: 'Inserisci il tuo nome.' }
        isLoading.value = false
        return
      }
      await auth.registerEmail(email.value.trim(), password.value, displayName.value.trim())
    }
  } catch {
    feedback.value = { ok: false, msg: auth.authError.value ?? 'Errore sconosciuto.' }
  } finally {
    isLoading.value = false
  }
}

async function handleGoogle(): Promise<void> {
  feedback.value = null
  isLoading.value = true
  try {
    await auth.loginGoogle()
  } catch {
    feedback.value = { ok: false, msg: auth.authError.value ?? 'Errore Google.' }
  } finally {
    isLoading.value = false
  }
}

async function handleMicrosoft(): Promise<void> {
  feedback.value  = null
  isLoading.value = true
  try {
    await auth.loginMicrosoft()
  } catch {
    feedback.value = { ok: false, msg: auth.authError.value ?? 'Errore Microsoft.' }
  } finally {
    isLoading.value = false
  }
}

async function handleReset(): Promise<void> {
  feedback.value = null
  if (!email.value.trim()) {
    feedback.value = { ok: false, msg: 'Inserisci la tua email.' }
    return
  }
  isLoading.value = true
  try {
    await auth.resetPassword(email.value.trim())
    feedback.value = { ok: true, msg: 'Email di recupero inviata. Controlla la posta.' }
  } catch {
    feedback.value = { ok: false, msg: auth.authError.value ?? 'Errore invio email.' }
  } finally {
    isLoading.value = false
  }
}
</script>

<template>
  <div class="auth-root">
    <div class="auth-card">

      <!-- Brand ─────────────────────────────────────────────────── -->
      <div class="auth-brand">
        <div class="auth-brand-name">🏗 PosaTrack</div>
        <div class="auth-brand-sub">Gestione Cantiere</div>
      </div>

      <!-- Tab switcher ───────────────────────────────────────────── -->
      <div v-if="activeTab !== 'reset'" class="auth-tabs">
        <button
          class="auth-tab"
          :class="{ active: activeTab === 'login' }"
          @click="switchTab('login')"
        >Accedi</button>
        <button
          class="auth-tab"
          :class="{ active: activeTab === 'register' }"
          @click="switchTab('register')"
        >Registrati</button>
      </div>

      <!-- Reset password title ────────────────────────────────────── -->
      <div v-if="activeTab === 'reset'" class="auth-reset-title">
        <button class="auth-back-btn" @click="switchTab('login')">
          ← Torna al login
        </button>
        <div class="auth-section-label">Recupera password</div>
      </div>

      <!-- Feedback ───────────────────────────────────────────────── -->
      <div
        v-if="feedback"
        class="auth-feedback"
        :class="{ ok: feedback.ok, err: !feedback.ok }"
      >{{ feedback.msg }}</div>

      <!-- Form email/password ─────────────────────────────────────── -->
      <form class="auth-form" @submit.prevent="activeTab === 'reset' ? handleReset() : handleEmailSubmit()">

        <div v-if="activeTab === 'register'" class="auth-field">
          <label class="auth-label">Nome e Cognome</label>
          <input
            v-model="displayName"
            type="text"
            class="auth-input"
            placeholder="Mario Rossi"
            autocomplete="name"
            :disabled="isLoading"
          />
        </div>

        <div class="auth-field">
          <label class="auth-label">Email</label>
          <input
            v-model="email"
            type="email"
            class="auth-input"
            placeholder="mario@azienda.it"
            autocomplete="email"
            :disabled="isLoading"
          />
        </div>

        <div v-if="activeTab !== 'reset'" class="auth-field">
          <label class="auth-label">Password</label>
          <div class="auth-pw-wrap">
            <input
              v-model="password"
              :type="showPw ? 'text' : 'password'"
              class="auth-input"
              placeholder="••••••••"
              autocomplete="current-password"
              :disabled="isLoading"
            />
            <button type="button" class="auth-eye" @click="showPw = !showPw">
              <svg v-if="!showPw" viewBox="0 0 24 24">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
              <svg v-else viewBox="0 0 24 24">
                <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/>
                <line x1="1" y1="1" x2="23" y2="23"/>
              </svg>
            </button>
          </div>
          <button
            v-if="activeTab === 'login'"
            type="button"
            class="auth-forgot"
            @click="switchTab('reset')"
          >Password dimenticata?</button>
        </div>

        <button
          type="submit"
          class="auth-btn auth-btn-primary"
          :disabled="isLoading"
        >
          <span v-if="isLoading" class="auth-spinner" />
          <span v-else-if="activeTab === 'login'">Accedi</span>
          <span v-else-if="activeTab === 'register'">Crea account</span>
          <span v-else>Invia email di recupero</span>
        </button>

      </form>

      <!-- Divider ────────────────────────────────────────────────── -->
      <div v-if="activeTab !== 'reset'" class="auth-divider">
        <span>oppure</span>
      </div>

      <!-- Provider sociali ────────────────────────────────────────── -->
      <div v-if="activeTab !== 'reset'" class="auth-social">

        <!-- Google ──────────────────────────────────────────────── -->
        <button
          class="auth-btn auth-btn-social"
          :disabled="isLoading"
          @click="handleGoogle"
          type="button"
        >
          <!-- Google SVG icon -->
          <svg viewBox="0 0 24 24" class="auth-social-icon">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continua con Google
        </button>

        <!-- Microsoft ───────────────────────────────────────────── -->
        <button
          class="auth-btn auth-btn-social"
          :disabled="isLoading || !isMicrosoftConfigured"
          :title="isMicrosoftConfigured ? '' : 'Microsoft non configurato – vedi .env'"
          @click="handleMicrosoft"
          type="button"
        >
          <!-- Microsoft SVG icon -->
          <svg viewBox="0 0 24 24" class="auth-social-icon">
            <path fill="#F25022" d="M1 1h10v10H1z"/>
            <path fill="#00A4EF" d="M13 1h10v10H13z"/>
            <path fill="#7FBA00" d="M1 13h10v10H1z"/>
            <path fill="#FFB900" d="M13 13h10v10H13z"/>
          </svg>
          Continua con Microsoft
          <span v-if="!isMicrosoftConfigured" class="auth-badge-disabled">non configurato</span>
        </button>

      </div>

    </div>
  </div>
</template>

<style scoped lang="scss">
.auth-root {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  padding: 20px;
}

.auth-card {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r);
  width: 100%;
  max-width: 420px;
  padding: 32px 28px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

// ── Brand ────────────────────────────────────────────────────────────
.auth-brand {
  text-align: center;
}

.auth-brand-name {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 36px;
  font-weight: 900;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.auth-brand-sub {
  font-size: 12px;
  color: var(--muted);
  margin-top: 2px;
}

// ── Tabs ─────────────────────────────────────────────────────────────
.auth-tabs {
  display: flex;
  background: var(--surface2);
  border-radius: var(--r-sm);
  padding: 3px;
  gap: 2px;
}

.auth-tab {
  flex: 1;
  padding: 8px;
  border: none;
  background: transparent;
  border-radius: calc(var(--r-sm) - 2px);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: var(--muted);
  cursor: pointer;
  transition: background .12s, color .12s;

  &.active {
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 1px 4px rgba(0,0,0,.18);
  }
}

// ── Reset title ───────────────────────────────────────────────────────
.auth-reset-title {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.auth-back-btn {
  background: none;
  border: none;
  color: var(--orange);
  font-size: 13px;
  cursor: pointer;
  padding: 0;
  text-align: left;
  font-family: 'DM Sans', sans-serif;
}

.auth-section-label {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
}

// ── Feedback ─────────────────────────────────────────────────────────
.auth-feedback {
  padding: 10px 14px;
  border-radius: var(--r-sm);
  font-size: 13px;
  line-height: 1.4;

  &.ok  { background: rgba(34,197,94,.1);  color: var(--green); }
  &.err { background: rgba(239,68,68,.1);  color: var(--red);   }
}

// ── Form ─────────────────────────────────────────────────────────────
.auth-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.auth-label {
  font-size: 13px;
  color: var(--muted);
}

.auth-input {
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  padding: 10px 12px;
  font-size: 14px;
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  outline: none;
  transition: border-color .15s;
  width: 100%;

  &:focus { border-color: var(--orange); }
  &:disabled { opacity: .5; }
  &::placeholder { color: var(--dim); }
}

.auth-pw-wrap {
  position: relative;
}

.auth-eye {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  width: 28px; height: 28px;
  border: none; background: transparent; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  color: var(--muted);
  border-radius: var(--r-xs);

  svg {
    width: 15px; height: 15px;
    stroke: currentColor; fill: none;
    stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round;
  }

  &:hover { color: var(--text); }
}

.auth-forgot {
  background: none;
  border: none;
  color: var(--orange);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
  text-align: right;
  font-family: 'DM Sans', sans-serif;
  align-self: flex-end;
}

// ── Buttons ──────────────────────────────────────────────────────────
.auth-btn {
  width: 100%;
  padding: 11px 16px;
  border: none;
  border-radius: var(--r-sm);
  font-size: 14px;
  font-weight: 500;
  font-family: 'DM Sans', sans-serif;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  transition: background .12s, opacity .12s;

  &:disabled { opacity: .45; cursor: default; }
}

.auth-btn-primary {
  background: var(--orange);
  color: #fff;
  &:not(:disabled):hover { background: var(--orange-d); }
}

.auth-btn-social {
  background: var(--surface2);
  color: var(--text);
  border: 1px solid var(--border2);
  font-weight: 400;
  &:not(:disabled):hover { background: var(--surface3); }
}

.auth-social-icon {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}

.auth-badge-disabled {
  font-size: 10px;
  background: var(--surface3);
  color: var(--dim);
  padding: 2px 6px;
  border-radius: 4px;
  margin-left: auto;
}

// ── Spinner ──────────────────────────────────────────────────────────
.auth-spinner {
  display: inline-block;
  width: 16px; height: 16px;
  border: 2px solid rgba(255,255,255,.3);
  border-top-color: #fff;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}

// ── Divider ──────────────────────────────────────────────────────────
.auth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--dim);
  font-size: 12px;

  &::before, &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--border);
  }
}

// ── Social ────────────────────────────────────────────────────────────
.auth-social {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
</style>
