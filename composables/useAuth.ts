/**
 * composables/useAuth.ts – Stato reattivo autenticazione
 * ─────────────────────────────────────────────────────────────────────
 * Wrapper Vue (singleton) attorno a services/auth.ts.
 * Espone gli stessi campi di useFirebaseAuth (drop-in replacement).
 *
 * Usato da: app.vue, AuthView.vue, AppSidebar.vue, WorkspaceModal.vue
 */

import { ref } from 'vue'
import {
  subscribeAuthState,
  toAppUser,
  ensureUserDoc,
  parseAuthError,
  loginWithEmail,
  registerWithEmail,
  loginWithGoogle,
  loginWithMicrosoft,
  logout    as authLogout,
  resetPassword as authResetPassword,
} from '~/services/auth'
import type { AppUser } from '~/types/user'

// ─── Stato singleton ──────────────────────────────────────────────────────────

const currentUser  = ref<AppUser | null>(null)
const authLoading  = ref(true)
const authError    = ref<string | null>(null)
let   _initialized = false

// ─── Composable ───────────────────────────────────────────────────────────────

export function useAuth() {

  /**
   * Avvia il listener sullo stato di autenticazione Firebase.
   * Va chiamato UNA SOLA VOLTA all'avvio dell'app (in app.vue).
   */
  function init(): void {
    if (_initialized) return
    _initialized = true

    subscribeAuthState(
      async (user) => {
        // ensureUserDoc è già non-bloccante internamente
        void ensureUserDoc(user)
        currentUser.value = toAppUser(user)
        authLoading.value = false
      },
      () => {
        currentUser.value = null
        authLoading.value = false
      },
    )
  }

  // ── Email + Password ───────────────────────────────────────────────

  async function loginEmail(email: string, password: string): Promise<void> {
    authError.value = null
    try {
      await loginWithEmail(email, password)
    } catch (e) {
      authError.value = parseAuthError(e)
      throw e
    }
  }

  async function registerEmail(
    email:       string,
    password:    string,
    displayName: string,
  ): Promise<void> {
    authError.value = null
    try {
      const user = await registerWithEmail(email, password, displayName)
      currentUser.value = toAppUser(user)
    } catch (e) {
      authError.value = parseAuthError(e)
      throw e
    }
  }

  // ── Google ────────────────────────────────────────────────────────

  async function loginGoogle(): Promise<void> {
    authError.value = null
    try {
      await loginWithGoogle()
    } catch (e) {
      authError.value = parseAuthError(e)
      throw e
    }
  }

  // ── Microsoft ─────────────────────────────────────────────────────

  async function loginMicrosoft(): Promise<void> {
    authError.value = null
    try {
      await loginWithMicrosoft()
    } catch (e) {
      authError.value = parseAuthError(e)
      throw e
    }
  }

  // ── Logout ────────────────────────────────────────────────────────

  async function logout(): Promise<void> {
    await authLogout()
    currentUser.value = null
  }

  // ── Reset password ────────────────────────────────────────────────

  async function resetPassword(email: string): Promise<void> {
    authError.value = null
    try {
      await authResetPassword(email)
    } catch (e) {
      authError.value = parseAuthError(e)
      throw e
    }
  }

  return {
    currentUser,
    authLoading,
    authError,
    init,
    loginEmail,
    registerEmail,
    loginGoogle,
    loginMicrosoft,
    logout,
    resetPassword,
  }
}
