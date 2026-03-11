<script setup lang="ts">
/**
 * AppSidebar – Navigazione desktop
 * ─────────────────────────────────────────────────────────────────────
 * Visibile solo su desktop (≥ 800px). Contiene:
 *   - Brand / logo dell'app
 *   - Bottoni di navigazione per le tre viste
 *   - Versione in fondo
 *
 * La visibilità è gestita in app.vue via v-if="isDesktop".
 */
import { useAppState } from '~/composables/useAppState'

const { currentView, navigate } = useAppState()
</script>

<template>
  <aside id="sidebar">

    <!-- Brand ────────────────────────────────────────────────────── -->
    <div class="sidebar-brand">
      <div class="sidebar-brand-name">🏗 PosaTrack</div>
      <div class="sidebar-brand-sub" style="margin-bottom: 10px;">Gestione Cantiere</div>
      <img src="../Logo.png" alt="Pozza Logo" width="200" height="150" />
    </div>

    <!-- Navigazione ──────────────────────────────────────────────── -->
    <nav class="sidebar-nav">

      <!-- Tab Timer: sempre visibile, attivo di default -->
      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'timer' }"
        @click="navigate('timer')"
      >
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="10"/>
          <polyline points="12 6 12 12 16 14"/>
        </svg>
        Timer &amp; Attività
      </button>

      <!-- Tab Riepilogo: solo desktop -->
      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'summary' }"
        @click="navigate('summary')"
      >
        <svg viewBox="0 0 24 24">
          <rect x="3" y="3" width="7" height="7"/>
          <rect x="14" y="3" width="7" height="7"/>
          <rect x="14" y="14" width="7" height="7"/>
          <rect x="3" y="14" width="7" height="7"/>
        </svg>
        Riepilogo giornata
      </button>

      <!-- Tab Dashboard: solo desktop -->
      <button
        class="sidebar-nav-btn"
        :class="{ active: currentView === 'dashboard' }"
        @click="navigate('dashboard')"
      >
        <svg viewBox="0 0 24 24">
          <line x1="18" y1="20" x2="18" y2="10"/>
          <line x1="12" y1="20" x2="12" y2="4"/>
          <line x1="6"  y1="20" x2="6"  y2="14"/>
        </svg>
        Dashboard
      </button>

    </nav>

    <!-- Versione ─────────────────────────────────────────────────── -->
    <div class="sidebar-version">v3.0 · PosaTrack</div>

  </aside>
</template>

<style scoped lang="scss">
/* ──────────────────────────────────────────────────────────────────
   Sidebar – layout e stili specifici
   Visibile solo su desktop tramite @media in main.scss,
   qui sono gli stili del contenuto interno.
   ────────────────────────────────────────────────────────────────── */

#sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-w);
  min-width: var(--sidebar-w);
  flex-shrink: 0; // non si restringe mai
  background: var(--surface);
  border-right: 1px solid var(--border);
  // Altezza piena schermo, non scorre con il contenuto
  position: sticky;
  top: 0;
  height: 100vh;
  overflow-y: auto;
}

/* Logo e sottotitolo */
.sidebar-brand {
  padding: 28px 20px 22px;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}

.sidebar-brand-name {
  font-family: 'Barlow Condensed', sans-serif;
  font-size: 30px;
  font-weight: 900;
  color: var(--orange);
  text-transform: uppercase;
  letter-spacing: 1px;
  line-height: 1;
}

.sidebar-brand-sub {
  font-size: 11px;
  color: var(--muted);
  margin-top: 4px;
  letter-spacing: .4px;
}

/* Contenitore bottoni di navigazione */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  padding: 14px 10px;
  gap: 3px;
  flex: 1;
}

/* Singolo bottone nav nella sidebar */
.sidebar-nav-btn {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  border-radius: 10px;
  cursor: pointer;
  border: none;
  background: transparent;
  color: var(--muted);
  font-family: 'DM Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  transition: background .12s, color .12s;
  text-align: left;
  width: 100%;

  &:hover {
    background: var(--surface2);
    color: var(--text);
  }

  // Tab attivo: sfondo arancione trasparente
  &.active {
    background: rgba(255, 95, 0, .13);
    color: var(--orange);
    font-weight: 600;
  }

  svg {
    width: 18px;
    height: 18px;
    stroke: currentColor;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex-shrink: 0;
  }
}

/* Versione in fondo alla sidebar */
.sidebar-version {
  padding: 14px 20px;
  font-size: 11px;
  color: var(--dim);
  border-top: 1px solid var(--border);
  flex-shrink: 0;
}
</style>
