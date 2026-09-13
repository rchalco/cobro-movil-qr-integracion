/**
 * Modelos de cobro por QR. Espejan los DTO de Iza (`QrTransaccionDTO`/`QrPagadoDTO`),
 * que a su vez espejan el contrato del proxy qr-banco-economico. Se mantienen los
 * mismos nombres para que el mecanismo sea trazable entre los tres proyectos.
 */

/**
 * QR de cobro emitido para una sola cuota. De un solo uso y monto fijo: el cobro se
 * verifica por `qrId`, de modo que un pago acreditado sobre ese codigo pertenece a esa
 * cuota y a ninguna otra.
 */
export interface QrTransaccion {
  qrId: string
  qrImageBase64: string
  transactionId: string
  monto: number
  moneda: string
  codigoSucursal: string
  descripcion: string
  fechaEmision: string
  fechaVencimiento: string
  usoUnico: boolean
  montoEditable: boolean
}

/** Cobro acreditado sobre un QR. */
export interface QrPagado {
  qrId: string
  transactionId: string | null
  fechaPago: string
  horaPago: string | null
  moneda: string
  monto: number
  codigoBancoOrigen: string | null
  nombrePagador: string | null
  documentoPagador: string | null
  cuentaPagador: string | null
  descripcion: string | null
  codigoSucursal: string | null
}

/**
 * Estados de respuesta de Iza (`ResponseType`). Se conservan porque el flujo de la
 * pantalla de cobro depende de distinguir «todavia no pago» de «fallo»: `NoData` es la
 * respuesta normal mientras el cajero espera, no un error.
 */
export enum EstadoRespuesta {
  Success = 1,
  Error = 2,
  NoData = 4,
}

/**
 * Causa de un fallo, ya clasificada. El mensaje solo no alcanza: la pantalla necesita
 * saber si lo que fallo fue la conexion —para ofrecer reintentar y no seguir sondeando
 * contra un servidor que no esta— o si el servidor respondio y rechazo la operacion.
 */
export type CausaFallo =
  /** No se alcanzo al servidor: esta caido, no es alcanzable o la red no responde. */
  | 'sin-conexion'
  /** El dev-server de Vite no tiene configurado el reenvio al proxy. */
  | 'sin-reenvio'
  /** El servidor no respondio dentro del tiempo maximo. */
  | 'timeout'
  /** API Key invalida, revocada, sin alcances o de otro ambiente. */
  | 'autenticacion'
  /** transactionId repetido o suscriptor sin cuenta de ahorro cargada. */
  | 'conflicto'
  /** Se supero la cuota por minuto del suscriptor. */
  | 'cuota'
  /** El proxy respondio, pero Baneco fallo por detras. */
  | 'banco'
  /** El servidor respondio algo que no se pudo interpretar. */
  | 'protocolo'
  /** Cualquier otro estado HTTP. */
  | 'http'

/** Causas en las que no hubo conversacion con el servidor: reintentar tiene sentido. */
export const CAUSAS_DE_CONEXION: readonly CausaFallo[] = [
  'sin-conexion',
  'sin-reenvio',
  'timeout',
]

export function esFalloDeConexion(causa: CausaFallo | undefined): boolean {
  return causa !== undefined && CAUSAS_DE_CONEXION.includes(causa)
}

export interface Resultado<T> {
  state: EstadoRespuesta
  message: string
  data: T | null
  /** Presente solo cuando `state` es `Error`. */
  causa?: CausaFallo
}

export interface ResultadoLista<T> {
  state: EstadoRespuesta
  message: string
  listEntities: T[]
  /** Presente solo cuando `state` es `Error`. */
  causa?: CausaFallo
}
