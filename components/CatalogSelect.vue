<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { CATALOG } from '~/constants'
import type { CatalogItem } from '~/types'

const props = withDefaults(defineProps<{
  modelValue: string
  valueField?: 'id' | 'label'
  disabled?: boolean
  error?: boolean
}>(), {
  valueField: 'id',
  disabled: false,
  error: false,
})

const emit = defineEmits<{ 'update:modelValue': [value: string] }>()

const open         = ref(false)
const search       = ref('')
const searchInput  = ref<HTMLInputElement | null>(null)
const triggerRef   = ref<HTMLButtonElement | null>(null)

// Posizione e dimensioni del dropdown (fixed, calcolate al click)
const dropdownStyle = ref<Record<string, string>>({})

const groupedItems = computed(() => {
  const q = search.value.toLowerCase().trim()
  const filtered = q
    ? CATALOG.filter(item =>
        item.label.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.category?.toLowerCase().includes(q) ?? false)
      )
    : CATALOG

  const groups: Record<string, CatalogItem[]> = {}
  for (const item of filtered) {
    const cat = item.category ?? 'Altro'
    if (!groups[cat]) groups[cat] = []
    groups[cat].push(item)
  }

  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b, 'it'))
    .map(([category, items]) => ({
      category,
      items: items.slice().sort((a, b) => a.label.localeCompare(b.label, 'it')),
    }))
})

const selectedItem = computed(() =>
  CATALOG.find(item => item[props.valueField] === props.modelValue) ?? null
)

function select(item: CatalogItem) {
  emit('update:modelValue', item[props.valueField])
  open.value   = false
  search.value = ''
}

function toggle() {
  if (props.disabled) return
  if (open.value) {
    open.value = false
    return
  }

  if (triggerRef.value) {
    const rect    = triggerRef.value.getBoundingClientRect()
    const top     = rect.bottom + 4
    const maxH    = Math.floor(window.innerHeight * 0.95) - top

    dropdownStyle.value = {
      position: 'fixed',
      top:      `${top}px`,
      left:     `${rect.left}px`,
      width:    `${rect.width}px`,
      maxHeight: `${maxH}px`,
    }
  }

  open.value   = true
  search.value = ''
  nextTick(() => searchInput.value?.focus())
}

function handleClickOutside(e: MouseEvent) {
  const target = e.target as Node
  if (
    triggerRef.value && !triggerRef.value.contains(target) &&
    !(target as Element).closest?.('.catalog-dropdown-portal')
  ) {
    open.value   = false
    search.value = ''
  }
}

onMounted(() => document.addEventListener('mousedown', handleClickOutside))
onUnmounted(() => document.removeEventListener('mousedown', handleClickOutside))
</script>

<template>
  <div class="catalog-select" :class="{ open, disabled, error }">
    <button
      ref="triggerRef"
      type="button"
      class="catalog-trigger"
      :disabled="disabled"
      @click="toggle"
    >
      <span class="catalog-trigger-text" :class="{ placeholder: !selectedItem }">
        {{ selectedItem ? `${selectedItem.label} — ${selectedItem.code}` : '— Seleziona attrezzatura —' }}
      </span>
      <svg class="catalog-chevron" viewBox="0 0 24 24">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        class="catalog-dropdown-portal"
        :style="dropdownStyle"
      >
        <div class="catalog-search-wrap">
          <svg class="catalog-search-icon" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8"/>
            <line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref="searchInput"
            v-model="search"
            class="catalog-search-input"
            type="text"
            placeholder="Cerca attrezzatura..."
            @keydown.esc="open = false"
          >
        </div>

        <div class="catalog-list">
          <template v-for="group in groupedItems" :key="group.category">
            <div class="catalog-category">{{ group.category }}</div>
            <button
              v-for="item in group.items"
              :key="item.id"
              type="button"
              class="catalog-item"
              :class="{ selected: item[valueField] === modelValue }"
              @click="select(item)"
            >
              <span class="catalog-item-label">{{ item.label }}</span>
              <span class="catalog-item-code">{{ item.code }}</span>
            </button>
          </template>
          <div v-if="groupedItems.length === 0" class="catalog-empty">Nessun risultato</div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped lang="scss">
.catalog-select {
  position: relative;
  width: 100%;

  &.disabled .catalog-trigger { opacity: .45; cursor: not-allowed; }
  &.error .catalog-trigger     { border-color: var(--red); }
}

.catalog-trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface2);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  color: var(--text);
  font-family: 'DM Sans', sans-serif;
  font-size: 13px;
  padding: 8px 10px;
  cursor: pointer;
  text-align: left;
  transition: border-color .15s;

  &:focus { outline: none; border-color: var(--orange); }
  .open & { border-color: var(--orange); }
}

.catalog-trigger-text {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  &.placeholder { color: var(--muted); }
}

.catalog-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  stroke: var(--muted);
  fill: none;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
  transition: transform .15s;
  .open & { transform: rotate(180deg); }
}
</style>

<!-- Stili globali per il portale (non scoped perché è teletrasportato nel body) -->
<style lang="scss">
.catalog-dropdown-portal {
  background: var(--surface);
  border: 1px solid var(--border2);
  border-radius: var(--r-sm);
  box-shadow: 0 8px 24px rgba(0, 0, 0, .45);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  overflow: hidden;

  .catalog-search-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border2);
    flex-shrink: 0;
  }

  .catalog-search-icon {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    stroke: var(--muted);
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .catalog-search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    &::placeholder { color: var(--muted); }
  }

  .catalog-list {
    overflow-y: auto;
    flex: 1;
  }

  .catalog-category {
    padding: 6px 10px 4px;
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: .6px;
    color: var(--orange);
    position: sticky;
    top: 0;
    background: var(--surface);
  }

  .catalog-item {
    width: 100%;
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    padding: 7px 10px 7px 14px;
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background .1s;

    &:hover    { background: var(--surface2); }
    &.selected { background: var(--surface3); }
  }

  .catalog-item-label {
    font-size: 13px;
    color: var(--text);
    flex: 1;
    min-width: 0;
  }

  .catalog-item-code {
    font-size: 11px;
    color: var(--muted);
    flex-shrink: 0;
    font-family: monospace;
  }

  .catalog-empty {
    padding: 16px 10px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
}
</style>
