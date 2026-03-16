/**
 * ============================================================
 * POSATRACK – Costanti applicazione
 * ============================================================
 * Dati statici che non cambiano a runtime.
 * Per aggiungere un'attrezzatura al catalogo: aggiungi un oggetto
 * in CATALOG rispettando il formato. Non modificare i campi `id`
 * di voci esistenti (sono usati come chiavi nei dati storici).
 */

import type { ActivityTypeMeta, CatalogItem } from '~/types'

// ──────────────────────────────────────────────────────────────────────────────
// TIPI ATTIVITÀ
// Metadati visuali per ciascun tipo di attività tracciabile.
// Il campo `color` è usato in: barra card, pallini log, marker mappa, grafici.
// ──────────────────────────────────────────────────────────────────────────────
export const ACT: Record<string, ActivityTypeMeta> = {
  trasferimento: { label: 'Trasferimento', color: '#3D8EE0', emoji: '🚐' },
  posa:          { label: 'Posa',          color: '#FF5F00', emoji: '🔧' },
  pausa_pranzo:  { label: 'Pausa pranzo',  color: '#F5B800', emoji: '🍽'  },
  altro:         { label: 'Altro',         color: '#8B5CF6', emoji: '📋' },
} as const

// ──────────────────────────────────────────────────────────────────────────────
// CATALOGO ATTREZZATURE
// Usato per popolare la <select> nel modal "Posa".
// Per aggiungere: inserisci un nuovo oggetto { id, label, code }.
// Per rimuovere: elimina la riga (non influenza i dati storici già salvati).
// ──────────────────────────────────────────────────────────────────────────────
export const CATALOG: CatalogItem[] = [
  { id: 'E001', label: 'TAVOLO A BILICO', code: '+AD01_ALU', category: 'AGILITY DOG' },
  { id: 'E002', label: 'TAVOLO A BILICO', code: '+AD01_R', category: 'AGILITY DOG' },
  { id: 'E003', label: 'TAVOLO A BILICO', code: '+AD01_W', category: 'AGILITY DOG' },
  { id: 'E004', label: 'PONTE LUNGO', code: '+AD02_ALU', category: 'AGILITY DOG' },
  { id: 'E005', label: 'PONTE LUNGO', code: '+AD02_R', category: 'AGILITY DOG' },
  { id: 'E006', label: 'PONTE LUNGO', code: '+AD02_W', category: 'AGILITY DOG' },
  { id: 'E007', label: 'RAMPA', code: '+AD03_ALU', category: 'AGILITY DOG' },
  { id: 'E008', label: 'RAMPA', code: '+AD03_R', category: 'AGILITY DOG' },
  { id: 'E009', label: 'RAMPA', code: '+AD03_W', category: 'AGILITY DOG' },
  { id: 'E010', label: 'SALTO NEL CERCHIO', code: '+AD04_ALU', category: 'AGILITY DOG' },
  { id: 'E011', label: 'SALTO NEL CERCHIO', code: '+AD04_R', category: 'AGILITY DOG' },
  { id: 'E012', label: 'SALTO NEL CERCHIO', code: '+AD04_W', category: 'AGILITY DOG' },
  { id: 'E013', label: 'SALTO OSTACOLI', code: '+AD05_ALU', category: 'AGILITY DOG' },
  { id: 'E014', label: 'SALTO OSTACOLI', code: '+AD05_R', category: 'AGILITY DOG' },
  { id: 'E015', label: 'SALTO OSTACOLI', code: '+AD05_W', category: 'AGILITY DOG' },
  { id: 'E016', label: 'SALTO OSTACOLO SINGOLO REGOLABILE', code: '+AD06_ALU', category: 'AGILITY DOG' },
  { id: 'E017', label: 'SALTO OSTACOLO SINGOLO REGOLABILE', code: '+AD06_R', category: 'AGILITY DOG' },
  { id: 'E018', label: 'SALTO OSTACOLO SINGOLO REGOLABILE', code: '+AD06_W', category: 'AGILITY DOG' },
  { id: 'E019', label: 'LABIRINTO', code: '+AD08_ALU', category: 'AGILITY DOG' },
  { id: 'E020', label: 'LABIRINTO', code: '+AD08_R', category: 'AGILITY DOG' },
  { id: 'E021', label: 'LABIRINTO', code: '+AD08_W', category: 'AGILITY DOG' },
  { id: 'E022', label: 'TUNNEL ORSETTO', code: '+U0300.L.2', category: 'AGILITY DOG' }
]

// ──────────────────────────────────────────────────────────────────────────────
// LOCALIZZAZIONE DATE
// ──────────────────────────────────────────────────────────────────────────────

/** Nomi dei giorni della settimana in italiano (0 = domenica) */
export const DAYS_IT = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'] as const

/** Nomi abbreviati dei giorni (0 = domenica) */
export const DAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'] as const

/** Nomi dei mesi in italiano (0 = gennaio) */
export const MONTHS_IT = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
                           'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'] as const

/** Nomi abbreviati dei mesi (0 = gennaio) */
export const MONTHS_SHORT = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu',
                              'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'] as const
