/**
 * Funcionalidades activables desde la aplicacion, persistidas en el equipo.
 *
 * Mismo mecanismo que `FeatureFlagsService` de Iza: el valor vive en memoria ademas del
 * almacenamiento porque quien decide el flujo de cobro es sincrono —no puede esperar una
 * lectura de disco en medio de un cobro— y el valor de configuracion queda como estado
 * inicial de un equipo nuevo.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { FEATURE_PAGO_QR } from '@/config/env'

const CLAVE_FLAGS = 'cobroMovilQr.featureFlags'

export interface FeatureFlags {
  /**
   * Interfaz de cobro por QR. En false el boton Pagar registra el pago al instante, como
   * una caja que cobra en efectivo, y la pantalla de Pagos QR sale del menu. El boton
   * nunca se bloquea: deshabilitarlo dejaria a la cartera sin forma de cobro.
   */
  pagoQr: boolean
}

export const useFeatureFlagsStore = defineStore('featureFlags', () => {
  const flags = ref<FeatureFlags>({ pagoQr: FEATURE_PAGO_QR })
  const cargado = ref(false)
  const guardando = ref(false)

  const pagoQr = computed(() => flags.value.pagoQr)

  /**
   * Trae la configuracion guardada. Se llama al arrancar; si el equipo nunca guardo
   * nada, quedan los valores de configuracion.
   */
  function cargar(): FeatureFlags {
    if (cargado.value) {
      return { ...flags.value }
    }

    try {
      const crudo = localStorage.getItem(CLAVE_FLAGS)
      if (crudo) {
        aplicar(JSON.parse(crudo) as Partial<FeatureFlags>)
      }
    } catch (e) {
      // Un almacenamiento ilegible no puede dejar a la cartera sin forma de cobro: se
      // sigue con los valores de compilacion.
      console.error('No se pudo leer la configuracion de funcionalidades', e)
    }

    cargado.value = true
    return { ...flags.value }
  }

  /** Guarda un cambio. Si no se pudo persistir se revierte y se propaga el fallo. */
  async function guardar(cambios: Partial<FeatureFlags>): Promise<FeatureFlags> {
    const anterior = { ...flags.value }
    guardando.value = true

    try {
      aplicar(cambios)
      localStorage.setItem(CLAVE_FLAGS, JSON.stringify(flags.value))
      return { ...flags.value }
    } catch (e) {
      // Si no se pudo persistir se revierte: la pantalla mostraria un estado que el
      // proximo arranque no respeta.
      flags.value = anterior
      throw e
    } finally {
      guardando.value = false
    }
  }

  function aplicar(cambios: Partial<FeatureFlags>): void {
    flags.value = {
      pagoQr:
        typeof cambios?.pagoQr === 'boolean' ? cambios.pagoQr : flags.value.pagoQr,
    }
  }

  return { flags, pagoQr, cargado, guardando, cargar, guardar }
})
