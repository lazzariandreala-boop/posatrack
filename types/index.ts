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
}

/** Struttura root del dato in localStorage */
export interface StoreData {
  activities:  Activity[]
  /** Note di cantiere giornaliere: chiave = YYYY-MM-DD, valore = testo */
  dayNotes?:   Record<string, string>
  /** Foto di cantiere giornaliere: chiave = YYYY-MM-DD, valore = array di foto */
  sitePhotos?: Record<string, Photo[]>
  /** Timestamp Unix ms dell'ultima scrittura – usato per conflict resolution con Gist */
  lastModified?: number
}

/** Configurazione GitHub Gist per la sincronizzazione remota */
export interface GistConfig {
  token:  string  // Personal Access Token GitHub con scope "gist"
  gistId: string  // ID del Gist privato
}

/** Vista attiva nell'app (navigazione single-page) */
export type ViewName = 'timer' | 'summary' | 'dashboard'

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
