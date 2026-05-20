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

/** Foto compressa allegata a un'attività */
export interface Photo {
  data: string   // base64 JPEG ("data:image/jpeg;base64,...") – vuoto se usato url
  ts:   number   // timestamp Unix ms al momento dello scatto
  url?: string   // Firebase Storage URL (preferito rispetto a data per la visualizzazione)
}

/** Ritorna la src migliore disponibile per visualizzare una foto */
export function photoSrc(p: Photo): string {
  return p.url || p.data
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

  /** Costo pranzo effettivo in € (solo pausa_pranzo, inserito dal posatore) */
  lunchCostActual?: number

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

  // ── Costi previsione (inseriti dal responsabile) ─────────────────
  /** Ore di trasferta A/R */
  transferHours?: number
  /** Viaggio previsione (€) */
  travelCostEstimate?: number
  /** Pranzo previsione (€) */
  lunchCostEstimate?: number
  /** Previsione costi materiale (€) */
  materialCostEstimate?: number
  /** Costi Posa Aggiuntivi – squadre esterne (€) */
  externalTeamCost?: number
  /** Budget ordine – Vendita Servizi (€) */
  budget?: number
  // ── Costi effettivi (aggiornati dopo la lavorazione) ─────────────
  /** Viaggio effettivo (€) */
  travelCostActual?: number
  /** Pranzo effettivo (€) */
  lunchCostActual?: number
  /** Costo materiale effettivo (€) – inserito dal posatore a fine giornata */
  materialCostActual?: number

  /** Link Google Maps per la posizione del cantiere (solo tipo posa) */
  mapsLink?: string
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
  /**
   * Costi effettivi giornalieri inseriti dal posatore.
   * Chiave = YYYY-MM-DD. Separato dalle attività/WO per semplicità d'uso.
   */
  dayCosts?: Record<string, { travelCostActual?: number; lunchCostActual?: number; materialCostActual?: number }>
  /**
   * Tombstone: ID delle attività eliminate intenzionalmente.
   * Usato dal merge per evitare che un'attività cancellata venga re-aggiunta
   * dal Gist remoto che la contiene ancora.
   */
  deletedActivityIds?: string[]
}

/** Configurazione GitHub Gist per la sincronizzazione remota (mantenuto per retrocompatibilità) */
export interface GistConfig {
  token:  string
  gistId: string
}

/** Utente autenticato nell'app */
export interface AppUser {
  uid:         string
  email:       string
  displayName: string
  photoURL:    string | null
}

/** Workspace condiviso tra più utenti */
export interface Workspace {
  id:             string
  name:           string
  ownerId:        string
  ownerEmail:     string
  members:        string[]   // array di uid con accesso
  memberEmails:   string[]   // email dei membri (per display)
  pendingInvites: string[]   // email in attesa di accettazione
  createdAt:      number     // timestamp ms
}

/** Vista attiva nell'app (navigazione single-page) */
export type ViewName = 'timer' | 'summary' | 'dashboard' | 'planning' | 'map' | 'profile'

/** Metadati visuali per ogni tipo di attività */
export interface ActivityTypeMeta {
  label: string  // nome leggibile (es. "Trasferimento")
  color: string  // hex color per pallini, barre, marker mappa
  emoji: string  // emoji identificativa
}

/** Voce del catalogo attrezzature (per il modal "Posa") */
export interface CatalogItem {
  id:    string     // identificatore interno (non modificare dopo la creazione)
  label: string     // nome leggibile visualizzato in UI e report
  code:  string     // codice prodotto aziendale (es. "COD-1001")
  category?: string // categoria del prodotto
}
