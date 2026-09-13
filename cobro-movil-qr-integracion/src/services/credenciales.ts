/**
 * API Key del proxy: de donde sale y donde vive.
 *
 * En el navegador sale de la compilacion y ahi termina la historia. En un empaquetado de
 * Capacitor se traslada al **llavero del dispositivo** —Keystore en Android, Keychain en
 * iOS— en el primer arranque, y a partir de entonces se lee de ahi.
 *
 * Que protege y que no, porque la diferencia importa:
 *
 *  - **Si** protege la clave en reposo en el dispositivo: no queda en texto plano dentro
 *    de `localStorage` ni en los respaldos de la aplicacion, y otra aplicacion del equipo
 *    no puede leerla.
 *  - **No** la hace irrecuperable: la clave sigue compilada dentro del APK para poder
 *    sembrarla la primera vez, y quien desempaquete el APK la encuentra. Eliminar eso
 *    exige que la clave no venga en el paquete —que la entregue un backend tras
 *    autenticar, o que la cargue un operador al instalar—, que es justamente lo que esta
 *    demo evita para poder levantar sin pasos previos.
 *
 * El dia que la clave deje de venir compilada, `sembrar()` desaparece y el resto de este
 * archivo sigue igual.
 */

import { Capacitor } from '@capacitor/core'
import { SecureStorage } from '@aparajita/capacitor-secure-storage'

import { QR_API_KEY_COMPILADA } from '@/config/env'

const CLAVE_LLAVERO = 'qrBancoEconomico.apiKey'

/** De donde salio la clave que se esta usando. La pantalla de ajustes lo muestra. */
export type OrigenApiKey = 'llavero' | 'compilacion' | 'ninguna'

let cache: string | null = null
let origen: OrigenApiKey = 'ninguna'
let enVuelo: Promise<string> | null = null

/** La aplicacion corre sobre Capacitor y tiene llavero del sistema disponible. */
export function hayLlavero(): boolean {
  return Capacitor.isNativePlatform()
}

export function origenApiKey(): OrigenApiKey {
  return origen
}

/**
 * Clave a presentar en `X-Api-Key`. La primera llamada la resuelve y la deja en memoria:
 * el sondeo del cobro la pide cada 60 segundos y no tiene sentido ir al llavero cada vez.
 */
export function obtenerApiKey(): Promise<string> {
  if (cache !== null) {
    return Promise.resolve(cache)
  }

  // Varias llamadas al arrancar comparten la misma lectura en vuelo.
  if (!enVuelo) {
    enVuelo = resolver().finally(() => {
      enVuelo = null
    })
  }

  return enVuelo
}

/**
 * Reemplaza la clave en uso. Sirve para rotarla sin recompilar: en nativo queda en el
 * llavero y sobrevive a la actualizacion de la aplicacion.
 */
export async function guardarApiKey(nueva: string): Promise<void> {
  const limpia = nueva.trim()

  if (hayLlavero()) {
    await SecureStorage.setItem(CLAVE_LLAVERO, limpia)
    origen = 'llavero'
  } else {
    origen = 'compilacion'
  }

  cache = limpia
}

/** Olvida la clave guardada en el dispositivo y vuelve a la de compilacion. */
export async function olvidarApiKey(): Promise<void> {
  if (hayLlavero()) {
    await SecureStorage.removeItem(CLAVE_LLAVERO).catch(() => undefined)
  }

  cache = null
  origen = 'ninguna'
}

async function resolver(): Promise<string> {
  if (!hayLlavero()) {
    cache = QR_API_KEY_COMPILADA
    origen = QR_API_KEY_COMPILADA ? 'compilacion' : 'ninguna'
    return cache
  }

  try {
    const guardada = await SecureStorage.getItem(CLAVE_LLAVERO)

    if (typeof guardada === 'string' && guardada.trim()) {
      cache = guardada.trim()
      origen = 'llavero'
      return cache
    }

    return await sembrar()
  } catch (e) {
    // Un llavero que no responde no puede dejar al equipo sin cobrar: se sigue con la
    // clave de compilacion, que es la misma. Se registra porque significa que la clave
    // quedo sin proteger en reposo y alguien deberia enterarse.
    console.error('No se pudo leer la API Key del llavero del dispositivo', e)
    cache = QR_API_KEY_COMPILADA
    origen = 'compilacion'
    return cache
  }
}

/**
 * Primer arranque en el dispositivo: pasa la clave de la compilacion al llavero.
 *
 * Si el guardado falla se sigue igual con la clave compilada. Abortar dejaria la
 * aplicacion sin poder cobrar por un problema de almacenamiento, cuando la clave esta
 * disponible: el cobro es lo que el equipo vino a hacer.
 */
async function sembrar(): Promise<string> {
  cache = QR_API_KEY_COMPILADA
  origen = QR_API_KEY_COMPILADA ? 'compilacion' : 'ninguna'

  if (!QR_API_KEY_COMPILADA) {
    return cache
  }

  try {
    await SecureStorage.setItem(CLAVE_LLAVERO, QR_API_KEY_COMPILADA)
    origen = 'llavero'
  } catch (e) {
    console.error('No se pudo guardar la API Key en el llavero del dispositivo', e)
  }

  return cache
}
