/**
 * Comprobante de cobro: se construye, se compone para la impresora termica y se imprime.
 *
 * Iza imprime un PDF que arma el backend. Aqui no hay backend, asi que el ticket se
 * compone en el dispositivo con las primitivas de texto del plugin. Sale mas nitido que
 * rasterizar un PDF —la impresora usa su propia fuente en lugar de una imagen a 203 ppp—
 * y evita arrastrar `pdfjs-dist` a la aplicacion.
 */

import { CapacitorThermalPrinter } from 'capacitor-thermal-printer'

import { CODIGO_SUCURSAL } from '@/config/env'
import type { Cliente, Credito } from '@/models/clientes'
import { nombreCompleto } from '@/models/clientes'
import { esPagoDeTercero, type Comprobante } from '@/models/comprobante'
import type { QrPagado } from '@/models/pagos'
import {
  COLUMNAS_A as COLUMNAS,
  COLUMNAS_B,
  hayImpresoraNativa,
  imprimir,
  obtenerImpresoraPreferida,
  SinImpresoraError,
} from '@/helpers/printer.helper'

/** Nombre que encabeza el ticket. Es una demo: no se usa marca de ninguna entidad. */
const ENCABEZADO = 'COBRO MOVIL QR'

// ══════════════════════════════════════════════════════════
//  Construccion
// ══════════════════════════════════════════════════════════

/**
 * Arma el comprobante de un cobro. `pago` viene del banco cuando se cobro por QR; en el
 * cobro directo es `null` y el ticket lo dice, en lugar de dejar los campos en blanco y
 * que parezca un cobro por QR al que le faltan datos.
 */
export function construirComprobante(
  cliente: Cliente,
  credito: Credito,
  pago: QrPagado | null,
  cajero: string,
): Comprobante {
  const ahora = new Date()

  return {
    version: 1,
    numero: nuevoNumero(ahora),
    emitidoEn: ahora.toISOString(),
    carnet: cliente.carnet,
    nombreCliente: nombreCompleto(cliente),
    numeroOperacion: credito.numeroOperacion,
    producto: credito.producto,
    moneda: pago?.moneda ?? credito.moneda,
    monto: pago?.monto ?? credito.montoCuota,
    canal: pago ? 'qr' : 'directo',
    qrId: pago?.qrId ?? null,
    transactionId: pago?.transactionId ?? null,
    fechaPago: pago?.fechaPago ?? ahora.toISOString(),
    horaPago: pago?.horaPago ?? ahora.toLocaleTimeString('es-BO', { hour12: false }),
    nombrePagador: pago?.nombrePagador ?? null,
    documentoPagador: pago?.documentoPagador ?? null,
    cuentaPagador: pago?.cuentaPagador ?? null,
    codigoBancoOrigen: pago?.codigoBancoOrigen ?? null,
    codigoSucursal: pago?.codigoSucursal ?? CODIGO_SUCURSAL,
    cajero,
  }
}

/**
 * Comprobante de una cuota que ya figura cobrada pero nunca emitio uno: las que vienen
 * pagadas en los datos de demostracion.
 *
 * Reconstruye desde `credito.pago` en lugar de asumir un cobro en caja, porque perder el
 * `qrId` y el `transactionId` deja al cliente sin con que reclamar: son los unicos datos
 * que cruzan el papel con el reporte del banco.
 */
export function construirDesdeRegistro(
  cliente: Cliente,
  credito: Credito,
  cajero: string,
): Comprobante {
  const registro = credito.pago
  const base = construirComprobante(cliente, credito, null, cajero)

  if (!registro) {
    return base
  }

  return {
    ...base,
    canal: registro.canal,
    qrId: registro.qrId,
    transactionId: registro.transactionId,
    fechaPago: registro.fechaPago,
    horaPago: registro.horaPago,
    nombrePagador: registro.nombrePagador,
    documentoPagador: registro.documentoPagador ?? null,
    // El banco de origen y el pagador no se guardan en la cuota: si el cobro por QR se
    // emitio antes de que existiera el registro de comprobantes, ese dato no esta. Se
    // deja vacio en lugar de inventarlo.
    emitidoEn: registro.fechaPago,
  }
}

// ══════════════════════════════════════════════════════════
//  Impresion
// ══════════════════════════════════════════════════════════

/**
 * Imprime el comprobante.
 *
 * En el navegador abre el dialogo de impresion del sistema, que es el equivalente del
 * `abrirPDFEnWeb` de Iza: permite ver el ticket sin una impresora Bluetooth a mano.
 *
 * Lanza si no se pudo imprimir —`SinImpresoraError` cuando no hay ninguna configurada—.
 * Quien llama decide que hacer con eso; el registro del comprobante y la decision de
 * mostrarlo en pantalla viven en `vouchers.store` y en `useImpresion`, no aqui.
 */
export async function imprimirComprobante(comprobante: Comprobante): Promise<void> {
  if (!hayImpresoraNativa()) {
    imprimirEnWeb(comprobante)
    return
  }

  const { address } = obtenerImpresoraPreferida()

  if (!address) {
    throw new SinImpresoraError()
  }

  await imprimir(address, (impresora) => componerTicket(impresora, comprobante))
}

/**
 * Compone el ticket. El orden sigue el de un comprobante de caja: quien cobra, a quien,
 * por que operacion, cuanto, y con que constancia se puede reclamar.
 */
function componerTicket(
  impresora: typeof CapacitorThermalPrinter,
  c: Comprobante,
): void {
  impresora
    .align('center')
    .bold()
    .doubleHeight()
    .text(`${ENCABEZADO}\n`)
    .clearFormatting()
    .text('COMPROBANTE DE PAGO\n')
    .text(`${separador()}\n`)

  impresora
    .align('left')
    .text(linea('Nro', c.numero))
    .text(linea('Fecha', formatoFechaHora(c.emitidoEn)))
    .text(linea('Sucursal', c.codigoSucursal ?? '-'))
    .text(linea('Cajero', c.cajero))
    .text(`${separador()}\n`)

  impresora
    .bold()
    .text('CLIENTE\n')
    .clearFormatting()
    .text(`${c.nombreCliente}\n`)
    .text(linea('Carnet', c.carnet))
    .text(`${separador()}\n`)

  impresora
    .bold()
    .text('CREDITO\n')
    .clearFormatting()
    .text(linea('Operacion', c.numeroOperacion))
    .text(`${envolver(c.producto)}\n`)
    .text(`${separador()}\n`)

  // El monto en doble alto: es el dato que el cliente verifica de un vistazo.
  impresora
    .align('center')
    .bold()
    .doubleHeight()
    .text(`${c.moneda} ${formatoMonto(c.monto)}\n`)
    .clearFormatting()
    .align('left')
    .text(`${separador()}\n`)

  if (c.canal === 'qr') {
    impresora.bold().text('PAGO POR QR\n').clearFormatting()

    // Que pago un tercero se resalta: es lo que explica, meses despues, por que el recibo
    // de esta cuota esta a nombre de otra persona.
    if (esPagoDeTercero(c)) {
      impresora
        .align('center')
        .inverse()
        .text(' PAGO DE TERCERO \n')
        .clearFormatting()
        .align('left')
    }

    impresora
      .text(linea('Hora', c.horaPago ?? '-'))
      .text(linea('Pagador', c.nombrePagador ?? '-'))

    if (c.documentoPagador) {
      impresora.text(linea('Documento', c.documentoPagador))
    }

    if (c.cuentaPagador) {
      impresora.text(linea('Cuenta', c.cuentaPagador))
    }

    impresora.text(linea('Banco', c.codigoBancoOrigen ?? '-'))
      // Los identificadores van en fuente B, que entra mas caracteres por linea: el
      // transactionId pasa de 30 y en un rollo de 58 mm no entraria en fuente A. Partido
      // en dos lineas sigue siendo legible, pero quien lo copia a mano para un reclamo se
      // equivoca mucho mas.
      .font('B')
      .text(`${envolverEn(`QR: ${c.qrId ?? '-'}`, COLUMNAS_B)}\n`)
      .text(`${envolverEn(`Trx: ${c.transactionId ?? '-'}`, COLUMNAS_B)}\n`)
      .font('A')

    // El QR del identificador, no del cobro: sirve para buscar el movimiento en el
    // reporte del banco sin tipear el codigo a mano.
    if (c.qrId) {
      impresora.align('center').qr(c.qrId).align('left')
    }
  } else {
    impresora
      .bold()
      .text('PAGO REGISTRADO EN CAJA\n')
      .clearFormatting()
      .text(linea('Hora', c.horaPago ?? '-'))
      .text(`${envolver('Cobro registrado sin emision de QR.')}\n`)
  }

  impresora
    .text(`${separador()}\n`)
    .align('center')
    .text(`${envolver('Documento de demostracion. No tiene validez legal ni tributaria.')}\n`)
    .feedCutPaper()
}

/**
 * Fallback del navegador: abre el ticket en una ventana y lanza el dialogo de impresion.
 * Es el equivalente del `abrirPDFEnWeb` de Iza y existe para el mismo fin — poder ver el
 * comprobante sin una impresora Bluetooth delante.
 */
function imprimirEnWeb(c: Comprobante): void {
  const ventana = window.open('', '_blank', 'width=420,height=720')

  if (!ventana) {
    // Se propaga para que quede registrado como sin imprimir y se muestre en pantalla:
    // un bloqueador de ventanas emergentes no puede hacer perder el comprobante.
    throw new Error('El navegador bloqueo la ventana de impresion.')
  }

  ventana.document.write(ticketHtml(c))
  ventana.document.close()
  ventana.focus()
  // `onload` no siempre dispara con `document.write`: se espera un turno del bucle de
  // eventos para que el contenido este presentado antes de abrir el dialogo.
  setTimeout(() => ventana.print(), 150)
}

function ticketHtml(c: Comprobante): string {
  const filas = (pares: [string, string][]): string =>
    pares
      .map(([k, v]) => `<div class="f"><span>${escapar(k)}</span><span>${escapar(v)}</span></div>`)
      .join('')

  const bloquePago =
    c.canal === 'qr'
      ? `<h2>Pago por QR</h2>
         ${esPagoDeTercero(c) ? '<div class="tercero">PAGO DE TERCERO</div>' : ''}
         ${filas(
           [
             ['Hora', c.horaPago ?? '-'] as [string, string],
             ['Pagador', c.nombrePagador ?? '-'] as [string, string],
             ...(c.documentoPagador
               ? [['Documento', c.documentoPagador] as [string, string]]
               : []),
             ...(c.cuentaPagador
               ? [['Cuenta', c.cuentaPagador] as [string, string]]
               : []),
             ['Banco', c.codigoBancoOrigen ?? '-'] as [string, string],
           ],
         )}
         <div class="cod">QR: ${escapar(c.qrId ?? '-')}</div>
         <div class="cod">Trx: ${escapar(c.transactionId ?? '-')}</div>`
      : `<h2>Pago registrado en caja</h2>
         ${filas([['Hora', c.horaPago ?? '-']])}
         <p class="nota">Cobro registrado sin emision de QR.</p>`

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" />
<title>Comprobante ${escapar(c.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm; }
  body { width: 72mm; margin: 0 auto; padding: 6px 0;
         font: 12px/1.45 'Courier New', Courier, monospace; color: #000; }
  h1 { margin: 0; font-size: 15px; text-align: center; letter-spacing: 1px; }
  .sub { margin: 2px 0 8px; text-align: center; font-size: 11px; }
  h2 { margin: 8px 0 3px; font-size: 12px; }
  hr { border: none; border-top: 1px dashed #000; margin: 7px 0; }
  .f { display: flex; justify-content: space-between; gap: 8px; }
  .f span:last-child { text-align: right; overflow-wrap: anywhere; }
  .monto { margin: 8px 0; text-align: center; font-size: 18px; font-weight: bold; }
  .cod { font-size: 10px; overflow-wrap: anywhere; }
  .nota { margin: 4px 0; font-size: 10px; }
  .pie { margin-top: 8px; text-align: center; font-size: 10px; }
  .tercero { margin: 3px 0; padding: 2px 0; text-align: center; font-weight: bold;
             color: #fff; background: #000; }
</style></head>
<body>
  <h1>${ENCABEZADO}</h1>
  <div class="sub">COMPROBANTE DE PAGO</div>
  <hr />
  ${filas([
    ['Nro', c.numero],
    ['Fecha', formatoFechaHora(c.emitidoEn)],
    ['Sucursal', c.codigoSucursal ?? '-'],
    ['Cajero', c.cajero],
  ])}
  <hr />
  <h2>Cliente</h2>
  <div>${escapar(c.nombreCliente)}</div>
  ${filas([['Carnet', c.carnet]])}
  <hr />
  <h2>Credito</h2>
  ${filas([['Operacion', c.numeroOperacion]])}
  <div>${escapar(c.producto)}</div>
  <hr />
  <div class="monto">${escapar(c.moneda)} ${formatoMonto(c.monto)}</div>
  <hr />
  ${bloquePago}
  <hr />
  <div class="pie">Documento de demostracion.<br />No tiene validez legal ni tributaria.</div>
</body></html>`
}

// ══════════════════════════════════════════════════════════
//  Formato
// ══════════════════════════════════════════════════════════

/**
 * Etiqueta a la izquierda y valor a la derecha, rellenando con puntos. La impresora no
 * tiene tabulaciones ni ancho proporcional: alinear es contar caracteres.
 */
function linea(etiqueta: string, valor: string): string {
  const texto = String(valor ?? '-')
  // -2 por los dos espacios que rodean los puntos: `etiqueta .... valor`. Restar uno
  // solo deja la linea en COLUMNAS+1 y la impresora la parte en dos.
  const espacio = COLUMNAS - etiqueta.length - texto.length - 2

  if (espacio < 1) {
    // No entra en una linea: se parte en dos antes que dejar que la impresora la corte
    // por la mitad en un lugar cualquiera.
    return `${etiqueta}:\n${envolver(texto)}\n`
  }

  return `${etiqueta} ${'.'.repeat(espacio)} ${texto}\n`
}

/** Parte el texto en lineas de `COLUMNAS` sin cortar palabras al medio. */
function envolver(texto: string): string {
  return envolverEn(texto, COLUMNAS)
}

/** Igual, para un ancho distinto: la fuente B entra mas caracteres en la misma linea. */
function envolverEn(texto: string, columnas: number): string {
  const lineas: string[] = []
  let actual = ''

  const empujar = (): void => {
    if (actual) {
      lineas.push(actual)
      actual = ''
    }
  }

  for (const palabra of String(texto).split(/\s+/)) {
    if (!palabra) continue

    // Una palabra mas larga que la linea —un identificador, siempre— se parte en trozos
    // y **nunca se recorta**: un transactionId al que le falta el ultimo caracter no
    // sirve para reclamar, y el que lee el papel no tiene como saber que esta incompleto.
    if (palabra.length > columnas) {
      empujar()
      for (let i = 0; i < palabra.length; i += columnas) {
        lineas.push(palabra.slice(i, i + columnas))
      }
      continue
    }

    if (actual.length + palabra.length + (actual ? 1 : 0) > columnas) {
      empujar()
      actual = palabra
    } else {
      actual = actual ? `${actual} ${palabra}` : palabra
    }
  }

  empujar()
  return lineas.join('\n')
}

function separador(): string {
  return '-'.repeat(COLUMNAS)
}

function formatoMonto(monto: number): string {
  return monto.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatoFechaHora(iso: string): string {
  const fecha = new Date(iso)
  return `${fecha.toLocaleDateString('es-BO')} ${fecha.toLocaleTimeString('es-BO', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })}`
}

/** Numero del comprobante. Lleva sufijo aleatorio por el mismo motivo que el transactionId. */
function nuevoNumero(emision: Date): string {
  const marca = [
    `${emision.getFullYear()}`.slice(2),
    `${emision.getMonth() + 1}`.padStart(2, '0'),
    `${emision.getDate()}`.padStart(2, '0'),
    `${emision.getHours()}`.padStart(2, '0'),
    `${emision.getMinutes()}`.padStart(2, '0'),
    `${emision.getSeconds()}`.padStart(2, '0'),
  ].join('')

  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  const sufijo = Array.from(bytes, (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()

  return `${marca}-${sufijo}`
}

/** El comprobante lleva datos que se muestran como HTML en el fallback web. */
function escapar(texto: string): string {
  return String(texto).replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  )
}
