/**
 * services/cloudinary.ts – Upload immagini su Cloudinary
 * ─────────────────────────────────────────────────────────────────────
 * Sostituisce Firebase Storage (zero costi aggiuntivi: piano free di
 * Cloudinary include 25 GB storage + 25 GB bandwidth/mese).
 *
 * Usa upload NON firmato (unsigned) tramite un upload preset configurato
 * nel pannello Cloudinary → non richiede SDK, solo un fetch.
 *
 * Setup richiesto (una tantum su cloudinary.com):
 *   1. Crea account gratuito
 *   2. Settings → Upload → Upload presets → Add upload preset
 *   3. Signing Mode: "Unsigned"
 *   4. Folder: "posatrack" (opzionale ma consigliato)
 *   5. Copia Cloud Name e Preset Name nel file .env
 *
 * Path delle immagini in Cloudinary:
 *   posatrack/activities/{activityId}/{ts}
 *   posatrack/receipts/{activityId}/{ts}
 *   posatrack/sitePhotos/{date}/{ts}
 */

const CLOUDINARY_API = 'https://api.cloudinary.com/v1_1'

/**
 * Verifica se Cloudinary è configurato (cloud name + preset presenti).
 */
export function isCloudinaryConfigured(cloudName: string, uploadPreset: string): boolean {
  return !!(cloudName?.trim() && uploadPreset?.trim())
}

/**
 * Carica un'immagine base64 su Cloudinary e ritorna l'URL permanente.
 *
 * @param base64       - Stringa base64 con prefisso "data:image/jpeg;base64,..."
 * @param publicId     - ID pubblico dell'immagine in Cloudinary (path-like, senza estensione)
 * @param cloudName    - Cloud name dal pannello Cloudinary
 * @param uploadPreset - Nome del preset unsigned
 */
export async function uploadImage(
  base64:       string,
  publicId:     string,
  cloudName:    string,
  uploadPreset: string,
): Promise<string> {
  const body = new FormData()
  body.append('file',          base64)
  body.append('upload_preset', uploadPreset)
  body.append('public_id',     publicId)

  const res = await fetch(`${CLOUDINARY_API}/${cloudName}/image/upload`, {
    method: 'POST',
    body,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({})) as { error?: { message?: string } }
    throw new Error(err?.error?.message ?? `Cloudinary upload fallito (${res.status})`)
  }

  const data = await res.json() as { secure_url: string }
  return data.secure_url
}

/**
 * Upload foto attività.
 * public_id: posatrack/activities/{activityId}/{ts}
 */
export function uploadActivityPhoto(
  activityId:   string,
  ts:           number,
  base64:       string,
  cloudName:    string,
  uploadPreset: string,
): Promise<string> {
  return uploadImage(
    base64,
    `posatrack/activities/${activityId}/${ts}`,
    cloudName,
    uploadPreset,
  )
}

/**
 * Upload foto scontrino.
 * public_id: posatrack/receipts/{activityId}/{ts}
 */
export function uploadReceiptPhoto(
  activityId:   string,
  ts:           number,
  base64:       string,
  cloudName:    string,
  uploadPreset: string,
): Promise<string> {
  return uploadImage(
    base64,
    `posatrack/receipts/${activityId}/${ts}`,
    cloudName,
    uploadPreset,
  )
}

/**
 * Upload foto di cantiere giornaliera.
 * public_id: posatrack/sitePhotos/{date}/{ts}
 */
export function uploadSitePhoto(
  date:         string,
  ts:           number,
  base64:       string,
  cloudName:    string,
  uploadPreset: string,
): Promise<string> {
  return uploadImage(
    base64,
    `posatrack/sitePhotos/${date}/${ts}`,
    cloudName,
    uploadPreset,
  )
}
