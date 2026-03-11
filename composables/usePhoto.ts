/**
 * ============================================================
 * usePhoto – Compressione immagini via Canvas API
 * ============================================================
 * Prima di salvare in localStorage, ogni foto viene:
 * 1. Ridimensionata a max 900px sul lato maggiore
 * 2. Compressa in formato JPEG con qualità 0.65
 *
 * Risultato: ≈80–130 KB per foto (vs 3–8 MB originali da fotocamera).
 *
 * Il processo è:
 *   FileReader → Image → Canvas (resize) → canvas.toDataURL (compress)
 */

/** Lato massimo in pixel per la dimensione maggiore della foto */
const MAX_SIDE = 900

/** Qualità JPEG 0–1 (0.65 = buon bilanciamento qualità/peso) */
const QUALITY  = 0.65

export function usePhoto() {

  /**
   * Comprimi un singolo File e ritorna una stringa base64 JPEG.
   * Lancia un Error se la lettura o il caricamento dell'immagine fallisce.
   */
  async function compress(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()

      reader.onerror = () => reject(new Error(`Errore lettura file: ${file.name}`))

      reader.onload = (e) => {
        const img = new Image()

        img.onerror = () => reject(new Error(`Errore caricamento immagine: ${file.name}`))

        img.onload = () => {
          let { width, height } = img

          // Ridimensiona mantenendo l'aspect ratio
          if (width > MAX_SIDE || height > MAX_SIDE) {
            if (width >= height) {
              // Landscape: riduce la larghezza a MAX_SIDE
              height = Math.round(height * MAX_SIDE / width)
              width  = MAX_SIDE
            } else {
              // Portrait: riduce l'altezza a MAX_SIDE
              width  = Math.round(width * MAX_SIDE / height)
              height = MAX_SIDE
            }
          }

          // Disegna sul canvas e comprimi in JPEG
          const canvas  = document.createElement('canvas')
          canvas.width  = width
          canvas.height = height
          canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', QUALITY))
        }

        img.src = (e.target as FileReader).result as string
      }

      reader.readAsDataURL(file)
    })
  }

  /**
   * Comprimi un array di File, saltando silenziosamente quelli che danno errore.
   * Ritorna un array di stringhe base64 (può essere più corto dell'input).
   */
  async function processFiles(files: File[]): Promise<string[]> {
    const results: string[] = []
    for (const file of files) {
      try {
        results.push(await compress(file))
      } catch (err) {
        console.warn('[usePhoto] Compressione fallita per', file.name, err)
        // Continua con le altre foto senza bloccare il flusso
      }
    }
    return results
  }

  return { compress, processFiles }
}
