/**
 * Comprobante de un cobro. Es lo que se imprime y lo que se guarda cuando la impresion
 * no se pudo hacer en el momento.
 *
 * A diferencia de Iza, aqui **no hay un PDF del backend**: no hay backend. El comprobante
 * viaja como datos y el ticket se compone en el dispositivo. Eso tiene una ventaja para
 * la impresion pendiente: lo que se guarda es la informacion del cobro, no una imagen ya
 * rasterizada, de modo que al reimprimir sale con el mismo formato que si hubiera salido
 * al instante, y ocupa unos cientos de bytes en lugar de un PDF entero.
 */
export interface Comprobante {
  /** Version del formato. Un pendiente guardado por una version anterior se descarta. */
  version: 1
  /** Identificador del comprobante. Se imprime para poder rastrear el papel. */
  numero: string
  emitidoEn: string

  carnet: string
  nombreCliente: string

  numeroOperacion: string
  producto: string

  moneda: string
  monto: number

  /** Como se cobro. Cambia lo que el ticket puede afirmar sobre el pago. */
  canal: 'qr' | 'directo'

  // ── Datos del cobro por QR. Ausentes en el cobro directo. ──
  qrId: string | null
  transactionId: string | null
  fechaPago: string | null
  horaPago: string | null
  /**
   * Quien pago. **No tiene por que ser el titular del credito**: un familiar, el garante
   * o un tercero pueden pagar la cuota, y el papel tiene que dejar constancia de quien
   * fue. Por eso se guardan tambien su documento y su cuenta —enmascarada por el banco—
   * y no solo el nombre: dos personas pueden llamarse igual.
   *
   * Opcionales porque un comprobante emitido antes de que se guardaran no los tiene.
   */
  nombrePagador: string | null
  documentoPagador?: string | null
  cuentaPagador?: string | null
  codigoBancoOrigen: string | null
  codigoSucursal: string | null

  /** Usuario que atendio. Se imprime para saber a quien preguntar por este papel. */
  cajero: string
}

/**
 * El QR lo pago alguien distinto al titular del credito.
 *
 * Se compara el **conjunto de palabras** del nombre, no la cadena: el banco devuelve el
 * titular de la cuenta pagadora en su propio orden —«QUISPE MAMANI MARIA ELENA»— y una
 * comparacion literal marcaria como tercero a la misma persona.
 *
 * Es una heuristica y falla en los dos sentidos: un segundo nombre que el banco no trae
 * la hace ver como tercero, y dos homonimos pasan por la misma persona. Sirve para
 * resaltar el caso en pantalla y en el papel, no para decidir nada.
 */
export function esPagoDeTercero(comprobante: Comprobante): boolean {
  if (comprobante.canal !== 'qr' || !comprobante.nombrePagador) {
    return false
  }

  const pagador = palabrasDe(comprobante.nombrePagador)
  const titular = palabrasDe(comprobante.nombreCliente)

  if (pagador.size === 0 || titular.size === 0) {
    return false
  }

  return (
    pagador.size !== titular.size || [...pagador].some((p) => !titular.has(p))
  )
}

/** Palabras del nombre, sin acentos ni mayusculas, para poder compararlas. */
function palabrasDe(nombre: string): Set<string> {
  return new Set(
    nombre
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .split(/\s+/)
      .filter(Boolean),
  )
}
