<script setup lang="ts">
/**
 * Lista de cobros por QR acreditados en una fecha. Es la misma pantalla que `PagosQrPage`
 * de Iza y cumple la misma funcion: es la fuente para cruzar los cobros por QR contra el
 * cierre del dia.
 *
 * El banco reporta **por dia, no por rango**: para un periodo hay que iterar dia a dia.
 */
import { computed, onMounted, ref } from 'vue'

import { MONEDA } from '@/config/env'
import { aFechaIso } from '@/services/qrProxy.client'
import {
  EstadoRespuesta,
  esFalloDeConexion,
  type CausaFallo,
  type QrPagado,
} from '@/models/pagos'
import { obtieneQrsPagados } from '@/services/pagosQr.service'

const fecha = ref(aFechaIso(new Date()))
const hoy = aFechaIso(new Date())

const pagos = ref<QrPagado[]>([])
const cargando = ref(false)
const mensaje = ref('')
const causa = ref<CausaFallo | undefined>(undefined)

/** Sin conexion la lista no esta vacia: no se sabe. Son cosas distintas para un arqueo. */
const sinConexion = computed(() => esFalloDeConexion(causa.value))

onMounted(() => consultar())

const totalCobrado = computed(() =>
  pagos.value.reduce((suma, pago) => suma + Number(pago.monto ?? 0), 0),
)

const moneda = computed(() => pagos.value[0]?.moneda ?? MONEDA)

async function consultar(): Promise<void> {
  if (cargando.value) {
    return
  }

  cargando.value = true
  mensaje.value = ''
  causa.value = undefined

  const resultado = await obtieneQrsPagados(aFechaLocal(fecha.value))

  cargando.value = false

  // NoData es un dia sin cobros, no un error.
  if (
    resultado.state !== EstadoRespuesta.Success &&
    resultado.state !== EstadoRespuesta.NoData
  ) {
    pagos.value = []
    mensaje.value = resultado.message || 'No se pudo obtener el reporte de cobros.'
    causa.value = resultado.causa
    return
  }

  pagos.value = ordenar(resultado.listEntities)
  if (pagos.value.length === 0) {
    mensaje.value = resultado.message || 'No hay cobros por QR en la fecha seleccionada.'
  }
}

/**
 * `new Date('yyyy-MM-dd')` se interpreta como UTC y en Bolivia (UTC-4) caeria en el dia
 * anterior; se arma la fecha local a partir de sus partes.
 */
function aFechaLocal(iso: string): Date {
  const [anio, mes, dia] = iso.split('-')
  return new Date(Number(anio), Number(mes) - 1, Number(dia))
}

/** Mas recientes primero: el banco no garantiza el orden del reporte. */
function ordenar(lista: QrPagado[]): QrPagado[] {
  return [...lista].sort((a, b) => instanteDe(b).localeCompare(instanteDe(a)))
}

function instanteDe(pago: QrPagado): string {
  return `${pago.fechaPago ?? ''}T${pago.horaPago ?? ''}`
}

function formatoMonto(monto: number): string {
  return monto.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
</script>

<template>
  <section class="pagos">
    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Filtro de fecha y resumen                             -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="barra tarjeta">
      <div class="campo">
        <label class="campo__label" for="fecha">Fecha</label>
        <input
          id="fecha"
          v-model="fecha"
          class="campo__input"
          type="date"
          :max="hoy"
          @change="consultar"
        />
      </div>

      <div class="barra__resumen">
        <span class="barra__resumen-label">Cobrado</span>
        <span class="barra__resumen-monto monto">
          {{ moneda }} {{ formatoMonto(totalCobrado) }}
        </span>
        <span class="barra__resumen-cantidad">
          {{ pagos.length }} movimiento{{ pagos.length === 1 ? '' : 's' }}
        </span>
      </div>

      <button
        type="button"
        class="btn btn--contorno"
        :disabled="cargando"
        @click="consultar"
      >
        Actualizar
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Estados                                               -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div v-if="cargando" class="estado-vacio tarjeta">
      <span class="spinner"></span>
      <span>Consultando cobros...</span>
    </div>

    <div v-else-if="pagos.length === 0" class="estado-vacio tarjeta">
      <p
        v-if="causa"
        class="aviso"
        :class="sinConexion ? 'aviso--atencion' : 'aviso--error'"
      >
        {{ mensaje }}
      </p>
      <span v-else>{{ mensaje || 'Sin cobros por QR en la fecha seleccionada' }}</span>

      <button v-if="causa" type="button" class="btn btn--primario" @click="consultar">
        Reintentar
      </button>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Movimientos                                           -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div v-else class="tabla tarjeta">
      <table>
        <thead>
          <tr>
            <th>Hora</th>
            <th>Pagador</th>
            <th>QR</th>
            <th class="col-monto">Monto</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="pago in pagos" :key="pago.qrId">
            <td>{{ pago.horaPago || '-' }}</td>
            <td>
              <div class="pagador">
                <span class="pagador__nombre">
                  {{ pago.nombrePagador || pago.cuentaPagador || '-' }}
                </span>
                <span v-if="pago.codigoBancoOrigen" class="pagador__banco">
                  Banco {{ pago.codigoBancoOrigen }}
                </span>
              </div>
            </td>
            <td class="mono">{{ pago.qrId }}</td>
            <td class="col-monto monto">
              {{ pago.moneda }} {{ formatoMonto(pago.monto) }}
            </td>
          </tr>
        </tbody>
        <tfoot>
          <tr>
            <td colspan="3">Total del dia</td>
            <td class="col-monto monto">{{ moneda }} {{ formatoMonto(totalCobrado) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>

    <p v-if="!cargando && pagos.length > 0" class="pagos__nota">
      Reporte del banco para la fecha consultada. Es la fuente para cruzar los cobros por
      QR contra el cierre del dia.
    </p>
  </section>
</template>

<style scoped>
.pagos {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.barra {
  display: flex;
  align-items: flex-end;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 18px;
}

.barra__resumen {
  display: flex;
  flex-direction: column;
  margin-left: auto;
  line-height: 1.3;
  align-items: flex-end;
}

.barra__resumen-label {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.barra__resumen-monto {
  font-size: 1.2rem;
  color: var(--pos-text-title);
}

.barra__resumen-cantidad {
  font-size: 0.72rem;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Tabla de movimientos
   ----------------------------------------------------------- */
.tabla {
  overflow-x: auto;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

th {
  padding: 11px 16px;
  text-align: left;
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
  background: var(--pos-bg-soft-2);
  border-bottom: 1px solid var(--pos-border-soft);
  white-space: nowrap;
}

td {
  padding: 11px 16px;
  border-bottom: 1px solid var(--pos-border-soft);
  vertical-align: middle;
}

tbody tr:last-child td {
  border-bottom: none;
}

tfoot td {
  border-top: 1px solid var(--pos-border);
  border-bottom: none;
  font-weight: 800;
  color: var(--pos-text-title);
  background: var(--pos-bg-soft);
}

.col-monto {
  text-align: right;
  white-space: nowrap;
}

.pagador {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
}

.pagador__nombre {
  font-weight: 600;
}

.pagador__banco {
  font-size: 0.7rem;
  color: var(--pos-text-soft);
}

.pagos__nota {
  margin: 0;
  padding: 0 4px;
  font-size: 0.74rem;
  color: var(--pos-text-soft);
}
</style>
