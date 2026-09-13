<script setup lang="ts">
/**
 * Comprobantes emitidos. Permite ver cualquiera en pantalla y volver a imprimirlo.
 *
 * Los que nunca llegaron a la impresora van primero y marcados: son los unicos por los
 * que alguien puede venir a reclamar un papel que no tiene.
 */
import { computed, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import VoucherComprobante from '@/components/VoucherComprobante.vue'
import { useReimpresion } from '@/composables/useImpresion'
import { esPagoDeTercero, type Comprobante } from '@/models/comprobante'
import { useVouchersStore, type Voucher } from '@/stores/vouchers.store'

const vouchers = useVouchersStore()
const reimpresion = useReimpresion()

const soloSinImprimir = ref(false)
const verDetalle = ref<Comprobante | null>(null)

const lista = computed<Voucher[]>(() =>
  soloSinImprimir.value ? vouchers.sinImprimir : vouchers.ordenados,
)

/**
 * Vaciar el registro es lo unico irreversible de esta pantalla: sin comprobante guardado
 * no hay nada que reimprimir, y el cliente que venga a pedir una copia se queda sin ella.
 * Por eso se pregunta, y se dice cuantos quedarian sin poder reimprimirse.
 */
function vaciarRegistro(): void {
  const total = vouchers.ordenados.length
  const sinImprimir = vouchers.sinImprimir.length

  const detalle = sinImprimir > 0 ? ` ${sinImprimir} de ellos nunca se imprimieron.` : ''

  if (
    window.confirm(
      `Se borraran ${total} comprobantes y no se podran reimprimir.${detalle}\n\n` +
        'Esta accion no se puede deshacer. Continuar?',
    )
  ) {
    vouchers.vaciar()
  }
}

function alternarDetalle(comprobante: Comprobante): void {
  verDetalle.value =
    verDetalle.value?.numero === comprobante.numero ? null : comprobante
}

function monto(valor: number): string {
  return valor.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fechaHora(iso: string): string {
  const fecha = new Date(iso)
  return `${fecha.toLocaleDateString('es-BO')} ${fecha.toLocaleTimeString('es-BO', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  })}`
}
</script>

<template>
  <section class="vouchers">
    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Barra                                                 -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="barra tarjeta">
      <div class="barra__resumen">
        <span class="barra__label">Comprobantes</span>
        <span class="barra__valor">{{ vouchers.ordenados.length }}</span>
        <span class="barra__detalle">
          {{ vouchers.sinImprimir.length }} sin imprimir
        </span>
      </div>

      <label class="filtro">
        <input v-model="soloSinImprimir" type="checkbox" />
        <span>Solo los que no se imprimieron</span>
      </label>

      <button
        v-if="vouchers.ordenados.length > 0"
        type="button"
        class="btn btn--neutro"
        @click="vaciarRegistro"
      >
        Vaciar registro
      </button>
    </div>

    <p class="vouchers__nota">
      Cada comprobante se puede reimprimir las veces que haga falta: siempre sale el mismo
      papel, con el mismo numero. El contador de intentos es informativo y no limita nada.
    </p>

    <p v-if="reimpresion.aviso.value" class="aviso aviso--info">
      {{ reimpresion.aviso.value }}
    </p>
    <p v-if="reimpresion.error.value" class="aviso aviso--error">
      {{ reimpresion.error.value }}
    </p>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Lista                                                 -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div v-if="lista.length === 0" class="estado-vacio tarjeta">
      <span>
        {{
          soloSinImprimir
            ? 'Todos los comprobantes se imprimieron.'
            : 'Todavia no se emitio ningun comprobante.'
        }}
      </span>
    </div>

    <article
      v-for="voucher in lista"
      :key="voucher.comprobante.numero"
      class="voucher-fila tarjeta"
      :class="{ 'voucher-fila--pendiente': !voucher.impreso }"
    >
      <div class="voucher-fila__datos">
        <div class="voucher-fila__linea">
          <span class="voucher-fila__numero mono">{{ voucher.comprobante.numero }}</span>
          <span
            class="etiqueta"
            :class="voucher.impreso ? 'etiqueta--pagado' : 'etiqueta--vencido'"
          >
            {{ voucher.impreso ? 'Impreso' : 'Sin imprimir' }}
          </span>
          <span class="etiqueta etiqueta--pendiente">
            {{ voucher.comprobante.canal === 'qr' ? 'QR' : 'Caja' }}
          </span>
        </div>

        <!-- Titular y pagador, siempre los dos: quien figura en el credito y quien puso
             la plata no tienen por que ser la misma persona. -->
        <span class="voucher-fila__persona">
          <span class="voucher-fila__rol">Titular</span>
          {{ voucher.comprobante.nombreCliente }}
          <span class="voucher-fila__doc mono">{{ voucher.comprobante.carnet }}</span>
        </span>

        <span
          v-if="voucher.comprobante.canal === 'qr'"
          class="voucher-fila__persona"
          :class="{ 'voucher-fila__persona--tercero': esPagoDeTercero(voucher.comprobante) }"
        >
          <span class="voucher-fila__rol">
            {{ esPagoDeTercero(voucher.comprobante) ? 'Pago un tercero' : 'Pago' }}
          </span>
          {{ voucher.comprobante.nombrePagador ?? 'Sin dato del banco' }}
          <span v-if="voucher.comprobante.documentoPagador" class="voucher-fila__doc mono">
            {{ voucher.comprobante.documentoPagador }}
          </span>
          <span v-if="voucher.comprobante.codigoBancoOrigen" class="voucher-fila__doc">
            Banco {{ voucher.comprobante.codigoBancoOrigen }}
          </span>
        </span>
        <span class="voucher-fila__meta">
          {{ voucher.comprobante.numeroOperacion }} ·
          {{ fechaHora(voucher.comprobante.emitidoEn) }}
          <template v-if="voucher.intentos > 1">
            · {{ voucher.intentos - 1 }}
            {{ voucher.intentos === 2 ? 'reimpresion' : 'reimpresiones' }}
          </template>
        </span>
        <span v-if="voucher.ultimoError" class="voucher-fila__error">
          {{ voucher.ultimoError }}
        </span>
      </div>

      <div class="voucher-fila__monto monto">
        {{ voucher.comprobante.moneda }} {{ monto(voucher.comprobante.monto) }}
      </div>

      <div class="voucher-fila__acciones">
        <button
          type="button"
          class="btn btn--contorno"
          @click="alternarDetalle(voucher.comprobante)"
        >
          <AppIcon name="voucher" />
          {{
            verDetalle?.numero === voucher.comprobante.numero ? 'Ocultar' : 'Ver'
          }}
        </button>
        <button
          type="button"
          class="btn btn--primario"
          :disabled="!!reimpresion.reimprimiendo.value"
          @click="reimpresion.reimprimir(voucher.comprobante)"
        >
          <span
            v-if="reimpresion.reimprimiendo.value === voucher.comprobante.numero"
            class="spinner spinner--sm"
          ></span>
          <AppIcon v-else name="reimprimir" />
          Reimprimir
        </button>
      </div>

      <div
        v-if="verDetalle?.numero === voucher.comprobante.numero"
        class="voucher-fila__detalle"
      >
        <VoucherComprobante :comprobante="voucher.comprobante" />
      </div>
    </article>
  </section>
</template>

<style scoped>
.vouchers {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.vouchers__nota {
  margin: 0;
  padding: 0 4px;
  font-size: 0.76rem;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Barra
   ----------------------------------------------------------- */
.barra {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
  padding: 15px 18px;
}

.barra__resumen {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.barra__label {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.barra__valor {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--pos-text-title);
}

.barra__detalle {
  font-size: 0.74rem;
  color: var(--pos-text-soft);
}

.filtro {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-right: auto;
  font-size: 0.8rem;
  cursor: pointer;
}

/* -----------------------------------------------------------
   Fila de comprobante
   ----------------------------------------------------------- */
.voucher-fila {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 14px;
  padding: 14px 18px;
}

.voucher-fila--pendiente {
  border-color: rgba(179, 38, 30, 0.26);
  background: linear-gradient(90deg, var(--pos-danger-soft) 0 4px, #fff 4px);
}

.voucher-fila__datos {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.voucher-fila__linea {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.voucher-fila__numero {
  font-weight: 700;
  color: var(--pos-text-title);
}

.voucher-fila__persona {
  display: flex;
  align-items: baseline;
  gap: 7px;
  flex-wrap: wrap;
  font-size: 0.86rem;
  font-weight: 600;
}

.voucher-fila__rol {
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--pos-bg-soft-2);
  color: var(--pos-text-soft);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  white-space: nowrap;
}

/* Que pago alguien distinto al titular es lo que alguien va a venir a preguntar: se
   marca en la fila para no tener que abrir el comprobante para verlo. */
.voucher-fila__persona--tercero .voucher-fila__rol {
  background: var(--pos-warning-soft);
  color: var(--pos-warning);
  border: 1px solid rgba(255, 176, 32, 0.42);
}

.voucher-fila__doc {
  font-size: 0.72rem;
  font-weight: 500;
  color: var(--pos-text-soft);
}

.voucher-fila__meta {
  font-size: 0.72rem;
  color: var(--pos-text-soft);
}

.voucher-fila__error {
  font-size: 0.72rem;
  color: var(--pos-danger);
  overflow-wrap: anywhere;
}

.voucher-fila__monto {
  font-size: 1rem;
  color: var(--pos-text-title);
  white-space: nowrap;
}

.voucher-fila__acciones {
  display: flex;
  gap: 7px;
  flex-wrap: wrap;
}

.voucher-fila__detalle {
  grid-column: 1 / -1;
  padding-top: 14px;
  border-top: 1px dashed var(--pos-border);
}

@media (max-width: 780px) {
  .voucher-fila {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .voucher-fila__acciones {
    grid-column: 1 / -1;
  }
}
</style>
