<script setup lang="ts">
/**
 * Panel de cobro por QR. Es el equivalente de `PagoQrComponent` de Iza y sigue el mismo
 * ciclo: emitir el QR de este cobro, esperar, y verificar cada 60 segundos si ya se
 * acredito. El QR es de un solo uso y monto fijo, de modo que un cobro sobre su `qrId`
 * es exactamente el de esta cuota: no hay que conciliar por importe ni descartar
 * movimientos ajenos.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

import { SEGUNDOS_CICLO } from '@/config/env'
import {
  EstadoRespuesta,
  esFalloDeConexion,
  type CausaFallo,
  type QrPagado,
  type QrTransaccion,
} from '@/models/pagos'
import { consultaPagoQr, generaQrTransaccion } from '@/services/pagosQr.service'

const props = withDefaults(
  defineProps<{
    /** Importe exacto del QR. Viaja fijo en el codigo: el pagador no puede cambiarlo. */
    montoEsperado: number
    /** Glosa que ve el pagador. Si es null se arma una con la sucursal y la fecha. */
    descripcion?: string | null
    /** Sucursal que recauda. Si es null se usa la configurada. */
    codigoSucursal?: string | null
  }>(),
  { descripcion: null, codigoSucursal: null },
)

const emit = defineEmits<{
  /** El QR fue cobrado. Lleva el movimiento acreditado por el banco. */
  (e: 'pagoConfirmado', pago: QrPagado): void
  (e: 'cancelar'): void
}>()

// ── QR de este cobro ──────────────────────────────────────
const qr = ref<QrTransaccion | null>(null)
const generandoQr = ref(false)
const errorQr = ref('')
const causaQr = ref<CausaFallo | undefined>(undefined)

// ── Ciclo de verificacion ─────────────────────────────────
const segundosRestantes = ref(SEGUNDOS_CICLO)
const verificando = ref(false)
const mensajeEstado = ref('Esperando el pago del cliente...')
const errorVerificacion = ref('')
const causaVerificacion = ref<CausaFallo | undefined>(undefined)
const pagoConfirmado = ref<QrPagado | null>(null)

let temporizador: ReturnType<typeof setInterval> | null = null
let destruido = false

onMounted(() => generarQr())

onBeforeUnmount(() => {
  // Sin esto el sondeo sobrevive a la pantalla y sigue golpeando al proxy.
  destruido = true
  detenerTemporizador()
})

/** Imagen lista para el `src`. El banco puede o no mandar el prefijo `data:`. */
const qrImagenSrc = computed(() => {
  const base64 = qr.value?.qrImageBase64
  if (!base64) {
    return ''
  }
  return base64.startsWith('data:') ? base64 : `data:image/png;base64,${base64}`
})

/** El QR no se pudo emitir porque no hubo conexion: se ofrece reintentar. */
const sinConexionAlEmitir = computed(() => esFalloDeConexion(causaQr.value))

/** El sondeo no alcanza al servidor. El ciclo sigue: se recupera solo cuando vuelva. */
const sinConexionAlVerificar = computed(() => esFalloDeConexion(causaVerificacion.value))

const montoFormateado = computed(() =>
  props.montoEsperado.toLocaleString('es-BO', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }),
)

/**
 * Emite el QR de este cobro. Solo se reintenta cuando la emision anterior fallo: si ya
 * hay un codigo vivo, emitir otro dejaria dos QR cobrables por el mismo importe.
 */
async function generarQr(): Promise<void> {
  if (generandoQr.value || qr.value) {
    return
  }

  if (!props.montoEsperado || props.montoEsperado <= 0) {
    errorQr.value = 'El monto de la cuota debe ser mayor a cero para generar el QR.'
    return
  }

  generandoQr.value = true
  errorQr.value = ''
  causaQr.value = undefined

  const resultado = await generaQrTransaccion(
    props.montoEsperado,
    props.descripcion,
    props.codigoSucursal,
  )

  generandoQr.value = false

  if (destruido) {
    return
  }

  if (resultado.state !== EstadoRespuesta.Success || !resultado.data) {
    errorQr.value = resultado.message || 'No se pudo generar el QR de cobro.'
    causaQr.value = resultado.causa
    return
  }

  qr.value = resultado.data
  mensajeEstado.value = 'Esperando el pago del cliente...'
  iniciarTemporizador()
}

/** Fuerza la verificacion sin esperar a que termine el temporizador. */
function verificarAhora(): void {
  if (verificando.value || pagoConfirmado.value || !qr.value) {
    return
  }
  detenerTemporizador()
  void verificarPago()
}

function cancelar(): void {
  detenerTemporizador()
  emit('cancelar')
}

function iniciarTemporizador(): void {
  detenerTemporizador()

  if (destruido || pagoConfirmado.value || !qr.value) {
    return
  }

  segundosRestantes.value = SEGUNDOS_CICLO
  temporizador = setInterval(() => {
    segundosRestantes.value--

    if (segundosRestantes.value <= 0) {
      detenerTemporizador()
      void verificarPago()
    }
  }, 1000)
}

function detenerTemporizador(): void {
  if (temporizador) {
    clearInterval(temporizador)
    temporizador = null
  }
}

/** Pregunta al proxy si este qrId ya fue cobrado. */
async function verificarPago(): Promise<void> {
  if (destruido || !qr.value) {
    return
  }

  verificando.value = true
  errorVerificacion.value = ''
  causaVerificacion.value = undefined

  const resultado = await consultaPagoQr(qr.value.qrId, new Date())

  verificando.value = false

  if (destruido) {
    return
  }

  if (resultado.state === EstadoRespuesta.Success && resultado.data) {
    pagoConfirmado.value = resultado.data
    detenerTemporizador()
    mensajeEstado.value = 'Pago recibido. Registrando el cobro...'
    emit('pagoConfirmado', resultado.data)
    return
  }

  if (resultado.state === EstadoRespuesta.NoData) {
    // Es «todavia no pago»: el caso normal mientras se espera, no un fallo.
    mensajeEstado.value = 'Aun no se registra el pago. Se verificara de nuevo.'
  } else {
    // Un fallo tampoco corta el ciclo: se anota y se reintenta en el turno siguiente.
    // Vale igual para la falta de conexion: si el servidor vuelve antes de que el cliente
    // pague, el cobro se detecta sin que nadie tenga que reintentar a mano.
    errorVerificacion.value =
      resultado.message || 'No se pudo verificar el cobro del QR.'
    causaVerificacion.value = resultado.causa
    mensajeEstado.value = esFalloDeConexion(resultado.causa)
      ? 'Sin conexion con el servidor. Se reintentara.'
      : mensajeEstado.value
  }

  iniciarTemporizador()
}
</script>

<template>
  <div class="qr-panel">
    <div class="qr-card tarjeta">
      <header class="qr-card__header">
        <span class="qr-card__titulo">Cobro por QR</span>
        <div class="qr-monto">
          <span class="qr-monto__label">Monto fijo del QR</span>
          <span class="qr-monto__valor monto">Bs {{ montoFormateado }}</span>
        </div>
      </header>

      <div class="qr-card__content">
        <!-- ═══════════════════════════════════════════════ -->
        <!--  QR de este cobro                              -->
        <!-- ═══════════════════════════════════════════════ -->
        <div class="qr-imagen">
          <div v-if="qr && !generandoQr" class="qr-imagen__caja">
            <img :src="qrImagenSrc" alt="QR de cobro" class="qr-imagen__img" />
          </div>

          <div v-else-if="generandoQr" class="qr-imagen__caja qr-imagen__caja--vacia">
            <span class="spinner"></span>
            <span class="qr-imagen__texto">Generando QR...</span>
          </div>

          <div v-else class="qr-imagen__caja qr-imagen__caja--vacia">
            <span class="qr-imagen__icon" aria-hidden="true">QR</span>
            <span class="qr-imagen__texto">
              {{ sinConexionAlEmitir ? 'Sin conexion' : errorQr || 'QR no disponible' }}
            </span>
          </div>

          <div v-if="qr" class="qr-datos">
            <span class="qr-datos__item">Monto fijo, no editable</span>
            <span class="qr-datos__item">Un solo uso</span>
            <span class="qr-datos__item">Sucursal {{ qr.codigoSucursal }}</span>
            <span class="qr-datos__item">
              Vence {{ new Date(qr.fechaVencimiento).toLocaleDateString('es-BO') }}
            </span>
          </div>
        </div>

        <!-- ═══════════════════════════════════════════════ -->
        <!--  El QR no se pudo emitir                       -->
        <!-- ═══════════════════════════════════════════════ -->
        <div v-if="!qr && !generandoQr && errorQr" class="qr-fallo">
          <p class="aviso" :class="sinConexionAlEmitir ? 'aviso--atencion' : 'aviso--error'">
            {{ errorQr }}
          </p>
          <button type="button" class="btn btn--primario" @click="generarQr">
            {{ sinConexionAlEmitir ? 'Reintentar conexion' : 'Reintentar generacion' }}
          </button>
        </div>

        <!-- ═══════════════════════════════════════════════ -->
        <!--  Ciclo de verificacion                         -->
        <!-- ═══════════════════════════════════════════════ -->
        <div v-if="qr" class="qr-ciclo">
          <div class="qr-ciclo__timer">
            <span class="qr-ciclo__segundos">{{ segundosRestantes }}</span>
            <span class="qr-ciclo__unidad">seg</span>
          </div>

          <div class="qr-ciclo__estado">
            <span v-if="verificando" class="spinner spinner--sm"></span>
            <span v-else-if="pagoConfirmado" class="qr-ciclo__ok" aria-hidden="true">✓</span>
            <span v-else class="qr-ciclo__idle" aria-hidden="true">•</span>
            <span class="qr-ciclo__mensaje">{{ mensajeEstado }}</span>
          </div>
        </div>

        <p v-if="qr && !pagoConfirmado" class="qr-nota">
          Al terminar la cuenta regresiva se consulta si este QR ya fue cobrado. Si aun
          no llega el pago, se vuelve a consultar {{ SEGUNDOS_CICLO }} segundos despues.
        </p>

        <p
          v-if="errorVerificacion"
          class="aviso"
          :class="sinConexionAlVerificar ? 'aviso--atencion' : 'aviso--error'"
        >
          {{ errorVerificacion }}
        </p>

        <!-- ═══════════════════════════════════════════════ -->
        <!--  Acciones                                      -->
        <!-- ═══════════════════════════════════════════════ -->
        <div class="qr-acciones">
          <button
            type="button"
            class="btn btn--secundario"
            :disabled="verificando || !!pagoConfirmado || !qr"
            @click="verificarAhora"
          >
            Verificar ahora
          </button>

          <button
            type="button"
            class="btn btn--neutro"
            :disabled="!!pagoConfirmado"
            @click="cancelar"
          >
            Cancelar cobro
          </button>
        </div>

        <p v-if="qr && !pagoConfirmado" class="aviso aviso--atencion">
          Si cancela, este QR sigue siendo cobrable hasta su vencimiento. Verifique el
          movimiento en <strong>Pagos QR</strong> antes de volver a cobrar la cuota.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-panel {
  display: flex;
  justify-content: center;
  padding: 4px 0;
}

.qr-card {
  width: 100%;
  max-width: 520px;
  box-shadow: var(--pos-shadow-md);
}

.qr-card__header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 16px 20px 14px;
  border-bottom: 1px solid var(--pos-border-soft);
}

.qr-card__titulo {
  font-size: 0.92rem;
  font-weight: 800;
  letter-spacing: 0.3px;
  color: var(--pos-primary);
}

.qr-card__content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 15px;
  padding: 18px 20px 20px;
}

/* -----------------------------------------------------------
   Monto a cobrar
   ----------------------------------------------------------- */
.qr-monto {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  margin-top: 6px;
}

.qr-monto__label {
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.qr-monto__valor {
  font-size: 1.5rem;
  color: var(--pos-success);
}

/* -----------------------------------------------------------
   Imagen del QR
   ----------------------------------------------------------- */
.qr-imagen {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.qr-imagen__caja {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 232px;
  height: 232px;
  padding: 10px;
  background: #fff;
  border: 1px solid var(--pos-border);
  border-radius: var(--pos-radius);
  box-shadow: var(--pos-shadow-sm);
}

.qr-imagen__caja--vacia {
  background: var(--pos-bg-soft);
  color: var(--pos-text-soft);
}

.qr-imagen__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.qr-imagen__icon {
  font-size: 1.5rem;
  font-weight: 800;
  letter-spacing: 1px;
  color: var(--pos-primary);
  opacity: 0.4;
}

.qr-imagen__texto {
  padding: 0 8px;
  font-size: 0.8rem;
  font-weight: 600;
  text-align: center;
}

.qr-datos {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 5px 14px;
}

.qr-datos__item {
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Ciclo de verificacion
   ----------------------------------------------------------- */
.qr-ciclo {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  padding: 12px 16px;
  background: var(--pos-bg-soft-2);
  border: 1px solid var(--pos-border-soft);
  border-radius: var(--pos-radius-sm);
}

.qr-ciclo__timer {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 62px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid var(--pos-primary);
  color: var(--pos-primary);
}

.qr-ciclo__segundos {
  font-size: 1.3rem;
  font-weight: 800;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}

.qr-ciclo__unidad {
  font-size: 0.6rem;
  font-weight: 700;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  opacity: 0.75;
}

.qr-ciclo__estado {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.qr-ciclo__ok {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--pos-success);
}

.qr-ciclo__idle {
  font-size: 1.4rem;
  line-height: 1;
  color: var(--pos-text-soft);
}

.qr-ciclo__mensaje {
  font-size: 0.86rem;
  font-weight: 600;
  color: var(--pos-text);
}

.qr-nota {
  margin: 0;
  font-size: 0.74rem;
  line-height: 1.35;
  text-align: center;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Fallo de emision
   ----------------------------------------------------------- */
.qr-fallo {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: stretch;
  width: 100%;
}

/* -----------------------------------------------------------
   Acciones
   ----------------------------------------------------------- */
.qr-acciones {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
  width: 100%;
}

/* -----------------------------------------------------------
   Responsive
   ----------------------------------------------------------- */
@media (max-width: 767px) {
  .qr-imagen__caja {
    width: 190px;
    height: 190px;
  }

  .qr-ciclo {
    flex-direction: column;
    text-align: center;
  }

  .qr-ciclo__estado {
    justify-content: center;
  }
}
</style>
