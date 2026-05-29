/**
 * plugins/firebase.client.ts – Inizializzazione Firebase
 * ─────────────────────────────────────────────────────────────────────
 * Eseguito solo lato client (suffisso .client.ts).
 * Legge la configurazione dal runtimeConfig (file .env)
 * e inizializza Firebase Auth + Firestore.
 * Firebase Storage non viene inizializzato (si usa Cloudinary).
 */

import { initFirebase } from '~/lib/firebase'

export default defineNuxtPlugin(() => {
  const config = useRuntimeConfig()

  initFirebase({
    apiKey:            String(config.public.firebaseApiKey).trim(),
    authDomain:        String(config.public.firebaseAuthDomain).trim(),
    projectId:         String(config.public.firebaseProjectId).trim(),
    storageBucket:     String(config.public.firebaseStorageBucket).trim(),
    messagingSenderId: String(config.public.firebaseMessagingSenderId).trim(),
    appId:             String(config.public.firebaseAppId).trim(),
  })
})
