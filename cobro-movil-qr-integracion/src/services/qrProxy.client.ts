/**
 * Cliente del proxy qr-banco-economico.
 *
 * Es el equivalente de `QrBancoEconomicoClient` de Iza, pero corriendo en el navegador:
 * esta demo no tiene BFF propio, asi que habla con el proxy directamente. Expone solo lo
 * que el proxy expone a un suscriptor —emitir un QR y listar los cobros de un dia—
 * porque no hay mas: el proxy no publica consulta de estado por QR.
 *
 * Consecuencias de no tener BFF, que conviene tener presentes al leer este archivo:
 *  1. La API Key tiene que llegar de algun lado. En desarrollo la inyecta el dev-server
 *     de Vite (ver `vite.config.ts`) y no entra al bundle; en modo directo la lleva el
 *     navegador y queda expuesta.
 *  2. El filtro por `qrId` que en Iza hace el backend aqui ocurre en el cliente, de modo
 *     que el navegador recibe el reporte completo del dia del suscriptor.
 *  3. El proxy no declara CORS, asi que el modo directo solo funciona desde un origen
 *     que no lo imponga (Capacitor nativo) o si el proxy lo habilita.
 */

import type { CausaFallo } from '@/models/pagos'
import { esFalloDeConexion } from '@/models/pagos'
import {
  QR_BASE_URL,
  QR_CUENTA_BANECO,
  TIMEOUT_MS,
  USA_DEV_SERVER,
} from '@/config/env'
import { obtenerApiKey } from './credenciales'

const CABECERA_API_KEY = 'X-Api-Key'
const CABECERA_CUENTA = 'X-Baneco-Account'

/** Falla esperada de la integracion. El mensaje es accionable y no lleva secretos. */
export class QrProxyError extends Error {
  constructor(
    mensaje: string,
    readonly causa: CausaFallo = 'http',
  ) {
    super(mensaje)
    this.name = 'QrProxyError'
  }

  /**
   * El servidor no se pudo alcanzar. Es distinto de que respondiera con un error: aqui
   * no hubo conversacion, asi que reintentar tiene sentido y no hay nada que corregir en
   * la solicitud.
   */
  get esDeConexion(): boolean {
    return esFalloDeConexion(this.causa)
  }
}

/** Texto unico para el fallo de conexion, para que suene igual en toda la aplicacion. */
export const MENSAJE_SIN_CONEXION = 'No hay conexion con el servidor de cobros.'

/**
 * Comprueba la conectividad contra `/health`, el unico endpoint anonimo del proxy.
 *
 * Sirve para afirmar «no hay conexion» con certeza en lugar de deducirlo: permite
 * separar un servidor caido de una ruta que responde 404 por otra razon, sin gastar una
 * API Key ni tocar un endpoint con efectos.
 */
export async function hayConexion(): Promise<boolean> {
  try {
    const control = new AbortController()
    const temporizador = setTimeout(() => control.abort(), 5000)

    try {
      const respuesta = await fetch(`${QR_BASE_URL}/health`, {
        method: 'GET',
        signal: control.signal,
      })
      // El 404 del dev-server sin reenvio tambien cae aqui: llega respuesta, pero no del
      // proxy. Solo un 2xx confirma que del otro lado hay un servidor de cobros.
      return respuesta.ok
    } finally {
      clearTimeout(temporizador)
    }
  } catch {
    return false
  }
}

/** Cuerpo de emision de QR. Espeja `GenerateQrRequest` del proxy. */
export interface GenerarQrRequest {
  transactionId: string
  currency: string
  amount: number
  description: string | null
  /** `yyyy-MM-dd`: el proxy lo recibe como `DateOnly`. */
  dueDate: string
  singleUse: boolean
  modifyAmount: boolean
  branchCode: string | null
}

/** Espeja `GenerateQrResponse`. */
export interface GenerarQrResponse {
  responseCode: number
  message: string
  qrId: string | null
  qrImage: string | null
}

/** Espeja `PaymentQr`. */
export interface PagoQrResponse {
  qrId: string
  transactionId: string | null
  paymentDate: string
  paymentTime: string | null
  currency: string
  amount: number
  senderBankCode: string | null
  senderName: string | null
  senderDocumentId: string | null
  senderAccount: string | null
  description: string | null
  branchCode: string | null
}

/**
 * Emite un QR de cobro. Devuelve el identificador del banco y la imagen en Base64.
 *
 * `singleUse` y `modifyAmount` van fijos y no se parametrizan a proposito: son lo que
 * hace que el cobro sea verificable por `qrId`. Con `modifyAmount` el pagador podria
 * alterar el importe, y sin `singleUse` un mismo codigo acumularia cobros de varias
 * cuotas y el `qrId` dejaria de identificar a una sola.
 */
export async function generarQr(cuerpo: GenerarQrRequest): Promise<GenerarQrResponse> {
  const respuesta = await enviar<GenerarQrResponse>(
    'POST',
    'api/baneco/qrs',
    'generar el QR',
    cuerpo,
  )

  if (respuesta.responseCode !== 0) {
    throw new QrProxyError(
      `Baneco rechazo la emision del QR: ${respuesta.message || 'sin detalle'}`,
    )
  }

  if (!respuesta.qrId || !respuesta.qrImage) {
    throw new QrProxyError('El proxy respondio sin qrId o sin imagen del QR.')
  }

  return respuesta
}

/**
 * Lista los QR cobrados de una fecha. El proxy ya los filtra a los emitidos por este
 * suscriptor; dentro de ese conjunto no hay mas filtro del lado del servidor.
 */
export async function obtenerQrsPagados(fecha: Date): Promise<PagoQrResponse[]> {
  const pagos = await enviar<PagoQrResponse[] | null>(
    'GET',
    `api/baneco/qrs/paid/${aFechaIso(fecha)}`,
    'consultar los QR pagados',
  )

  return pagos ?? []
}

/**
 * Fecha en formato local `yyyy-MM-dd`. `toISOString()` la pasaria a UTC y en Bolivia
 * (UTC-4) el reporte terminaria pidiendo el dia anterior durante toda la tarde.
 */
export function aFechaIso(fecha: Date): string {
  const anio = fecha.getFullYear()
  const mes = `${fecha.getMonth() + 1}`.padStart(2, '0')
  const dia = `${fecha.getDate()}`.padStart(2, '0')
  return `${anio}-${mes}-${dia}`
}

async function enviar<T>(
  metodo: 'GET' | 'POST',
  rutaRelativa: string,
  accion: string,
  cuerpo?: unknown,
): Promise<T> {
  const control = new AbortController()
  const temporizador = setTimeout(() => control.abort(), TIMEOUT_MS)

  let respuesta: Response
  try {
    respuesta = await fetch(`${QR_BASE_URL}/${rutaRelativa}`, {
      method: metodo,
      headers: await cabeceras(cuerpo !== undefined),
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
      signal: control.signal,
    })
  } catch (error) {
    if (control.signal.aborted) {
      throw new QrProxyError(
        `${MENSAJE_SIN_CONEXION} No respondio en ${Math.round(TIMEOUT_MS / 1000)} s al ` +
          `${accion}.`,
        'timeout',
      )
    }
    // `fetch` no distingue un servidor caido de un rechazo por CORS: en ambos casos
    // rechaza sin respuesta. Se nombran los dos porque el operador no puede saber cual es.
    throw new QrProxyError(
      `${MENSAJE_SIN_CONEXION} No se pudo contactar a ${QR_BASE_URL} para ${accion}. ` +
        'Verifique que el proxy qr-banco-economico este levantado y que acepte el origen ' +
        'de esta aplicacion.',
      'sin-conexion',
    )
  } finally {
    clearTimeout(temporizador)
  }

  const texto = await respuesta.text()

  if (!respuesta.ok) {
    throw new QrProxyError(...describirError(respuesta.status, texto, accion))
  }

  if (!texto.trim()) {
    throw new QrProxyError(
      `El servidor de cobros devolvio una respuesta vacia al ${accion}.`,
      'protocolo',
    )
  }

  try {
    return JSON.parse(texto) as T
  } catch {
    throw new QrProxyError(
      `El servidor de cobros devolvio una respuesta ilegible al ${accion}.`,
      'protocolo',
    )
  }
}

/**
 * Cabeceras de la solicitud. La API Key va **siempre**, tambien en desarrollo: el
 * dev-server solo reenvia para sortear CORS y no toca las cabeceras, asi que si el
 * navegador no la manda no la manda nadie.
 */
async function cabeceras(conCuerpo: boolean): Promise<HeadersInit> {
  const headers: Record<string, string> = { Accept: 'application/json' }

  if (conCuerpo) {
    headers['Content-Type'] = 'application/json'
  }

  const apiKey = await obtenerApiKey()

  if (!apiKey) {
    throw new QrProxyError(
      'Falta la API Key del proxy. Definala en VITE_QR_API_KEY dentro de .env y vuelva ' +
        'a levantar la aplicacion.',
      'autenticacion',
    )
  }

  headers[CABECERA_API_KEY] = apiKey

  if (QR_CUENTA_BANECO) {
    headers[CABECERA_CUENTA] = QR_CUENTA_BANECO
  }

  return headers
}

/**
 * Traduce el estado HTTP a una causa concreta. Sin esto, un 401 por API Key vencida y un
 * 409 por cuenta de ahorro faltante llegarian al operador como el mismo «error de
 * servicio» y nadie sabria a quien llamar.
 *
 * El cuerpo decide en dos estados ambiguos. Un 404 y un 502 pueden venir del servidor de
 * cobros o del dev-server que esta en el medio, y significan cosas opuestas:
 *
 *  - **404 sin cuerpo**: nadie atendio la ruta. En modo dev-server es la firma de que el
 *    reenvio no quedo registrado, porque las rutas del proxy son fijas y correctas.
 *  - **502 sin cuerpo**: el dev-server no pudo alcanzar al proxy. El 502 legitimo del
 *    proxy —«Baneco no respondio»— siempre trae su JSON.
 *
 * Confundirlos manda al operador a revisar el banco cuando el problema es que el
 * servidor no esta levantado.
 */
function describirError(
  estado: number,
  cuerpo: string,
  accion: string,
): [mensaje: string, causa: CausaFallo] {
  const detalle = extraerMensaje(cuerpo)
  const sinCuerpo = !cuerpo.trim()

  if (estado === 404 && sinCuerpo) {
    return USA_DEV_SERVER
      ? [
          `${MENSAJE_SIN_CONEXION} El dev-server no tiene registrado el reenvio al ` +
            `proxy, asi que ${QR_BASE_URL} no lleva a ninguna parte. Revise ` +
            'VITE_QR_BASE_URL en .env y vuelva a levantar `npm run dev`.',
          'sin-reenvio',
        ]
      : [
          `${MENSAJE_SIN_CONEXION} ${QR_BASE_URL} respondio 404 al ${accion}: en esa ` +
            'direccion no hay un servidor de cobros, o la URL base con la que se compilo ' +
            'es incorrecta. Revise VITE_QR_BASE_URL y vuelva a compilar.',
          'sin-conexion',
        ]
  }

  if ((estado === 502 || estado === 504) && sinCuerpo && USA_DEV_SERVER) {
    return [
      `${MENSAJE_SIN_CONEXION} El dev-server no pudo alcanzar al proxy al ${accion}. ` +
        'Verifique que qr-banco-economico este levantado en la direccion de ' +
        'VITE_QR_BASE_URL.',
      'sin-conexion',
    ]
  }

  if (estado === 503) {
    return [
      `${MENSAJE_SIN_CONEXION} El servidor de cobros no esta disponible en este momento.`,
      'sin-conexion',
    ]
  }

  const [causa, motivo]: [CausaFallo, string] =
    estado === 401
      ? ['autenticacion', 'la API Key es invalida, fue revocada o corresponde a otro ambiente']
      : estado === 403
        ? ['autenticacion', "la API Key no tiene los alcances 'qr:write'/'qr:read' o la cuenta no le fue concedida"]
        : estado === 409
          ? ['conflicto', 'el proxy rechazo la operacion por conflicto (transactionId repetido o suscriptor sin cuenta de ahorro cargada)']
          : estado === 429
            ? ['cuota', 'se supero la cuota por minuto del suscriptor; reintente en unos segundos']
            : estado === 502
              ? ['banco', 'Baneco no respondio correctamente al proxy']
              : ['http', `el servidor de cobros respondio ${estado}`]

  const mensaje = detalle
    ? `No se pudo ${accion}: ${motivo}. Detalle: ${detalle}`
    : `No se pudo ${accion}: ${motivo}.`

  return [mensaje, causa]
}

function extraerMensaje(cuerpo: string): string {
  if (!cuerpo.trim()) {
    return ''
  }

  try {
    const json = JSON.parse(cuerpo) as {
      message?: string
      detail?: string
      title?: string
    }
    // `detail` antes que `title`: en los ProblemDetails del proxy el titulo es la
    // categoria («No autenticado») y el detalle es lo accionable («Envie una API Key
    // valida en la cabecera X-Api-Key»).
    const mensaje = json.message ?? json.detail ?? json.title
    if (mensaje) {
      return mensaje
    }
  } catch {
    // El proxy tambien devuelve texto plano y ValidationProblemDetails: se usa el crudo.
  }

  const recortado = cuerpo.trim()
  return recortado.length > 300 ? `${recortado.slice(0, 300)}...` : recortado
}
