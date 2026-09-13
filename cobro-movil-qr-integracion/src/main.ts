import './assets/theme.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { router } from './router'
import { QR_AMBIENTE, QR_API_KEY_COMPILADA, QR_BASE_URL } from './config/env'
import { hayLlavero, obtenerApiKey } from './services/credenciales'

// Avisos en arranque, no en el punto de uso: quien levanta la demo tiene que enterarse
// antes de emitir el primer QR, no cuando el cobro ya esta en marcha.
if (!QR_API_KEY_COMPILADA) {
  console.error(
    '[cobro-movil-qr] Falta VITE_QR_API_KEY en .env: el proxy respondera 401 a toda ' +
      'llamada. Copie .env.example a .env y complete la clave.',
  )
} else {
  console.info(
    `[cobro-movil-qr] Proxy ${QR_BASE_URL} | ambiente ${QR_AMBIENTE} | API Key en ` +
      `${hayLlavero() ? 'el llavero del dispositivo' : 'la compilacion'}.`,
  )
}

// En nativo se traslada al llavero en el primer arranque, antes de que haga falta para
// cobrar: hacerlo en medio de una venta agregaria latencia del Keystore al primer QR.
void obtenerApiKey()

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
