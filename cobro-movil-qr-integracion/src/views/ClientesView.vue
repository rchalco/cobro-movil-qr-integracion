<script setup lang="ts">
/**
 * Cartera de clientes y sus creditos. La busqueda es por carnet, que es el dato con el
 * que el cliente se identifica en ventanilla.
 *
 * El boton de pago es el enganche con el mecanismo de cobro. Sigue la misma regla que
 * Venta Express en Iza: **el boton nunca se bloquea por la funcionalidad**. Con el cobro
 * por QR encendido abre la pantalla del QR y espera la acreditacion; apagado registra el
 * pago al instante, como una caja que cobra en efectivo. Deshabilitarlo dejaria a la
 * cartera sin forma de cobro, que es peor que cobrar por el camino simple.
 */
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import { useImpresion, useReimpresion } from '@/composables/useImpresion'
import type { Cliente, Credito } from '@/models/clientes'
import { nombreCompleto } from '@/models/clientes'
import {
  construirComprobante,
  construirDesdeRegistro,
} from '@/services/comprobante.service'
import { useAuthStore } from '@/stores/auth.store'
import { useClientesStore } from '@/stores/clientes.store'
import { useFeatureFlagsStore } from '@/stores/featureFlags.store'
import { useVouchersStore } from '@/stores/vouchers.store'

const clientes = useClientesStore()
const flags = useFeatureFlagsStore()
const auth = useAuthStore()
const vouchers = useVouchersStore()
const impresion = useImpresion()
const reimpresion = useReimpresion()
const router = useRouter()

const aviso = ref('')

const hayResultados = computed(() => clientes.clientesFiltrados.length > 0)

async function pagar(cliente: Cliente, credito: Credito): Promise<void> {
  aviso.value = ''

  if (credito.estado === 'pagado') {
    return
  }

  if (flags.pagoQr) {
    router.push({ name: 'cobro', params: { creditoId: credito.id } })
    return
  }

  clientes.registrarPagoDirecto(credito.id)
  aviso.value =
    `Cuota ${credito.numeroOperacion} de ${nombreCompleto(cliente)} registrada sin QR. ` +
    'El cobro por QR esta deshabilitado en Funcionalidades.'

  // Se imprime igual que en el cobro por QR: en Iza toda venta registrada emite su
  // comprobante, sea cual sea la forma de pago. El `pago` va en null porque no hubo
  // acreditacion del banco, y el ticket lo dice en lugar de fingir un cobro por QR.
  await impresion.imprimir(
    construirComprobante(cliente, credito, null, auth.usuario?.nombre ?? '-'),
  )
}

/**
 * Reimprime el comprobante de una cuota ya cobrada, **las veces que haga falta**.
 *
 * Reimprimir es volver a sacar el mismo papel: se busca el comprobante que ya se emitio
 * y se manda tal cual, con su numero y sus datos de cobro. Construir uno nuevo —que es lo
 * que hacia antes— le daba al cliente un segundo papel con numero distinto por el mismo
 * cobro, y llenaba el registro con una entrada por cada reimpresion.
 *
 * No hay tope de reimpresiones ni se bloquea por haberlo impreso ya: el papel se atasca,
 * sale ilegible o el cliente pide otra copia, y eso lo decide quien atiende.
 */
async function reimprimir(cliente: Cliente, credito: Credito): Promise<void> {
  aviso.value = ''

  const emitido = vouchers.buscarPorOperacion(credito.numeroOperacion)

  if (emitido) {
    await reimpresion.reimprimir(emitido.comprobante)
    return
  }

  // Cuota que figura cobrada pero nunca emitio comprobante: las que vienen pagadas en
  // los datos de demostracion. Aqui no hay nada que reimprimir, se emite el primero.
  await impresion.imprimir(
    construirDesdeRegistro(cliente, credito, auth.usuario?.nombre ?? '-'),
  )
}

/** Vencida y sin pagar: es lo que la ventanilla tiene que cobrar primero. */
function estaVencido(credito: Credito): boolean {
  return (
    credito.estado === 'pendiente' && new Date(credito.fechaVencimiento) < new Date()
  )
}

function formatoMonto(monto: number): string {
  return monto.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleDateString('es-BO')
}
</script>

<template>
  <section class="cartera">
    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Busqueda y resumen                                    -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="barra tarjeta">
      <div class="campo barra__busqueda">
        <label class="campo__label" for="carnet">Buscar por carnet</label>
        <div class="barra__input-grupo">
          <input
            id="carnet"
            :value="clientes.filtroCarnet"
            class="campo__input"
            type="search"
            inputmode="text"
            placeholder="Ej. 4821563 SC"
            autocomplete="off"
            spellcheck="false"
            @input="clientes.buscar(($event.target as HTMLInputElement).value)"
          />
          <button
            v-if="clientes.filtroCarnet"
            type="button"
            class="btn btn--neutro"
            @click="clientes.limpiarBusqueda()"
          >
            Limpiar
          </button>
        </div>
      </div>

      <div class="barra__resumen">
        <span class="barra__resumen-label">Pendiente en pantalla</span>
        <span class="barra__resumen-monto monto">Bs {{ formatoMonto(clientes.totalPendiente) }}</span>
        <span class="barra__resumen-cantidad">
          {{ clientes.clientesFiltrados.length }}
          cliente{{ clientes.clientesFiltrados.length === 1 ? '' : 's' }}
        </span>
      </div>
    </div>

    <p v-if="!flags.pagoQr" class="aviso aviso--atencion">
      El cobro por QR esta <strong>deshabilitado</strong>. El boton Pagar registra la
      cuota al instante, sin emitir QR. Se cambia en <strong>Funcionalidades</strong>.
    </p>

    <p v-if="aviso" class="aviso aviso--info">{{ aviso }}</p>
    <p v-if="impresion.aviso.value" class="aviso aviso--atencion">
      {{ impresion.aviso.value }}
    </p>
    <p v-if="reimpresion.aviso.value" class="aviso aviso--info">
      {{ reimpresion.aviso.value }}
    </p>
    <p v-if="reimpresion.error.value" class="aviso aviso--error">
      {{ reimpresion.error.value }}
    </p>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Clientes                                              -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div v-if="!hayResultados" class="estado-vacio tarjeta">
      <span>No hay clientes con el carnet buscado.</span>
    </div>

    <article
      v-for="cliente in clientes.clientesFiltrados"
      :key="cliente.id"
      class="cliente tarjeta"
    >
      <header class="cliente__cabecera">
        <div class="cliente__identidad">
          <span class="cliente__carnet mono">{{ cliente.carnet }}</span>
          <span class="cliente__nombre">{{ nombreCompleto(cliente) }}</span>
        </div>
        <span class="cliente__conteo">
          {{ cliente.creditos.length }}
          credito{{ cliente.creditos.length === 1 ? '' : 's' }}
        </span>
      </header>

      <ul class="creditos">
        <li v-for="credito in cliente.creditos" :key="credito.id" class="credito">
          <div class="credito__datos">
            <span class="credito__operacion mono">{{ credito.numeroOperacion }}</span>
            <span class="credito__producto">{{ credito.producto }}</span>
            <span class="credito__vencimiento">
              Vence {{ formatoFecha(credito.fechaVencimiento) }}
            </span>
          </div>

          <div class="credito__monto">
            <span class="credito__monto-label">Cuota</span>
            <span class="monto">{{ credito.moneda }} {{ formatoMonto(credito.montoCuota) }}</span>
          </div>

          <div class="credito__estado">
            <span
              class="etiqueta"
              :class="
                credito.estado === 'pagado'
                  ? 'etiqueta--pagado'
                  : estaVencido(credito)
                    ? 'etiqueta--vencido'
                    : 'etiqueta--pendiente'
              "
            >
              {{
                credito.estado === 'pagado'
                  ? 'Pagado'
                  : estaVencido(credito)
                    ? 'Vencido'
                    : 'Pendiente de pago'
              }}
            </span>
            <span v-if="credito.pago" class="credito__constancia">
              {{ formatoFecha(credito.pago.fechaPago) }}
              {{ credito.pago.horaPago ?? '' }}
              <template v-if="credito.pago.qrId">
                · QR {{ credito.pago.qrId }}
              </template>
            </span>
          </div>

          <button
            v-if="credito.estado === 'pagado'"
            type="button"
            class="btn btn--contorno credito__pagar"
            :disabled="!!reimpresion.reimprimiendo.value"
            @click="reimprimir(cliente, credito)"
          >
            <AppIcon name="reimprimir" />
            Reimprimir
          </button>
          <button
            v-else
            type="button"
            class="btn credito__pagar"
            :class="flags.pagoQr ? 'btn--primario' : 'btn--secundario'"
            @click="pagar(cliente, credito)"
          >
            {{ flags.pagoQr ? 'Pagar con QR' : 'Pagar' }}
          </button>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.cartera {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* -----------------------------------------------------------
   Barra de busqueda
   ----------------------------------------------------------- */
.barra {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
  padding: 16px 18px;
}

.barra__busqueda {
  flex: 1;
  min-width: 240px;
}

.barra__input-grupo {
  display: flex;
  gap: 8px;
}

.barra__resumen {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
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
   Cliente
   ----------------------------------------------------------- */
.cliente {
  overflow: hidden;
}

.cliente__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 13px 18px;
  background: var(--pos-bg-soft-2);
  border-bottom: 1px solid var(--pos-border-soft);
}

.cliente__identidad {
  display: flex;
  align-items: baseline;
  gap: 12px;
  flex-wrap: wrap;
}

.cliente__carnet {
  padding: 2px 9px;
  border-radius: 6px;
  background: rgba(15, 67, 114, 0.09);
  color: var(--pos-primary);
  font-weight: 700;
  letter-spacing: 0.4px;
}

.cliente__nombre {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.cliente__conteo {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--pos-text-soft);
  white-space: nowrap;
}

/* -----------------------------------------------------------
   Creditos
   ----------------------------------------------------------- */
.creditos {
  margin: 0;
  padding: 0;
  list-style: none;
}

.credito {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(150px, auto) auto;
  align-items: center;
  gap: 16px;
  padding: 13px 18px;
  border-bottom: 1px solid var(--pos-border-soft);
}

.credito:last-child {
  border-bottom: none;
}

.credito__datos {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.credito__operacion {
  font-weight: 700;
  color: var(--pos-text);
}

.credito__producto {
  font-size: 0.84rem;
  color: var(--pos-text);
}

.credito__vencimiento {
  font-size: 0.72rem;
  color: var(--pos-text-soft);
}

.credito__monto {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.3;
}

.credito__monto-label {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.credito__monto .monto {
  font-size: 1rem;
  color: var(--pos-text-title);
}

.credito__estado {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.credito__constancia {
  font-size: 0.68rem;
  color: var(--pos-text-soft);
}

.credito__pagar {
  min-width: 132px;
}

/* -----------------------------------------------------------
   Responsive
   ----------------------------------------------------------- */
@media (max-width: 820px) {
  .credito {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px 14px;
  }

  .credito__estado {
    grid-column: 1 / -1;
  }

  .credito__pagar {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
