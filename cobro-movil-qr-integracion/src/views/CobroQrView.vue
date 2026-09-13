<script setup lang="ts">
/**
 * Cobro de una cuota por QR. Orquesta lo que en Iza hace `VentaExpressPage`: muestra el
 * panel del QR y solo asienta el cobro cuando el banco lo acredita.
 *
 * La regla de orden importa: **antes de la acreditacion no hay pago**, solo un QR
 * emitido. Por eso la cuota se marca pagada en `pagoQrConfirmado` y no al abrir esta
 * pantalla. Y una vez acreditado, la pantalla se queda mostrando el movimiento en lugar
 * de volver sola: si algo fallara al registrar, el cajero tiene que ver que la plata ya
 * entro y no volver a cobrar.
 */
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import PagoQrPanel from '@/components/PagoQrPanel.vue'
import { useImpresion, useReimpresion } from '@/composables/useImpresion'
import { nombreCompleto } from '@/models/clientes'
import type { Comprobante } from '@/models/comprobante'
import type { QrPagado } from '@/models/pagos'
import { construirComprobante } from '@/services/comprobante.service'
import { useAuthStore } from '@/stores/auth.store'
import { useClientesStore } from '@/stores/clientes.store'

const props = defineProps<{ creditoId: string }>()

const clientes = useClientesStore()
const auth = useAuthStore()
const impresion = useImpresion()
const reimpresion = useReimpresion()
const router = useRouter()

const encontrado = computed(() => clientes.buscarCredito(props.creditoId))
const pagoAcreditado = ref<QrPagado | null>(null)

/**
 * El comprobante que se emitio por este cobro. Se guarda para que reimprimir sea volver a
 * sacar **este** papel: reconstruirlo daria un numero nuevo y el cliente terminaria con
 * dos comprobantes distintos por un solo cobro.
 */
const comprobanteEmitido = ref<Comprobante | null>(null)

onMounted(() => {
  // Una cuota inexistente o ya cobrada no debe abrir un QR: seria un segundo codigo
  // cobrable por una deuda que ya no existe.
  if (!encontrado.value || encontrado.value.credito.estado === 'pagado') {
    router.replace({ name: 'clientes' })
  }
})

const descripcion = computed(() => {
  const dato = encontrado.value
  if (!dato) {
    return null
  }
  return `Cuota ${dato.credito.numeroOperacion} - ${nombreCompleto(dato.cliente)}`
})

/**
 * El panel detecto un cobro acreditado sobre este QR: recien ahi se asienta la cuota y se
 * imprime el comprobante.
 *
 * El orden no es casual. La cuota se registra **antes** de imprimir, porque el cobro ya
 * existe lo imprima o no; y la pantalla de acreditacion se muestra igual aunque la
 * impresion falle, porque lo que el cajero necesita ver es que la plata entro. La
 * impresion que no salio queda pendiente y se resuelve en la pantalla de Impresora.
 */
async function pagoQrConfirmado(pago: QrPagado): Promise<void> {
  clientes.registrarPagoQr(props.creditoId, pago)
  pagoAcreditado.value = pago

  const dato = encontrado.value
  if (!dato) {
    return
  }

  const comprobante = construirComprobante(
    dato.cliente,
    dato.credito,
    pago,
    auth.usuario?.nombre ?? '-',
  )
  comprobanteEmitido.value = comprobante

  await impresion.imprimir(comprobante)
}

/**
 * Reimprime el comprobante de este cobro, **las veces que haga falta**: el papel se
 * atasca, sale ilegible o el cliente pide otra copia. Siempre el mismo comprobante, con
 * el mismo numero.
 */
async function reimprimir(): Promise<void> {
  if (!comprobanteEmitido.value) {
    return
  }

  await reimpresion.reimprimir(comprobanteEmitido.value)
}

/** Vuelve a la cartera dejando la cuota intacta: el cobro no llego a ocurrir. */
function cancelar(): void {
  router.push({ name: 'clientes' })
}

function formatoMonto(monto: number): string {
  return monto.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}
</script>

<template>
  <section v-if="encontrado" class="cobro">
    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Cuota que se esta cobrando                            -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div class="resumen tarjeta">
      <div class="resumen__bloque">
        <span class="resumen__label">Cliente</span>
        <span class="resumen__valor">{{ nombreCompleto(encontrado.cliente) }}</span>
        <span class="resumen__detalle mono">{{ encontrado.cliente.carnet }}</span>
      </div>

      <div class="resumen__bloque">
        <span class="resumen__label">Operacion</span>
        <span class="resumen__valor mono">{{ encontrado.credito.numeroOperacion }}</span>
        <span class="resumen__detalle">{{ encontrado.credito.producto }}</span>
      </div>

      <div class="resumen__bloque resumen__bloque--monto">
        <span class="resumen__label">Cuota a cobrar</span>
        <span class="resumen__valor monto">
          {{ encontrado.credito.moneda }} {{ formatoMonto(encontrado.credito.montoCuota) }}
        </span>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Cobro acreditado                                      -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <div v-if="pagoAcreditado" class="acreditado tarjeta">
      <span class="acreditado__titulo">Cobro acreditado</span>
      <p class="acreditado__texto">
        La cuota <strong>{{ encontrado.credito.numeroOperacion }}</strong> quedo
        registrada como pagada.
      </p>

      <dl class="acreditado__datos">
        <div><dt>QR</dt><dd class="mono">{{ pagoAcreditado.qrId }}</dd></div>
        <div><dt>Transaccion</dt><dd class="mono">{{ pagoAcreditado.transactionId ?? '-' }}</dd></div>
        <div>
          <dt>Monto</dt>
          <dd class="monto">{{ pagoAcreditado.moneda }} {{ formatoMonto(pagoAcreditado.monto) }}</dd>
        </div>
        <div><dt>Hora</dt><dd>{{ pagoAcreditado.horaPago ?? '-' }}</dd></div>
        <div><dt>Pagador</dt><dd>{{ pagoAcreditado.nombrePagador ?? '-' }}</dd></div>
        <div><dt>Banco origen</dt><dd>{{ pagoAcreditado.codigoBancoOrigen ?? '-' }}</dd></div>
      </dl>

      <p v-if="impresion.aviso.value" class="aviso aviso--atencion">
        {{ impresion.aviso.value }}
      </p>
      <p v-if="reimpresion.aviso.value" class="aviso aviso--info">
        {{ reimpresion.aviso.value }}
      </p>
      <p v-if="reimpresion.error.value" class="aviso aviso--error">
        {{ reimpresion.error.value }}
      </p>

      <div class="acreditado__acciones">
        <button type="button" class="btn btn--primario" @click="cancelar">
          Volver a la cartera
        </button>
        <button
          type="button"
          class="btn btn--secundario"
          :disabled="!!reimpresion.reimprimiendo.value || !comprobanteEmitido"
          @click="reimprimir"
        >
          <span
            v-if="reimpresion.reimprimiendo.value"
            class="spinner spinner--sm"
          ></span>
          <AppIcon v-else name="reimprimir" />
          {{ reimpresion.reimprimiendo.value ? 'Imprimiendo...' : 'Reimprimir comprobante' }}
        </button>
        <RouterLink :to="{ name: 'pagos-qr' }" class="btn btn--contorno">
          Ver cobros del dia
        </RouterLink>
      </div>
    </div>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Panel del QR                                          -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <PagoQrPanel
      v-else
      :monto-esperado="encontrado.credito.montoCuota"
      :descripcion="descripcion"
      @pago-confirmado="pagoQrConfirmado"
      @cancelar="cancelar"
    />
  </section>
</template>

<style scoped>
.cobro {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* -----------------------------------------------------------
   Resumen de la cuota
   ----------------------------------------------------------- */
.resumen {
  display: flex;
  justify-content: space-between;
  gap: 20px;
  flex-wrap: wrap;
  padding: 15px 18px;
}

.resumen__bloque {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.resumen__bloque--monto {
  align-items: flex-end;
  margin-left: auto;
}

.resumen__label {
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.resumen__valor {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.resumen__bloque--monto .resumen__valor {
  font-size: 1.2rem;
}

.resumen__detalle {
  font-size: 0.76rem;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Cobro acreditado
   ----------------------------------------------------------- */
.acreditado {
  display: flex;
  flex-direction: column;
  gap: 11px;
  align-self: center;
  width: 100%;
  max-width: 520px;
  padding: 20px;
  border-color: rgba(26, 122, 50, 0.28);
  background: var(--pos-success-soft);
}

.acreditado__titulo {
  font-size: 0.94rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  color: var(--pos-success);
}

.acreditado__texto {
  margin: 0;
  font-size: 0.86rem;
}

.acreditado__datos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 9px 16px;
  margin: 0;
  padding: 13px;
  background: #fff;
  border: 1px solid var(--pos-border-soft);
  border-radius: var(--pos-radius-xs);
}

.acreditado__datos div {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.acreditado__datos dt {
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.acreditado__datos dd {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 600;
  overflow-wrap: anywhere;
}

.acreditado__acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.acreditado__acciones .btn {
  text-decoration: none;
}

@media (max-width: 760px) {
  .resumen__bloque--monto {
    align-items: flex-start;
    margin-left: 0;
  }
}
</style>
