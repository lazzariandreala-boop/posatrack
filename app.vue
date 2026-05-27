<script setup lang="ts">
/**
 * app.vue – Root component dell'applicazione
 * ─────────────────────────────────────────────────────────────────────
 * Gestisce tre stati principali:
 *
 *   1. authLoading    → spinner mentre Firebase verifica la sessione
 *   2. !currentUser   → <AuthView> (login/registrazione)
 *   3. currentUser + !workspaceId → <WorkspaceModal> (primo accesso)
 *   4. currentUser + workspaceId  → app normale
 *
 * La struttura dell'app (stato 4):
 *
 *   #app
 *   ├── AppSidebar        (solo desktop)
 *   ├── #views-wrap
 *   │   ├── TimerView
 *   │   ├── SummaryView   (solo desktop)
 *   │   └── DashboardView (solo desktop)
 *   ├── AppBottomNav      (solo mobile)
 *   └── Overlay globali   (ActivityModal, AppGpsLoader, AppLightbox, AppToast, WorkspaceModal)
 */
import { onMounted, onUnmounted, watch } from 'vue'
import { useAppState } from '~/composables/useAppState'
import { useStore }    from '~/composables/useStore'
import { useAuth }     from '~/composables/useAuth'

const appState = useAppState()
const store    = useStore()
const auth     = useAuth()

const { currentView, isDesktop, updateLayout } = appState

// ── Avvio ─────────────────────────────────────────────────────────────

onMounted(() => {
  auth.init()
  updateLayout()
  window.addEventListener('resize', updateLayout)
})

onUnmounted(() => {
  window.removeEventListener('resize', updateLayout)
})

// ── Reazione al login/logout ──────────────────────────────────────────
// Tutti gli utenti condividono lo stesso workspace globale ('main').
// Le regole Firestore consentono accesso a qualsiasi utente autenticato.

watch(
  () => auth.currentUser.value,
  async (user) => {
    if (!user) {
      store.clearWorkspace()
      return
    }
    await store.initWorkspace('main')
  },
)
</script>

<template>

  <!-- ── 1. Caricamento auth / workspace check ────────────────────────── -->
  <div v-if="auth.authLoading.value" class="auth-loading">
    <div class="auth-loading-spinner" />
    <div class="auth-loading-text">PosaTrack</div>
  </div>

  <!-- ── 2. Non autenticato → schermata login ──────────────────────────── -->
  <AuthView v-else-if="!auth.currentUser.value" />

  <!-- ── 3. App normale ──────────────────────────────────────────────── -->
  <div v-else id="app">

    <!-- Sidebar: visibile solo su desktop -->
    <AppSidebar v-if="isDesktop" />

    <!-- Area viste scrollabile -->
    <div id="views-wrap">
      <TimerView     v-show="currentView === 'timer'" />
      <SummaryView   v-show="currentView === 'summary'" />
      <DashboardView v-show="currentView === 'dashboard'" />
      <PlanningView  v-show="currentView === 'planning'" />
    </div>

    <!-- Bottom nav: visibile solo su mobile -->
    <AppBottomNav v-if="!isDesktop" />

    <!-- ─── Overlay globali ──────────────────────────────────────────── -->
    <ActivityModal />
    <AppGpsLoader />
    <AppLightbox />
    <AppToast />
    <GistSettingsModal />

  </div>

</template>

<style>
/* Schermata di caricamento auth */
.auth-loading {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: var(--bg);
  gap: 16px;
}

.auth-loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255, 95, 0, .2);
  border-top-color: var(--orange);
  border-radius: 50%;
  animation: spin .8s linear infinite;
}

.auth-loading-text {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 28px;
  font-weight: 900;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 1px;
}

/* Gate workspace */
.workspace-gate {
  min-height: 100vh;
  background: var(--bg);
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 60px;
}

.workspace-gate-header {
  text-align: center;
  margin-bottom: 32px;
}

.workspace-gate-brand {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 40px;
  font-weight: 900;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 1px;
}

.workspace-gate-sub {
  font-size: 13px;
  color: var(--muted);
  margin-top: 6px;
}
</style>
