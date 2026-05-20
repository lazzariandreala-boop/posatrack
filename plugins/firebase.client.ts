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
    apiKey:            config.public.firebaseApiKey,
    authDomain:        config.public.firebaseAuthDomain,
    projectId:         config.public.firebaseProjectId,
    storageBucket:     config.public.firebaseStorageBucket,
    messagingSenderId: config.public.firebaseMessagingSenderId,
    appId:             config.public.firebaseAppId,
  })
})
