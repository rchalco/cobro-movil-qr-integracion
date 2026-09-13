/**
 * Impresora termica Bluetooth. Portado de `PrinterHelper` de Iza, con la misma plomeria:
 * impresora preferida en el equipo, conexion con reintento, tiempo limite en cada
 * operacion y una impresion pendiente que sobrevive al fallo.
 *
 * Por que cada pieza existe, que es lo que no se ve leyendo las firmas:
 *
 *  - **Tiempo limite en todo.** Las operaciones Bluetooth del plugin pueden no resolver
 *    nunca si la impresora se apago en medio. Sin el tope, la pantalla queda colgada y el
 *    cajero no sabe si imprimio.
 *  - **Reintento de conexion.** `connect` falla si ya habia una conexion abierta; se
 *    detecta ese caso y se sigue. Si el fallo es otro, se desconecta y se vuelve a
 *    intentar una vez: es lo que resuelve la impresora que quedo a medias del turno
 *    anterior.
 *  - **Nada de estado de comprobantes.** Que hacer con el que no se pudo imprimir es
 *    decision de `vouchers.store`, que es el registro unico. Este archivo solo sabe
 *    hablar con la impresora.
 */

import { Capacitor } from '@capacitor/core'
import {
  CapacitorThermalPrinter,
  type BluetoothDevice,
} from 'capacitor-thermal-printer'

/** Tope de espera de una operacion Bluetooth. El mismo que usa Iza. */
const TIEMPO_LIMITE_MS = 10000

/**
 * Ancho del **papel** en milimetros: 80 para las portatiles de recibos, 58 para las de
 * bolsillo. Se nombra el papel y no el area imprimible porque es lo que uno compra y lo
 * que dice la caja de la impresora; el area imprimible sale de la tabla de abajo.
 */
export const ANCHO_PAPEL_MM = Number(import.meta.env.VITE_PRINTER_PAPER_MM ?? 80)

/**
 * Puntos imprimibles por ancho de papel.
 *
 * Son valores fijos de la cabeza termica, no «el papel menos los margenes»: una de 80 mm
 * imprime 576 puntos y una de 58 mm, 384. Por eso se toman de una tabla en vez de
 * convertir milimetros, que daba 575 y dejaba el ticket una columna mas angosto de lo que
 * la impresora admite.
 */
const PUNTOS_IMPRIMIBLES: Record<number, number> = { 80: 576, 58: 384 }

/** Resolucion de las termicas de recibos. Es 203 ppp en practicamente todas. */
const PPP = 203

/** Para un ancho fuera de la tabla se estima descontando 8 mm de margenes. */
const PUNTOS =
  PUNTOS_IMPRIMIBLES[ANCHO_PAPEL_MM] ??
  Math.floor(((ANCHO_PAPEL_MM - 8) * PPP) / 25.4)

/**
 * Caracteres por linea. La fuente A ocupa 12 puntos de ancho y la B, 9.
 * Papel de 80 mm: 48 y 64 columnas. Papel de 58 mm: 32 y 42.
 */
export const COLUMNAS_A = Math.floor(PUNTOS / 12)
export const COLUMNAS_B = Math.floor(PUNTOS / 9)

/**
 * Area imprimible en milimetros, que es lo que espera `limitWidth`. Sirve solo para las
 * imagenes —el plugin lo documenta como formato de imagen— y el ticket es texto, pero se
 * fija igual para que el QR no se escale contra el valor inicial de 45 mm del plugin.
 */
export const ANCHO_IMPRIMIBLE_MM = Math.round((PUNTOS * 25.4) / PPP)

const CLAVE_IMPRESORA = 'cobroMovilQr.impresoraPreferida'
const CLAVE_IMPRESORA_NOMBRE = 'cobroMovilQr.impresoraPreferidaNombre'

export interface ImpresoraGuardada {
  address: string | null
  name: string | null
}

/** No hay impresora configurada en este equipo. La pantalla debe llevar a configurarla. */
export class SinImpresoraError extends Error {
  constructor() {
    super('No hay una impresora configurada en este equipo.')
    this.name = 'SinImpresoraError'
  }
}

/**
 * La aplicacion corre sobre Capacitor y puede hablar con la impresora. En el navegador el
 * plugin no tiene implementacion util: alli se imprime por el dialogo del sistema.
 */
export function hayImpresoraNativa(): boolean {
  return Capacitor.isNativePlatform()
}

// ══════════════════════════════════════════════════════════
//  Impresora preferida
// ══════════════════════════════════════════════════════════

export function obtenerImpresoraPreferida(): ImpresoraGuardada {
  try {
    return {
      address: localStorage.getItem(CLAVE_IMPRESORA),
      name: localStorage.getItem(CLAVE_IMPRESORA_NOMBRE),
    }
  } catch {
    return { address: null, name: null }
  }
}

export function guardarImpresoraPreferida(
  device: Pick<BluetoothDevice, 'address' | 'name'>,
): void {
  try {
    localStorage.setItem(CLAVE_IMPRESORA, device.address)

    if (device.name) {
      localStorage.setItem(CLAVE_IMPRESORA_NOMBRE, device.name)
    } else {
      localStorage.removeItem(CLAVE_IMPRESORA_NOMBRE)
    }
  } catch (e) {
    console.error('No se pudo guardar la impresora preferida', e)
  }
}

export function olvidarImpresoraPreferida(): void {
  try {
    localStorage.removeItem(CLAVE_IMPRESORA)
    localStorage.removeItem(CLAVE_IMPRESORA_NOMBRE)
  } catch {
    // Sin persistencia igual queda olvidada al recargar.
  }
}

// ══════════════════════════════════════════════════════════
//  Conexion
// ══════════════════════════════════════════════════════════

export function mensajeDeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** `connect` rechaza cuando ya hay una conexion abierta. Ese caso no es un fallo. */
export function esErrorYaConectado(error: unknown): boolean {
  const mensaje = mensajeDeError(error).toLowerCase()
  return (
    mensaje.includes('already') &&
    (mensaje.includes('connected') || mensaje.includes('connect'))
  )
}

/** La conexion se cayo entre que se conecto y que se escribio. Se reconecta y reintenta. */
export function esErrorNoConectado(error: unknown): boolean {
  const mensaje = mensajeDeError(error).toLowerCase()
  return (
    mensaje.includes('not connected') || mensaje.includes('printer is not connected')
  )
}

/**
 * Pone tope a una operacion Bluetooth. Sin esto una impresora apagada en medio de la
 * operacion deja la promesa sin resolver y la pantalla colgada para siempre.
 */
export async function conTiempoLimite<T>(
  promesa: Promise<T>,
  etiqueta: string,
): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout> | undefined

  const limite = new Promise<never>((_, rechazar) => {
    temporizador = setTimeout(
      () => rechazar(new Error(`La impresora no respondio en ${TIEMPO_LIMITE_MS} ms (${etiqueta}).`)),
      TIEMPO_LIMITE_MS,
    )
  })

  try {
    return await Promise.race([promesa, limite])
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Conecta a la impresora. Si ya estaba conectada, no hace nada. Ante cualquier otro
 * fallo desconecta y reintenta una vez: es lo que rescata a la impresora que quedo a
 * medias de una sesion anterior.
 */
export async function conectar(address: string): Promise<void> {
  try {
    await conTiempoLimite(CapacitorThermalPrinter.connect({ address }), `connect(${address})`)
    return
  } catch (error) {
    if (esErrorYaConectado(error)) {
      return
    }
  }

  await conTiempoLimite(CapacitorThermalPrinter.disconnect(), 'disconnect(reintento)').catch(
    () => undefined,
  )
  await conTiempoLimite(
    CapacitorThermalPrinter.connect({ address }),
    `connect-reintento(${address})`,
  )
}

export async function reconectar(address: string): Promise<void> {
  await conTiempoLimite(
    CapacitorThermalPrinter.disconnect(),
    'disconnect(reconexion)',
  ).catch(() => undefined)
  await conTiempoLimite(
    CapacitorThermalPrinter.connect({ address }),
    `connect-reconexion(${address})`,
  )
}

export async function desconectar(): Promise<void> {
  await conTiempoLimite(CapacitorThermalPrinter.disconnect(), 'disconnect')
}

/**
 * Ejecuta un trabajo de impresion contra la impresora indicada.
 *
 * `componer` recibe el constructor ya iniciado y encola el contenido; esta funcion se
 * encarga de conectar, escribir y —si la conexion se cayo justo al escribir— reconectar y
 * **volver a componer desde cero**. Recomponer es obligatorio: tras una reconexion el
 * constructor del plugin ya vacio su cola, y reintentar `write()` a secas imprimiria una
 * hoja en blanco.
 */
export async function imprimir(
  address: string,
  componer: (impresora: typeof CapacitorThermalPrinter) => void,
): Promise<void> {
  await conectar(address)

  try {
    await escribir(componer)
  } catch (error) {
    if (!esErrorNoConectado(error)) {
      throw error
    }

    await reconectar(address)
    await escribir(componer)
  }
}

async function escribir(
  componer: (impresora: typeof CapacitorThermalPrinter) => void,
): Promise<void> {
  // `dpi` y `limitWidth` son la referencia con la que el plugin escala lo que dibuja.
  // Sin fijarlos toma 200 ppp y 45 mm, y el QR sale mas chico de lo necesario.
  CapacitorThermalPrinter.begin().dpi(200).limitWidth(ANCHO_IMPRIMIBLE_MM)
  componer(CapacitorThermalPrinter)
  await conTiempoLimite(CapacitorThermalPrinter.write(), 'write')
}
