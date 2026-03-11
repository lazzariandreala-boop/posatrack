/**
 * ============================================================
 * useGeo – Geolocalizzazione
 * ============================================================
 * Usa navigator.geolocation standard del browser.
 *
 * Per build Capacitor nativa, sostituire get() con:
 *   import { Geolocation } from '@capacitor/geolocation'
 *   const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true })
 *   return { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }
 */

import type { GpsLocation } from '~/types'

export function useGeo() {

  /**
   * Acquisisce la posizione GPS corrente.
   * Ritorna { lat, lng, acc } in caso di successo, null in caso di errore/rifiuto.
   * Non lancia mai eccezioni: l'attività parte anche senza GPS.
   */
  async function get(): Promise<GpsLocation | null> {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        console.warn('[useGeo] geolocation non supportata dal browser')
        resolve(null)
        return
      }

      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          acc: Math.round(pos.coords.accuracy), // accuratezza in metri, arrotondata
        }),
        err => {
          console.warn('[useGeo] Errore acquisizione GPS:', err.message)
          resolve(null) // non blocca il flusso: l'attività parte comunque
        },
        {
          enableHighAccuracy: true, // GPS hardware invece di Wi-Fi/cell
          timeout:            12000, // timeout 12s per evitare attesa infinita
          maximumAge:         0,     // forza sempre una nuova lettura
        }
      )
    })
  }

  /**
   * Calcola la distanza in km tra due punti GPS con la formula di Haversine.
   * Usata per stimare i km percorsi nei report.
   */
  function dist(a: GpsLocation | null, b: GpsLocation | null): number {
    if (!a || !b) return 0
    const R    = 6371 // raggio terrestre in km
    const dLat = (b.lat - a.lat) * Math.PI / 180
    const dLng = (b.lng - a.lng) * Math.PI / 180
    const x    = Math.sin(dLat / 2) ** 2
               + Math.cos(a.lat * Math.PI / 180)
               * Math.cos(b.lat * Math.PI / 180)
               * Math.sin(dLng / 2) ** 2
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  }

  /**
   * Formato lungo: "45.54321, 11.53210"
   * Usato in PDF e timeline (massima precisione).
   */
  function fmt(loc: GpsLocation | null): string {
    return loc ? `${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}` : 'N/D'
  }

  /**
   * Formato breve con accuratezza: "45.5432, 11.5321 (±8m)"
   * Usato nell'interfaccia utente.
   */
  function shortFmt(loc: GpsLocation | null): string {
    return loc ? `${loc.lat.toFixed(4)}, ${loc.lng.toFixed(4)} (±${loc.acc}m)` : 'N/D'
  }

  return { get, dist, fmt, shortFmt }
}
