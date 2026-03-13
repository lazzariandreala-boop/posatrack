/**
 * ============================================================
 * useGistSync – Sincronizzazione dati con GitHub Gist
 * ============================================================
 * Permette di usare un Gist privato come storage remoto per i
 * dati di PosaTrack, consentendo la sincronizzazione tra dispositivi.
 *
 * Requisiti:
 *   - Personal Access Token GitHub con scope "gist"
 *   - ID del Gist (creato automaticamente al primo setup)
 *
 * La configurazione è salvata in localStorage con la chiave "pt_gist_config".
 * I dati vengono salvati nel file "posatrack-data.json" all'interno del Gist.
 *
 * Strategia di conflict resolution:
 *   - Last-write-wins basata su StoreData.lastModified (timestamp ms)
 *   - Se il remoto è più recente → sovrascrive il locale
 *   - Se il locale è più recente → push sul remoto
 */

import { ref } from 'vue'
import type { GistConfig, StoreData } from '~/types'

const GIST_CONFIG_KEY = 'pt_gist_config'
const GIST_FILE_NAME  = 'posatrack-data.json'
const GITHUB_API      = 'https://api.github.com'

// ─── Stato reattivo singleton ─────────────────────────────────────────────────
const syncStatus = ref<'idle' | 'syncing' | 'ok' | 'error'>('idle')
const lastSync   = ref<number | null>(null)
const syncError  = ref<string | null>(null)

export function useGistSync() {

  // ─────────────────────────────────────────────────────────────────────
  // Config
  // ─────────────────────────────────────────────────────────────────────

  function getConfig(): GistConfig | null {
    try {
      const raw = localStorage.getItem(GIST_CONFIG_KEY)
      return raw ? JSON.parse(raw) as GistConfig : null
    } catch {
      return null
    }
  }

  function saveConfig(config: GistConfig): void {
    localStorage.setItem(GIST_CONFIG_KEY, JSON.stringify(config))
  }

  function clearConfig(): void {
    localStorage.removeItem(GIST_CONFIG_KEY)
    syncStatus.value = 'idle'
    lastSync.value   = null
    syncError.value  = null
  }

  function isConfigured(): boolean {
    const cfg = getConfig()
    return !!(cfg?.token && cfg?.gistId)
  }

  // ─────────────────────────────────────────────────────────────────────
  // API GitHub Gist
  // ─────────────────────────────────────────────────────────────────────

  /** Crea un nuovo Gist privato con dati vuoti e ritorna il suo ID. */
  async function createGist(token: string): Promise<string | null> {
    try {
      const res = await fetch(`${GITHUB_API}/gists`, {
        method: 'POST',
        headers: {
          Authorization: `token ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'PosaTrack – dati sincronizzati',
          public: false,
          files: {
            [GIST_FILE_NAME]: { content: '{"activities":[]}' },
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      const gist = await res.json() as { id: string }
      return gist.id
    } catch (e) {
      syncError.value = e instanceof Error ? e.message : String(e)
      return null
    }
  }

  /** Scarica i dati dal Gist remoto. */
  async function pull(): Promise<StoreData | null> {
    const cfg = getConfig()
    if (!cfg) return null

    syncStatus.value = 'syncing'
    try {
      const res = await fetch(`${GITHUB_API}/gists/${cfg.gistId}`, {
        headers: {
          Authorization: `token ${cfg.token}`,
          Accept: 'application/vnd.github+json',
        },
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      const gist = await res.json() as { files: Record<string, { content: string }> }
      const content = gist.files?.[GIST_FILE_NAME]?.content
      if (!content) throw new Error('File non trovato nel Gist')
      const data = JSON.parse(content) as StoreData
      syncStatus.value = 'ok'
      lastSync.value   = Date.now()
      syncError.value  = null
      return data
    } catch (e) {
      syncStatus.value = 'error'
      syncError.value  = e instanceof Error ? e.message : String(e)
      return null
    }
  }

  /** Carica i dati locali nel Gist remoto. */
  async function push(data: StoreData): Promise<boolean> {
    const cfg = getConfig()
    if (!cfg) return false

    syncStatus.value = 'syncing'
    try {
      const res = await fetch(`${GITHUB_API}/gists/${cfg.gistId}`, {
        method: 'PATCH',
        headers: {
          Authorization: `token ${cfg.token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: {
            [GIST_FILE_NAME]: { content: JSON.stringify(data) },
          },
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, string>
        throw new Error(err.message || `HTTP ${res.status}`)
      }
      syncStatus.value = 'ok'
      lastSync.value   = Date.now()
      syncError.value  = null
      return true
    } catch (e) {
      syncStatus.value = 'error'
      syncError.value  = e instanceof Error ? e.message : String(e)
      return false
    }
  }

  return {
    getConfig,
    saveConfig,
    clearConfig,
    isConfigured,
    createGist,
    pull,
    push,
    syncStatus,
    lastSync,
    syncError,
  }
}
