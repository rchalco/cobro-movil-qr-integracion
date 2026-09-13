import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

/** Debe coincidir con `RUTA_PROXY_DEV` de `src/config/env.ts`. */
const RUTA_PROXY = '/qr-proxy'

/** Donde escucha el proxy al correrlo con `dotnet run` sin mas configuracion. */
const DESTINO_POR_DEFECTO = 'http://localhost:5000'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  return {
    plugins: [vue(), vueDevTools()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: { proxy: proxyQr(env) },
    // El mismo reenvio para `vite preview`: sirve el build pero desde un origen que el
    // proxy sigue sin aceptar, asi que sin esto probar el build en el navegador falla
    // por CORS aunque el build este bien.
    preview: { proxy: proxyQr(env) },
  }
})

/**
 * Reenvio al proxy qr-banco-economico durante el desarrollo.
 *
 * Existe por **un** motivo: `qr-banco-economico` no declara CORS —no hay `AddCors` ni
 * `UseCors` en ese repositorio— de modo que un `fetch` desde el origen del dev-server
 * seria rechazado por el navegador. El reenvio ocurre servidor a servidor, donde CORS no
 * aplica.
 *
 * **No toca las cabeceras.** La API Key la manda el navegador en las dos situaciones
 * (`services/credenciales.ts`); inyectarla aqui ademas solo agregaba una segunda forma de
 * hacer lo mismo, que en un build no existia y dejaba las llamadas sin credencial.
 */
function proxyQr(env: Record<string, string>): Record<string, ProxyOptions> {
  const destino = (env.VITE_QR_BASE_URL ?? '').trim() || DESTINO_POR_DEFECTO

  console.info(`[qr-proxy] ${RUTA_PROXY} -> ${destino}`)

  if (!env.VITE_QR_API_KEY?.trim()) {
    console.warn(
      '[qr-proxy] Falta VITE_QR_API_KEY en .env: el proxy respondera 401 a toda llamada.',
    )
  }

  return {
    [RUTA_PROXY]: {
      target: destino,
      changeOrigin: true,
      // `secure: false` no se habilita a proposito: un certificado invalido en el destino
      // es un problema que hay que ver, no uno que el dev-server deba tapar.
      rewrite: (ruta) => ruta.replace(new RegExp(`^${RUTA_PROXY}`), ''),
      configure: (proxy) => {
        // Sin esto el fallo solo se ve como un 502 sin cuerpo en el navegador y no queda
        // rastro en la consola de quien levanto el dev-server.
        proxy.on('error', (error) => {
          // `message` suele venir vacio; el codigo del socket (ECONNREFUSED, ENOTFOUND)
          // es lo que dice si el servidor no esta o si el nombre no resuelve.
          const codigo =
            (error as NodeJS.ErrnoException).code ?? error.message ?? 'sin detalle'
          console.error(`[qr-proxy] No se pudo alcanzar ${destino}: ${codigo}`)
        })
      },
    },
  }
}
