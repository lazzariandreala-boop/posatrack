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
  { id: 'E001', label: 'Altalena doppia',             code: 'COD-1001' },
  { id: 'E002', label: 'Altalena singola',            code: 'COD-1002' },
  { id: 'E003', label: 'Altalena baby (cesto)',       code: 'COD-1003' },
  { id: 'E004', label: 'Altalena disabili',           code: 'COD-1004' },
  { id: 'E005', label: 'Scivolo standard',            code: 'COD-2001' },
  { id: 'E006', label: 'Scivolo tunnel',              code: 'COD-2002' },
  { id: 'E007', label: 'Scivolo grande (tortuoso)',   code: 'COD-2003' },
  { id: 'E008', label: 'Struttura combinata S',       code: 'COD-3001' },
  { id: 'E009', label: 'Struttura combinata M',       code: 'COD-3002' },
  { id: 'E010', label: 'Struttura combinata L',       code: 'COD-3003' },
  { id: 'E011', label: 'Struttura combinata XL',      code: 'COD-3004' },
  { id: 'E012', label: 'Dondolo a molla - cavallo',   code: 'COD-4001' },
  { id: 'E013', label: 'Dondolo a molla - moto',      code: 'COD-4002' },
  { id: 'E014', label: 'Dondolo a molla - auto',      code: 'COD-4003' },
  { id: 'E015', label: 'Giostra rotante',             code: 'COD-5001' },
  { id: 'E016', label: 'Torre di arrampicata',        code: 'COD-6001' },
  { id: 'E017', label: 'Pannello sensoriale',         code: 'COD-7001' },
  { id: 'E018', label: 'Sabbiera con copertura',      code: 'COD-8001' },
  { id: 'E019', label: 'Recinzione modulare 1m',      code: 'COD-9001' },
  { id: 'E020', label: 'Panchina standard',           code: 'COD-9002' },
  { id: 'E021', label: 'Cestino portarifiuti',        code: 'COD-9003' },
  { id: 'E022', label: 'Pavimento antitrauma (m²)',   code: 'COD-9010' },
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
