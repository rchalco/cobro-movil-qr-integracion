/**
 * Cobros por QR de Banco Economico.
 *
 * Es el equivalente de `EnginePagosQr` de Iza. Alli esta logica vive en el backend y la
 * caja solo consume tres metodos; aqui, sin BFF, corre en el navegador contra el proxy.
 * Se conservan los mismos tres metodos y la misma semantica de estados para que el
 * mecanismo sea el mismo y se pueda mover a un backend propio sin tocar las pantallas.
 */

import {
  CODIGO_SUCURSAL,
  DIAS_VIGENCIA,
  MONEDA,
  PREFIJO_TRANSACCION,
} from '@/config/env'
import {
  EstadoRespuesta,
  type CausaFallo,
  type QrPagado,
  type QrTransaccion,
  type Resultado,
  type ResultadoLista,
} from '@/models/pagos'
import {
  aFechaIso,
  generarQr,
  obtenerQrsPagados,
  QrProxyError,
  type PagoQrResponse,
} from './qrProxy.client'

/**
 * Emite el QR de cobro de una cuota: un solo uso y monto fijo. Cada llamada genera un
 * codigo nuevo, asi que no debe invocarse dos veces para la misma cuota o quedarian dos
 * QR cobrables por el mismo importe.
 */
export async function generaQrTransaccion(
  monto: number,
  descripcion: string | null = null,
  codigoSucursal: string | null = null,
): Promise<Resultado<QrTransaccion>> {
  try {
    if (!monto || monto <= 0) {
      // Con monto fijo un QR en cero es incobrable: el pagador no puede corregirlo.
      return error('El monto del QR debe ser mayor a cero.')
    }

    const sucursal = preferido(codigoSucursal, CODIGO_SUCURSAL)
    if (!sucursal) {
      // Sin sucursal el reporte de cobros no permite saber donde se pago.
      return error('No se indico la sucursal y no hay una configurada.')
    }

    const emision = new Date()
    const vencimiento = new Date(emision)
    vencimiento.setHours(0, 0, 0, 0)
    vencimiento.setDate(vencimiento.getDate() + DIAS_VIGENCIA)

    const transactionId = nuevoTransactionId(sucursal, emision)
    const glosa = preferido(
      descripcion,
      `Cobro QR ${sucursal} ${emision.toLocaleString('es-BO')}`,
    )

    const respuesta = await generarQr({
      transactionId,
      currency: MONEDA,
      amount: monto,
      description: glosa,
      dueDate: aFechaIso(vencimiento),
      singleUse: true,
      modifyAmount: false,
      branchCode: sucursal,
    })

    return {
      state: EstadoRespuesta.Success,
      message: 'QR de cobro generado correctamente.',
      data: {
        qrId: respuesta.qrId!,
        qrImageBase64: respuesta.qrImage!,
        transactionId,
        monto,
        moneda: MONEDA,
        codigoSucursal: sucursal,
        descripcion: glosa,
        fechaEmision: emision.toISOString(),
        fechaVencimiento: vencimiento.toISOString(),
        usoUnico: true,
        montoEditable: false,
      },
    }
  } catch (e) {
    return error(...fallo(e, 'No se pudo generar el QR de cobro.'))
  }
}

/**
 * Verifica si un QR puntual ya fue cobrado.
 *
 * El proxy no expone consulta de estado por QR, asi que se filtra el reporte del dia por
 * `qrId`. En Iza ese filtro queda en el backend para que ningun punto de venta reciba la
 * operativa completa de la cuenta; **aqui ocurre en el navegador**, que por tanto ve
 * todos los cobros del suscriptor en la fecha. Es una diferencia de la demo, no del
 * mecanismo: con un BFF propio el filtro vuelve al servidor.
 */
export async function consultaPagoQr(
  qrId: string,
  fecha: Date,
): Promise<Resultado<QrPagado>> {
  try {
    if (!qrId?.trim()) {
      return error('No se indico el qrId a verificar.')
    }

    if (esFutura(fecha)) {
      return error('La fecha de la consulta no puede ser futura.')
    }

    const pagos = await obtenerQrsPagados(fecha)
    const pago = pagos.find(
      (p) => p.qrId?.toUpperCase() === qrId.trim().toUpperCase(),
    )

    if (!pago) {
      // NoData es «todavia no pago», no un fallo: la pantalla lo usa para seguir esperando.
      return {
        state: EstadoRespuesta.NoData,
        message: 'El QR aun no registra el cobro.',
        data: null,
      }
    }

    return {
      state: EstadoRespuesta.Success,
      message: 'Cobro por QR verificado correctamente.',
      data: mapear(pago),
    }
  } catch (e) {
    return error(...fallo(e, 'No se pudo verificar el cobro del QR.'))
  }
}

/**
 * Cobros por QR acreditados en una fecha. El banco reporta por dia, no por rango: para
 * un periodo hay que iterar dia a dia.
 */
export async function obtieneQrsPagados(
  fecha: Date,
): Promise<ResultadoLista<QrPagado>> {
  try {
    if (esFutura(fecha)) {
      return {
        state: EstadoRespuesta.Error,
        message: 'La fecha del reporte no puede ser futura.',
        listEntities: [],
      }
    }

    const pagos = (await obtenerQrsPagados(fecha)).map(mapear)

    if (pagos.length === 0) {
      return {
        state: EstadoRespuesta.NoData,
        message: `No hay cobros por QR registrados el ${fecha.toLocaleDateString('es-BO')}.`,
        listEntities: [],
      }
    }

    return {
      state: EstadoRespuesta.Success,
      message: 'Reporte de QR pagados obtenido correctamente.',
      listEntities: pagos,
    }
  } catch (e) {
    const [message, causa] = fallo(e, 'No se pudo obtener el reporte de cobros.')
    return { state: EstadoRespuesta.Error, message, causa, listEntities: [] }
  }
}

/**
 * Identificador unico por suscriptor que exige el proxy. Lleva sufijo aleatorio porque
 * dos equipos emitiendo en el mismo segundo produciran una colision (409) si solo
 * dependiera de la marca de tiempo.
 */
function nuevoTransactionId(sucursal: string, emision: Date): string {
  const marca = [
    emision.getFullYear(),
    `${emision.getMonth() + 1}`.padStart(2, '0'),
    `${emision.getDate()}`.padStart(2, '0'),
    `${emision.getHours()}`.padStart(2, '0'),
    `${emision.getMinutes()}`.padStart(2, '0'),
    `${emision.getSeconds()}`.padStart(2, '0'),
  ].join('')

  return `${PREFIJO_TRANSACCION}-${sucursal}-${marca}-${sufijoAleatorio()}`
}

/** 8 hex de `crypto`. `Math.random` colisiona lo suficiente como para costar un 409. */
function sufijoAleatorio(): string {
  const bytes = new Uint8Array(4)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

function mapear(pago: PagoQrResponse): QrPagado {
  return {
    qrId: pago.qrId,
    transactionId: pago.transactionId,
    fechaPago: pago.paymentDate,
    horaPago: pago.paymentTime,
    moneda: pago.currency,
    monto: pago.amount,
    codigoBancoOrigen: pago.senderBankCode,
    nombrePagador: pago.senderName,
    documentoPagador: pago.senderDocumentId,
    cuentaPagador: pago.senderAccount,
    descripcion: pago.description,
    codigoSucursal: pago.branchCode,
  }
}

function esFutura(fecha: Date): boolean {
  const hoy = new Date()
  hoy.setHours(23, 59, 59, 999)
  return fecha.getTime() > hoy.getTime()
}

function preferido(valor: string | null, porDefecto: string): string {
  return valor?.trim() ? valor.trim() : porDefecto
}

/**
 * Extrae mensaje y causa de un fallo. Un error inesperado —un bug de esta capa, no del
 * servidor— se registra en consola y se presenta con un texto generico: al operador no le
 * sirve un stack, y la causa queda como `http` para que la pantalla no lo ofrezca como
 * un problema de conexion que reintentar no va a resolver.
 */
function fallo(e: unknown, porDefecto: string): [mensaje: string, causa: CausaFallo] {
  if (e instanceof QrProxyError) {
    return [e.message, e.causa]
  }
  console.error(porDefecto, e)
  return [porDefecto, 'http']
}

function error<T>(mensaje: string, causa: CausaFallo = 'http'): Resultado<T> {
  return { state: EstadoRespuesta.Error, message: mensaje, data: null, causa }
}
