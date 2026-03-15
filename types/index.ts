/**
 * ============================================================
 * POSATRACK – Definizioni TypeScript
 * ============================================================
 * Tutti i tipi e le interfacce condivisi nell'applicazione.
 * Importare sempre da questo file per mantenere coerenza.
 */

/** Coordinate GPS acquisite tramite navigator.geolocation */
export interface GpsLocation {
  lat: number   // latitudine (gradi decimali)
  lng: number   // longitudine (gradi decimali)
  acc: number   // accuratezza in metri
}

/** Foto compressa allegata a un'attività (base64 JPEG) */
export interface Photo {
  data: string  // stringa base64 con prefisso "data:image/jpeg;base64,..."
  ts:   number  // timestamp Unix ms al momento dello scatto
}

/**
 * Tipo di attività registrabile.
 * I valori corrispondono alle chiavi dell'oggetto ACT in constants/.
 */
export type ActivityType = 'trasferimento' | 'posa' | 'pausa_pranzo' | 'altro'

/**
 * Attività lavorativa registrata.
 * Viene persistita in localStorage sotto la chiave "pt_v3".
 */
export interface Activity {
  /** ID univoco, formato: "act_<timestamp>" */
  id:        string

  /** Tipo di attività */
  type:      ActivityType

  /** Descrizione leggibile (es. "Parco Comunale Vicenza") */
  detail:    string

  /** Note aggiuntive opzionali */
  note:      string

  /** Data nel formato YYYY-MM-DD (fuso locale) */
  date:      string

  /** Timestamp ms di avvio */
  startTime: number

  /** Timestamp ms di fine (null = attività ancora in corso) */
  endTime:   number | null

  /** Posizione GPS al momento dell'avvio (null se non disponibile) */
  startLoc:  GpsLocation | null

  /** Posizione GPS al momento della fine (null se non disponibile) */
  endLoc:    GpsLocation | null

  /**
   * Durata in secondi, calcolata al termine.
   * null finché l'attività è in corso.
   */
  duration:  number | null

  /** Array di foto allegate, in ordine cronologico */
  photos:    Photo[]

  /** Numero ordine di lavoro (obbligatorio per le attività di tipo "posa") */
  orderNumber?: string

  /** Foto scontrini (usate per le attività di tipo "pausa_pranzo") */
  receiptPhotos?: Photo[]

  /** true se l'attività è stata pre-creata da un ordine di lavoro pianificato */
  isPlanned?: boolean

  /** ID del WorkOrder da cui è stata generata questa attività */
  workOrderId?: string
}

/**
 * Ordine di lavoro pianificato (usato nella sezione Pianificazione, solo desktop).
 * Viene persistito in localStorage insieme alle attività.
 */
export interface WorkOrder {
  /** ID univoco, formato: "wo_<timestamp>" */
  id: string

  /** Data di esecuzione pianificata, YYYY-MM-DD */
  date: string

  /** Numero ordine di lavoro */
  orderNumber: string

  /** Tipo di attività (no pausa_pranzo) */
  type: ActivityType

  /** Descrizione/attrezzatura da posare */
  detail: string

  /** Note aggiuntive */
  note: string

  /** Durata stimata in giorni (default 1, usato solo per retrocompatibilità Gantt) */
  estimatedDuration?: number

  /** Durata stimata del lavoro in minuti (es. 150 = 2h 30m) */
  estimatedTime?: number

  /** Ora di inizio pianificata "HH:MM" (opzionale) */
  startHour?: string

  /** ID gruppo per lavorazioni multi-giorno (es. "grp_<timestamp>") */
  groupId?: string

  /** Indice giorno all'interno del gruppo (1-based, es. 1 di 3) */
  dayIndex?: number

  /** Totale giorni del gruppo */
  totalDays?: number

  /** Timestamp Unix ms di creazione */
  createdAt: number
}

/** Struttura root del dato in localStorage */
export interface StoreData {
  activities:  Activity[]
  /** Note di cantiere giornaliere: chiave = YYYY-MM-DD, valore = testo */
  dayNotes?:   Record<string, string>
  /** Foto di cantiere giornaliere: chiave = YYYY-MM-DD, valore = array di foto */
  sitePhotos?: Record<string, Photo[]>
  /** Ordini di lavoro pianificati */
  workOrders?: WorkOrder[]
  /** Timestamp Unix ms dell'ultima scrittura – usato per conflict resolution con Gist */
  lastModified?: number
}

/** Configurazione GitHub Gist per la sincronizzazione remota */
export interface GistConfig {
  token:  string  // Personal Access Token GitHub con scope "gist"
  gistId: string  // ID del Gist privato
}

/** Vista attiva nell'app (navigazione single-page) */
export type ViewName = 'timer' | 'summary' | 'dashboard' | 'planning'

/** Metadati visuali per ogni tipo di attività */
export interface ActivityTypeMeta {
  label: string  // nome leggibile (es. "Trasferimento")
  color: string  // hex color per pallini, barre, marker mappa
  emoji: string  // emoji identificativa
}

/** Voce del catalogo attrezzature (per il modal "Posa") */
export interface CatalogItem {
  id:    string  // identificatore interno (non modificare dopo la creazione)
  label: string  // nome leggibile visualizzato in UI e report
  code:  string  // codice prodotto aziendale (es. "COD-1001")
}
