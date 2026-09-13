/**
 * Politica de impresion del comprobante, compartida por las dos formas de cobro.
 *
 * Ante un fallo **el comprobante se muestra en pantalla**. Antes se llevaba al usuario a
 * la pantalla de impresora, lo que resolvia el problema del papel pero dejaba al cliente
 * sin nada que ver: el cobro ya estaba hecho y la constancia quedaba a dos pantallas de
 * distancia. Mostrarlo es lo que permite seguir atendiendo —el cliente ve su comprobante
 * y puede fotografiarlo— y la reimpresion queda disponible en Comprobantes, sin
 * interrumpir el mostrador.
 *
 * Ninguna rama propaga el fallo a quien la llama. El cobro ya ocurrio y esta registrado;
 * que el papel no salga es un problema de papel, y tratarlo como un fallo del cobro haria
 * que el cajero dude de si tiene que volver a cobrar.
 */

import { ref } from 'vue'

import type { Comprobante } from '@/models/comprobante'
import { mensajeDeError, SinImpresoraError } from '@/helpers/printer.helper'
import { imprimirComprobante } from '@/services/comprobante.service'
import { useVouchersStore } from '@/stores/vouchers.store'

export function useImpresion() {
  const vouchers = useVouchersStore()

  const imprimiendo = ref(false)
  const aviso = ref('')

  /**
   * Imprime y deja constancia del intento. Devuelve `true` si el comprobante llego a la
   * impresora; en cualquier otro caso queda registrado como sin imprimir y visible en
   * pantalla.
   */
  async function imprimir(comprobante: Comprobante): Promise<boolean> {
    imprimiendo.value = true
    aviso.value = ''

    try {
      await imprimirComprobante(comprobante)
      vouchers.registrar(comprobante, true)
      return true
    } catch (error) {
      const motivo =
        error instanceof SinImpresoraError
          ? 'No hay una impresora configurada en este equipo.'
          : mensajeDeError(error)

      // Primero el registro y despues la pantalla: si algo fallara al mostrar, el
      // comprobante ya quedo guardado y se puede reimprimir desde Comprobantes.
      vouchers.registrar(comprobante, false, motivo)
      vouchers.mostrar(comprobante)

      aviso.value =
        `${motivo} El cobro quedo registrado y el comprobante se muestra en pantalla; ` +
        'puede reimprimirlo desde Comprobantes.'
      return false
    } finally {
      imprimiendo.value = false
    }
  }

  return { imprimir, imprimiendo, aviso }
}

/**
 * Reimpresion de un comprobante ya emitido. Vive aparte de `useImpresion` porque el
 * resultado es distinto: aqui no hay un cobro recien hecho que mostrar, solo un intento
 * de volver a sacar un papel que ya existe.
 */
export function useReimpresion() {
  const vouchers = useVouchersStore()

  const reimprimiendo = ref<string | null>(null)
  const aviso = ref('')
  const error = ref('')

  async function reimprimir(comprobante: Comprobante): Promise<boolean> {
    if (reimprimiendo.value) {
      return false
    }

    reimprimiendo.value = comprobante.numero
    aviso.value = ''
    error.value = ''

    try {
      await imprimirComprobante(comprobante)
      vouchers.marcarImpreso(comprobante.numero)
      aviso.value = `Comprobante ${comprobante.numero} enviado a la impresora.`
      return true
    } catch (e) {
      const motivo =
        e instanceof SinImpresoraError
          ? 'No hay una impresora configurada en este equipo.'
          : mensajeDeError(e)

      vouchers.anotarFallo(comprobante.numero, motivo)
      error.value = `No se pudo reimprimir ${comprobante.numero}: ${motivo}`
      return false
    } finally {
      reimprimiendo.value = null
    }
  }

  return { reimprimir, reimprimiendo, aviso, error }
}
