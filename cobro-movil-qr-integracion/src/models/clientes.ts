/** Cartera mockeada de la demo. */

export type EstadoCredito = 'pagado' | 'pendiente'

export interface Credito {
  id: string
  /** Numero de operacion del credito, el que ve el cliente en su plan de pagos. */
  numeroOperacion: string
  producto: string
  /** Cuota exigible. Es el monto que viaja fijo en el QR. */
  montoCuota: number
  moneda: string
  fechaVencimiento: string
  estado: EstadoCredito
  /** Datos del cobro acreditado. Solo presente cuando `estado` es `pagado`. */
  pago: PagoRegistrado | null
}

/**
 * Constancia del cobro. Guarda `qrId` porque es lo que permite reconciliar la cuota
 * contra el reporte del banco: es el unico dato comun entre ambos lados.
 */
export interface PagoRegistrado {
  qrId: string | null
  transactionId: string | null
  fechaPago: string
  horaPago: string | null
  /** Como se cobro. `qr` con la funcionalidad encendida; `directo` con ella apagada. */
  canal: 'qr' | 'directo'
  /** Quien pago, que puede no ser el titular. Ver `Comprobante`. */
  nombrePagador: string | null
  documentoPagador?: string | null
}

export interface Cliente {
  id: string
  /** Documento de identidad. Es la clave de busqueda de la pantalla. */
  carnet: string
  nombres: string
  apellidos: string
  creditos: Credito[]
}

export function nombreCompleto(cliente: Cliente): string {
  return `${cliente.nombres} ${cliente.apellidos}`.trim()
}
