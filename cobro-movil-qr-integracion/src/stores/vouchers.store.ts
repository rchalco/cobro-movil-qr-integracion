/**
 * Registro de comprobantes emitidos.
 *
 * Existe por dos razones que antes se resolvian por separado y mal:
 *
 *  1. **Reimprimir.** Un comprobante puede salir ilegible, atascarse o perderse. Sin un
 *     registro, la unica forma de recuperarlo era volver a cobrar.
 *  2. **La impresion que no salio.** Antes se guardaba «un pendiente» en su propia clave
 *     del almacenamiento, en paralelo a esto. Dos registros de lo mismo terminan
 *     discrepando: uno decia que habia algo pendiente y el otro que el cobro ya estaba
 *     impreso. Ahora hay un solo registro y `impreso` es el estado.
 *
 * Se persiste porque un comprobante sin imprimir tiene que sobrevivir a que se cierre la
 * aplicacion: el cobro ya ocurrio y el cliente sigue esperando su papel.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Comprobante } from '@/models/comprobante'

const CLAVE = 'cobroMovilQr.vouchers'

/**
 * Tope del registro. No es una cola de impresion sino un historial para reimprimir:
 * dejarlo crecer sin limite llena el almacenamiento del equipo con comprobantes que
 * nadie va a volver a pedir.
 */
const MAXIMO = 100

export interface Voucher {
  comprobante: Comprobante
  /** Llego a la impresora. En false es lo que antes se llamaba «impresion pendiente». */
  impreso: boolean
  /** Cuantas veces se intento. Distingue «nunca salio» de «salio y se reimprimio». */
  intentos: number
  ultimoError: string | null
  registradoEn: string
}

export const useVouchersStore = defineStore('vouchers', () => {
  const vouchers = ref<Voucher[]>(leer())

  /** El que se esta mostrando en pantalla porque no se pudo imprimir. */
  const enPantalla = ref<Comprobante | null>(null)

  /** Mas recientes primero: es el orden en que se buscan para reimprimir. */
  const ordenados = computed(() =>
    [...vouchers.value].sort((a, b) => b.registradoEn.localeCompare(a.registradoEn)),
  )

  const sinImprimir = computed(() => ordenados.value.filter((v) => !v.impreso))

  /**
   * El comprobante mas reciente que nunca llego a la impresora. Es el que se reintenta
   * solo al conectar una impresora: el ultimo cobro es el que el cliente esta esperando.
   */
  const pendiente = computed<Voucher | null>(() => sinImprimir.value[0] ?? null)

  /**
   * Comprobante ya emitido de una operacion, el mas reciente si hubiera varios.
   *
   * Es lo que hace posible **reimprimir y no reemitir**: sin esta busqueda, cada
   * reimpresion construye un comprobante nuevo, con numero nuevo, y el papel que recibe
   * el cliente deja de coincidir con el que se le dio la primera vez.
   */
  function buscarPorOperacion(numeroOperacion: string): Voucher | null {
    return (
      ordenados.value.find(
        (v) => v.comprobante.numeroOperacion === numeroOperacion,
      ) ?? null
    )
  }

  /** Anota un comprobante recien emitido. Si ya estaba, actualiza su estado. */
  function registrar(comprobante: Comprobante, impreso: boolean, error?: string): void {
    const existente = vouchers.value.find(
      (v) => v.comprobante.numero === comprobante.numero,
    )

    if (existente) {
      existente.impreso = impreso || existente.impreso
      existente.intentos += 1
      existente.ultimoError = error ?? null
    } else {
      vouchers.value.unshift({
        comprobante,
        impreso,
        intentos: 1,
        ultimoError: error ?? null,
        registradoEn: new Date().toISOString(),
      })
    }

    // Se recorta por antiguedad, pero nunca se descarta algo sin imprimir: esos son
    // justamente los que alguien todavia puede venir a reclamar.
    if (vouchers.value.length > MAXIMO) {
      const conservar = [...vouchers.value]
        .sort((a, b) => b.registradoEn.localeCompare(a.registradoEn))
        .filter((v, i) => i < MAXIMO || !v.impreso)
      vouchers.value = conservar
    }

    guardar()
  }

  function marcarImpreso(numero: string): void {
    const voucher = vouchers.value.find((v) => v.comprobante.numero === numero)
    if (!voucher) {
      return
    }

    voucher.impreso = true
    voucher.intentos += 1
    voucher.ultimoError = null
    guardar()
  }

  function anotarFallo(numero: string, error: string): void {
    const voucher = vouchers.value.find((v) => v.comprobante.numero === numero)
    if (!voucher) {
      return
    }

    voucher.intentos += 1
    voucher.ultimoError = error
    guardar()
  }

  function mostrar(comprobante: Comprobante | null): void {
    enPantalla.value = comprobante
  }

  function eliminar(numero: string): void {
    vouchers.value = vouchers.value.filter((v) => v.comprobante.numero !== numero)
    guardar()
  }

  function vaciar(): void {
    vouchers.value = []
    enPantalla.value = null
    guardar()
  }

  function guardar(): void {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(vouchers.value))
    } catch (e) {
      // Sin persistencia el registro sigue vivo en memoria hasta recargar. Se avisa
      // porque en ese estado un comprobante sin imprimir si se puede perder.
      console.error('No se pudo guardar el registro de comprobantes', e)
    }
  }

  return {
    vouchers,
    ordenados,
    sinImprimir,
    pendiente,
    enPantalla,
    buscarPorOperacion,
    registrar,
    marcarImpreso,
    anotarFallo,
    mostrar,
    eliminar,
    vaciar,
  }
})

function leer(): Voucher[] {
  try {
    const crudo = localStorage.getItem(CLAVE)
    if (!crudo) {
      return []
    }

    const lista = JSON.parse(crudo) as Voucher[]
    if (!Array.isArray(lista)) {
      return []
    }

    // Un comprobante de un formato anterior se descarta: reimprimirlo con campos vacios
    // es peor que no tenerlo.
    return lista.filter((v) => v?.comprobante?.version === 1)
  } catch (e) {
    console.error('No se pudo leer el registro de comprobantes', e)
    return []
  }
}
