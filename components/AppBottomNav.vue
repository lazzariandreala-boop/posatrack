<script setup lang="ts">
/**
 * AppBottomNav – Navigazione mobile (bottom bar)
 * ─────────────────────────────────────────────────────────────────────
 * Visibile solo su mobile (< 800px).
 */
import { useAppState } from '~/composables/useAppState'
import { useStore }    from '~/composables/useStore'

const { currentView, navigate, openWorkspaceModal } = useAppState()
const store = useStore()
</script>

<template>
  <nav id="bottom-nav">

    <!-- Timer -->
    <button
      class="nav-tab"
      :class="{ active: currentView === 'timer' }"
      @click="navigate('timer')"
    >
      <svg viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="10"/>
        <polyline points="12 6 12 12 16 14"/>
      </svg>
      Timer
    </button>

    <!-- Workspace / Team -->
    <button class="nav-tab" @click="openWorkspaceModal">
      <div class="nav-tab-icon-wrap">
        <svg viewBox="0 0 24 24">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/>
          <circle cx="9" cy="7" r="4"/>
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/>
        </svg>
        <span class="nav-sync-dot" :class="store.syncStatus.value" />
      </div>
      Workspace
    </button>

  </nav>
</template>

<style scoped lang="scss">
.nav-tab-icon-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-sync-dot {
  position: absolute;
  top: -2px;
  right: -4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--dim);
  border: 1.5px solid var(--surface);

  &.ok      { background: var(--green);  }
  &.error   { background: var(--red);    }
  &.syncing { background: var(--orange); animation: blink 1s infinite; }
  &.idle    { background: var(--dim);    }
}
</style>

<!-- Gli stili di #bottom-nav e .nav-tab sono in main.scss (globali)
     perché interagiscono con il layout dell'app shell. -->
