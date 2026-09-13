/**
 * Configuracion de la demo. Todo sale de `.env`, que no se versiona.
 *
 * Hay **una sola API Key** para todos los casos y el transporte se elige solo:
 *
 *  - **Desarrollo**: las llamadas van a una ruta relativa que el dev-server de Vite
 *    reenvia al proxy. No es por la clave —el navegador la manda igual— sino porque
 *    `qr-banco-economico` no declara CORS y un `fetch` directo desde `localhost:5173`
 *    seria rechazado por el navegador. El reenvio es servidor a servidor, donde CORS no
 *    aplica.
 *  - **Compilado** (build o Capacitor): no hay dev-server, asi que las llamadas salen
 *    directo a `VITE_QR_BASE_URL`. En Capacitor nativo no hay CORS que sortear.
 *
 * La clave queda en el bundle compilado. Es una decision tomada para esta demo; en el
 * empaquetado nativo se traslada al llavero del dispositivo (`services/credenciales.ts`),
 * que la protege en reposo pero no la hace irrecuperable del APK. El README lo detalla.
 */

/** Estado inicial del cobro por QR en un equipo que nunca guardo configuracion. */
export const FEATURE_PAGO_QR = import.meta.env.VITE_FEATURE_PAGO_QR !== 'false'

/** Ruta del dev-server que reenvia al proxy. Debe coincidir con `vite.config.ts`. */
export const RUTA_PROXY_DEV = '/qr-proxy'

/** Donde escucha el proxy qr-banco-economico. */
export const QR_PROXY_URL = (
  import.meta.env.VITE_QR_BASE_URL ?? 'http://localhost:5000'
).replace(/\/+$/, '')

/** En desarrollo se pasa por el dev-server; compilado se va derecho al proxy. */
export const USA_DEV_SERVER = import.meta.env.DEV

export const QR_BASE_URL = USA_DEV_SERVER ? RUTA_PROXY_DEV : QR_PROXY_URL

/**
 * API Key del suscriptor, tal como viene de la compilacion. **No se usa directamente
 * para las llamadas**: eso pasa por `obtenerApiKey()`, que en nativo la lee del llavero.
 */
export const QR_API_KEY_COMPILADA = (import.meta.env.VITE_QR_API_KEY ?? '').trim()

/**
 * Ambiente de la clave. El proxy las emite por ambiente y rechaza una de otro, asi que
 * este valor no viaja en la solicitud: sirve para que la pantalla diga contra que se esta
 * operando y nadie confunda una demo con produccion.
 */
export const QR_AMBIENTE = (import.meta.env.VITE_QR_ENVIRONMENT ?? 'prd').trim()

/** Cuenta de Baneco a usar cuando el suscriptor tiene varias concedidas. Opcional. */
export const QR_CUENTA_BANECO = (import.meta.env.VITE_QR_BANECO_ACCOUNT ?? '').trim()

/** Sucursal que recauda. Viaja en el QR y es lo que permite ubicar el cobro. */
export const CODIGO_SUCURSAL = (import.meta.env.VITE_QR_BRANCH_CODE ?? '0001').trim()

export const MONEDA = (import.meta.env.VITE_QR_CURRENCY ?? 'BOB').trim()

/** Dias de vigencia del QR emitido. */
export const DIAS_VIGENCIA = Number(import.meta.env.VITE_QR_DUE_DAYS ?? 1)

/** Segundos entre una verificacion del cobro y la siguiente. Igual que en Iza. */
export const SEGUNDOS_CICLO = Number(import.meta.env.VITE_QR_POLL_SECONDS ?? 60)

/** Tope de espera de una llamada al proxy. Sin esto un proxy caido cuelga la pantalla. */
export const TIMEOUT_MS = Number(import.meta.env.VITE_QR_TIMEOUT_MS ?? 30000)

/** Prefijo del transactionId. El proxy lo exige unico por suscriptor. */
export const PREFIJO_TRANSACCION = (import.meta.env.VITE_QR_TX_PREFIX ?? 'DEMO').trim()
