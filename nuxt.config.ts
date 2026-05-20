// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  runtimeConfig: {
    public: {
      // Firebase
      firebaseApiKey:            '',
      firebaseAuthDomain:        '',
      firebaseProjectId:         '',
      firebaseStorageBucket:     '',
      firebaseMessagingSenderId: '',
      firebaseAppId:             '',
      // Auth provider opzionale
      microsoftClientId:         '',
      // Cloudinary (upload immagini senza costi Firebase Storage)
      cloudinaryCloudName:       '',
      cloudinaryUploadPreset:    '',
    },
  },

  /**
   * SSR disabilitato: l'app usa localStorage e API browser-only (GPS, Canvas).
   * Viene servita come SPA pura (compatibile con Capacitor per build nativa).
   */
  ssr: false,

  /**
   * Compatibilità con l'ultimo Nuxt 3
   */
  compatibilityDate: '2024-11-01',

  /**
   * Fogli di stile globali (design tokens, reset, componenti comuni)
   */
  css: ['~/assets/scss/main.scss'],

  /**
   * Configurazione Vite per SCSS
   */
  vite: {
    css: {
      preprocessorOptions: {
        scss: {
          // Qui si possono aggiungere variabili SCSS globali auto-importate
          // additionalData: '@use "~/assets/scss/_variables.scss" as *;'
        },
      },
    },
  },

  /**
   * Meta tag dell'app nel <head>
   */
  app: {
    head: {
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1.0, viewport-fit=cover',
      title: 'PosaTrack',
      meta: [
        { name: 'apple-mobile-web-app-capable', content: 'yes' },
        { name: 'theme-color', content: '#121212' },
      ],
      link: [
        /* Preconnect Google Fonts */
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        /* Geist (body/UI) + JetBrains Mono (timer/mono) */
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;600;700&display=swap',
        },
        /* Leaflet CSS (necessario prima del JS per i marker e popup) */
        {
          rel: 'stylesheet',
          href: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css',
        },
      ],
    },
  },

  devtools: { enabled: true },
})
