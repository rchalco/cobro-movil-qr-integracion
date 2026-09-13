/**
 * Cartera de la demo. **Los clientes y sus creditos son ficticios** y viven en memoria:
 * no hay servicio detras, ni base, ni dato de ninguna persona real. Los carnets y las
 * cuentas estan inventados a proposito para que la pantalla se pueda mostrar sin tocar
 * informacion de clientes.
 *
 * El unico estado que cambia es el de una cuota al acreditarse el cobro, y se pierde al
 * recargar: la demo no simula un libro contable.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import type { Cliente, Credito, PagoRegistrado } from '@/models/clientes'
import { nombreCompleto } from '@/models/clientes'
import type { QrPagado } from '@/models/pagos'
import { MONEDA } from '@/config/env'

/** Rango por defecto de la cuota generada, en la moneda configurada. */
export const CUOTA_MINIMA_POR_DEFECTO = 100
export const CUOTA_MAXIMA_POR_DEFECTO = 5000

/** Limites dentro de los que se acepta configurar el rango. */
export const CUOTA_TOPE = 999999

const CLAVE_RANGO = 'cobroMovilQr.rangoCuotas'

export interface RangoCuotas {
  minimo: number
  maximo: number
}

/**
 * Importe aleatorio dentro del rango, redondeado a dos decimales. Se sortea por cuota y
 * no por cliente para que una misma cartera muestre importes dispares, que es lo que
 * hace visible el formato de los montos y el alineado del ticket.
 */
function cuotaAleatoria(rango: RangoCuotas): number {
  const minimo = Math.min(rango.minimo, rango.maximo)
  const maximo = Math.max(rango.minimo, rango.maximo)
  return Math.round((minimo + Math.random() * (maximo - minimo)) * 100) / 100
}

/** Fecha de vencimiento relativa a hoy, para que la demo no envejezca. */
function enDias(dias: number): string {
  const fecha = new Date()
  fecha.setHours(0, 0, 0, 0)
  fecha.setDate(fecha.getDate() + dias)
  return fecha.toISOString()
}

function carteraInicial(rango: RangoCuotas): Cliente[] {
  return [
    {
      id: 'cli-001',
      carnet: '4821563 SC',
      nombres: 'Maria Elena',
      apellidos: 'Quispe Mamani',
      creditos: [
        {
          id: 'cre-001',
          numeroOperacion: 'OP-2024-000481',
          producto: 'Credito individual comercio',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(3),
          estado: 'pendiente',
          pago: null,
        },
        {
          id: 'cre-002',
          numeroOperacion: 'OP-2023-009112',
          producto: 'Credito de vivienda social',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(-12),
          estado: 'pagado',
          pago: {
            qrId: 'QR-DEMO-77219',
            transactionId: 'DEMO-0001-20260901103012-A1B2C3D4',
            fechaPago: enDias(-12),
            horaPago: '10:32:14',
            canal: 'qr',
            nombrePagador: 'Maria Elena Quispe Mamani',
          },
        },
      ],
    },
    {
      id: 'cli-002',
      carnet: '7013994 LP',
      nombres: 'Juan Carlos',
      apellidos: 'Villarroel Ticona',
      creditos: [
        {
          id: 'cre-003',
          numeroOperacion: 'OP-2025-001277',
          producto: 'Capital de operaciones',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(0),
          estado: 'pendiente',
          pago: null,
        },
      ],
    },
    {
      id: 'cli-003',
      carnet: '3390117 CB',
      nombres: 'Rosa Beatriz',
      apellidos: 'Aguilar Chambi',
      creditos: [
        {
          id: 'cre-004',
          numeroOperacion: 'OP-2024-004520',
          producto: 'Micro credito agropecuario',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(-2),
          estado: 'pendiente',
          pago: null,
        },
        {
          id: 'cre-005',
          numeroOperacion: 'OP-2022-007781',
          producto: 'Credito de consumo',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(-40),
          estado: 'pagado',
          pago: {
            qrId: null,
            transactionId: null,
            fechaPago: enDias(-40),
            horaPago: '15:07:41',
            canal: 'directo',
            nombrePagador: null,
          },
        },
      ],
    },
    {
      id: 'cli-004',
      carnet: '9188443 OR',
      nombres: 'Luis Fernando',
      apellidos: 'Choque Rodriguez',
      creditos: [
        {
          id: 'cre-006',
          numeroOperacion: 'OP-2025-002903',
          producto: 'Credito individual servicios',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(6),
          estado: 'pendiente',
          pago: null,
        },
      ],
    },
    {
      id: 'cli-005',
      carnet: '5647302 TJ',
      nombres: 'Silvia',
      apellidos: 'Mendoza Fernandez',
      creditos: [
        {
          id: 'cre-007',
          numeroOperacion: 'OP-2024-006634',
          producto: 'Credito PyME',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(-5),
          estado: 'pendiente',
          pago: null,
        },
        {
          id: 'cre-008',
          numeroOperacion: 'OP-2024-006635',
          producto: 'Credito PyME - ampliacion',
          montoCuota: cuotaAleatoria(rango),
          moneda: MONEDA,
          fechaVencimiento: enDias(9),
          estado: 'pendiente',
          pago: null,
        },
      ],
    },
  ]
}

export const useClientesStore = defineStore('clientes', () => {
  const rango = ref<RangoCuotas>(leerRango())
  const clientes = ref<Cliente[]>(carteraInicial(rango.value))
  const filtroCarnet = ref('')

  /**
   * Busqueda por carnet. Se ignoran espacios y mayusculas porque el carnet se dicta y se
   * escribe de varias formas: `4821563 SC`, `4821563sc`, `4821563`.
   */
  const clientesFiltrados = computed<Cliente[]>(() => {
    const termino = normalizar(filtroCarnet.value)
    if (!termino) {
      return clientes.value
    }
    return clientes.value.filter((c) => normalizar(c.carnet).includes(termino))
  })

  const totalPendiente = computed(() =>
    clientesFiltrados.value
      .flatMap((c) => c.creditos)
      .filter((cr) => cr.estado === 'pendiente')
      .reduce((suma, cr) => suma + cr.montoCuota, 0),
  )

  function buscar(carnet: string): void {
    filtroCarnet.value = carnet
  }

  function limpiarBusqueda(): void {
    filtroCarnet.value = ''
  }

  function buscarCredito(
    creditoId: string,
  ): { cliente: Cliente; credito: Credito } | null {
    for (const cliente of clientes.value) {
      const credito = cliente.creditos.find((c) => c.id === creditoId)
      if (credito) {
        return { cliente, credito }
      }
    }
    return null
  }

  /**
   * Marca la cuota como pagada con el movimiento acreditado por el banco. Se llama
   * **despues** de que el cobro esta confirmado, nunca antes: hasta ese momento no hay
   * pago, solo un QR emitido.
   */
  function registrarPagoQr(creditoId: string, pago: QrPagado): void {
    const encontrado = buscarCredito(creditoId)
    if (!encontrado) {
      return
    }

    encontrado.credito.estado = 'pagado'
    encontrado.credito.pago = {
      qrId: pago.qrId,
      transactionId: pago.transactionId,
      fechaPago: pago.fechaPago,
      horaPago: pago.horaPago,
      canal: 'qr',
      nombrePagador: pago.nombrePagador ?? nombreCompleto(encontrado.cliente),
      documentoPagador: pago.documentoPagador,
    }
  }

  /**
   * Registro inmediato para cuando la funcionalidad de QR esta apagada. Es el equivalente
   * del cobro en efectivo de Iza: se asienta al instante porque no hay acreditacion que
   * esperar.
   */
  function registrarPagoDirecto(creditoId: string): void {
    const encontrado = buscarCredito(creditoId)
    if (!encontrado) {
      return
    }

    const ahora = new Date()
    encontrado.credito.estado = 'pagado'
    encontrado.credito.pago = {
      qrId: null,
      transactionId: null,
      fechaPago: ahora.toISOString(),
      horaPago: ahora.toLocaleTimeString('es-BO', { hour12: false }),
      canal: 'directo',
      nombrePagador: null,
    } satisfies PagoRegistrado
  }

  /**
   * Devuelve la cartera al estado inicial: **todas las cuotas pendientes** y con importes
   * nuevos sorteados dentro del rango.
   *
   * Todo pendiente y no la mezcla con la que arranca la aplicacion por primera vez: lo
   * que se quiere despues de una demostracion es poder volver a cobrar todo, no
   * reproducir una foto. Los comprobantes ya emitidos **no se tocan** — son el registro
   * de lo que se hizo, y borrarlos junto con la cartera haria imposible revisar despues
   * como salio cada ticket.
   */
  function reiniciar(nuevoRango?: Partial<RangoCuotas>): RangoCuotas {
    if (nuevoRango) {
      guardarRango({
        minimo: nuevoRango.minimo ?? rango.value.minimo,
        maximo: nuevoRango.maximo ?? rango.value.maximo,
      })
    }

    // La semilla trae dos cuotas ya pagadas para que la primera carga muestre los dos
    // estados. En un reinicio eso estorba: se limpian todas, que es lo que hace que la
    // cartera vuelva a ser cobrable de punta a punta.
    clientes.value = carteraInicial(rango.value).map((cliente) => ({
      ...cliente,
      creditos: cliente.creditos.map((credito) => ({
        ...credito,
        estado: 'pendiente' as const,
        pago: null,
      })),
    }))
    filtroCarnet.value = ''
    return { ...rango.value }
  }

  /**
   * Guarda el rango. Se normaliza en lugar de rechazarse: un minimo mayor que el maximo
   * es un error de tipeo evidente y invertirlos hace lo que la persona queria.
   */
  function guardarRango(valores: RangoCuotas): RangoCuotas {
    const minimo = acotar(valores.minimo, CUOTA_MINIMA_POR_DEFECTO)
    const maximo = acotar(valores.maximo, CUOTA_MAXIMA_POR_DEFECTO)

    rango.value = {
      minimo: Math.min(minimo, maximo),
      maximo: Math.max(minimo, maximo),
    }

    try {
      localStorage.setItem(CLAVE_RANGO, JSON.stringify(rango.value))
    } catch (e) {
      // Sin persistencia el rango sirve igual en esta sesion; solo vuelve al valor por
      // defecto al recargar.
      console.error('No se pudo guardar el rango de cuotas', e)
    }

    return { ...rango.value }
  }

  return {
    clientes,
    rango,
    reiniciar,
    guardarRango,
    clientesFiltrados,
    filtroCarnet,
    totalPendiente,
    buscar,
    limpiarBusqueda,
    buscarCredito,
    registrarPagoQr,
    registrarPagoDirecto,
  }
})

function normalizar(texto: string): string {
  return texto.replace(/[\s-]/g, '').toUpperCase()
}

/** Un valor no numerico, negativo o desmedido cae al valor por defecto. */
function acotar(valor: number, porDefecto: number): number {
  if (!Number.isFinite(valor) || valor <= 0) {
    return porDefecto
  }
  return Math.min(Math.round(valor * 100) / 100, CUOTA_TOPE)
}

function leerRango(): RangoCuotas {
  const porDefecto: RangoCuotas = {
    minimo: CUOTA_MINIMA_POR_DEFECTO,
    maximo: CUOTA_MAXIMA_POR_DEFECTO,
  }

  try {
    const crudo = localStorage.getItem(CLAVE_RANGO)
    if (!crudo) {
      return porDefecto
    }

    const guardado = JSON.parse(crudo) as Partial<RangoCuotas>
    const minimo = acotar(Number(guardado?.minimo), CUOTA_MINIMA_POR_DEFECTO)
    const maximo = acotar(Number(guardado?.maximo), CUOTA_MAXIMA_POR_DEFECTO)

    return { minimo: Math.min(minimo, maximo), maximo: Math.max(minimo, maximo) }
  } catch {
    return porDefecto
  }
}
