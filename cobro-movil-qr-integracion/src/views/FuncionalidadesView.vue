<script setup lang="ts">
/**
 * Funcionalidades activables en este equipo. Es la misma pantalla que `FuncionalidadesPage`
 * de Iza y gobierna el mismo flag: `pagoQr`.
 */
import { computed, onMounted, ref } from 'vue'

import AppIcon from '@/components/AppIcon.vue'
import {
  CODIGO_SUCURSAL,
  MONEDA,
  QR_AMBIENTE,
  QR_BASE_URL,
  USA_DEV_SERVER,
} from '@/config/env'
import { hayLlavero, origenApiKey, obtenerApiKey } from '@/services/credenciales'
import { useFeatureFlagsStore } from '@/stores/featureFlags.store'
import { CUOTA_TOPE, useClientesStore } from '@/stores/clientes.store'

const flags = useFeatureFlagsStore()
const clientes = useClientesStore()

const pagoQr = ref(false)
const aviso = ref('')
const error = ref('')

// ── Reinicio de la cartera ────────────────────────────────
const minimo = ref(clientes.rango.minimo)
const maximo = ref(clientes.rango.maximo)
const reiniciando = ref(false)
const avisoReinicio = ref('')
const errorReinicio = ref('')

/**
 * El rango se valida aqui —ademas de normalizarse en el store— para poder decir que esta
 * mal antes de reiniciar. Si solo se normalizara, un cero de mas se tomaria en silencio y
 * la cartera saldria con importes que nadie pidio.
 */
const rangoInvalido = computed(() => {
  const min = Number(minimo.value)
  const max = Number(maximo.value)
  return (
    !Number.isFinite(min) ||
    !Number.isFinite(max) ||
    min <= 0 ||
    max <= 0 ||
    min > max ||
    max > CUOTA_TOPE
  )
})

const origenClave = ref(origenApiKey())

onMounted(async () => {
  pagoQr.value = flags.cargar().pagoQr
  // Se resuelve para poder decir de donde salio: al arrancar puede no haberse leido aun.
  await obtenerApiKey()
  origenClave.value = origenApiKey()
})

/**
 * Devuelve la cartera al estado inicial con importes nuevos. No toca los comprobantes ya
 * emitidos: son el registro de lo que se hizo y sobreviven al reinicio a proposito.
 */
async function reiniciarCartera(): Promise<void> {
  if (reiniciando.value || rangoInvalido.value) {
    return
  }

  reiniciando.value = true
  avisoReinicio.value = ''
  errorReinicio.value = ''

  try {
    const aplicado = clientes.reiniciar({
      minimo: Number(minimo.value),
      maximo: Number(maximo.value),
    })

    minimo.value = aplicado.minimo
    maximo.value = aplicado.maximo
    avisoReinicio.value =
      `Cartera reiniciada. Todas las cuotas quedaron pendientes, con importes entre ` +
      `${MONEDA} ${aplicado.minimo.toFixed(2)} y ${MONEDA} ${aplicado.maximo.toFixed(2)}.`
  } catch (e) {
    errorReinicio.value = 'No se pudo reiniciar la cartera.'
    console.error(e)
  } finally {
    reiniciando.value = false
  }
}

/**
 * El toggle ya movio `pagoQr` por el v-model: si la escritura falla hay que devolverlo al
 * valor real, o la pantalla quedaria mostrando algo que el proximo arranque ignora.
 */
async function cambiarPagoQr(valor: boolean): Promise<void> {
  if (flags.guardando || valor === flags.pagoQr) {
    return
  }

  aviso.value = ''
  error.value = ''

  try {
    await flags.guardar({ pagoQr: valor })
    pagoQr.value = valor
    aviso.value = valor
      ? 'Cobro por QR habilitado.'
      : 'Cobro por QR deshabilitado. El boton Pagar registrara la cuota al instante.'
  } catch {
    pagoQr.value = flags.pagoQr
    error.value = 'No se pudo guardar la configuracion. Intente nuevamente.'
  }
}
</script>

<template>
  <section class="funcionalidades">
    <p class="funcionalidades__intro">
      Funciones que se pueden activar o desactivar en este equipo. El cambio se guarda
      localmente y aplica de inmediato, sin reiniciar la aplicacion.
    </p>

    <p v-if="aviso" class="aviso aviso--info">{{ aviso }}</p>
    <p v-if="error" class="aviso aviso--error">{{ error }}</p>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Cobro por QR                                          -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article class="feature tarjeta">
      <header class="feature__cabecera">
        <span class="feature__icono" aria-hidden="true">
          <AppIcon name="qr" :size="20" />
        </span>
        <div class="feature__titulo">
          <span class="feature__nombre">Cobro por QR</span>
          <span class="feature__estado" :class="{ 'feature__estado--on': pagoQr }">
            {{ pagoQr ? 'Habilitado' : 'Deshabilitado' }}
          </span>
        </div>

        <label class="switch">
          <input
            type="checkbox"
            :checked="pagoQr"
            :disabled="flags.guardando"
            @change="cambiarPagoQr(($event.target as HTMLInputElement).checked)"
          />
          <span class="switch__pista" aria-hidden="true"></span>
          <span class="switch__texto">Cobro por QR</span>
        </label>
      </header>

      <p class="feature__descripcion">
        Genera un QR de un solo uso y monto fijo por cada cuota, y espera la acreditacion
        del banco antes de darla por pagada.
      </p>

      <div class="feature__efectos">
        <div class="efecto">
          <span class="efecto__marca efecto__marca--on" aria-hidden="true">✓</span>
          <span>
            <strong>Habilitado:</strong> el boton Pagar abre la pantalla del QR y el menu
            muestra <strong>Pagos QR</strong>.
          </span>
        </div>
        <div class="efecto">
          <span class="efecto__marca efecto__marca--off" aria-hidden="true">•</span>
          <span>
            <strong>Deshabilitado:</strong> el boton Pagar sigue disponible y registra la
            cuota al instante, sin emitir QR.
          </span>
        </div>
      </div>

      <p class="aviso aviso--info">
        La configuracion es de este equipo. No afecta a otros ni a los QR ya emitidos, que
        siguen siendo cobrables hasta su vencimiento.
      </p>
    </article>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Datos de demostracion                                 -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article class="feature tarjeta">
      <header class="feature__cabecera">
        <span class="feature__icono" aria-hidden="true">
          <AppIcon name="reiniciar" :size="20" />
        </span>
        <div class="feature__titulo">
          <span class="feature__nombre">Datos de demostracion</span>
          <span class="feature__estado">Cartera de clientes</span>
        </div>
      </header>

      <p class="feature__descripcion">
        Devuelve la cartera al estado inicial: todas las cuotas quedan
        <strong>pendientes de pago</strong> y se sortean importes nuevos dentro del rango.
        Sirve para volver a demostrar el cobro sin recargar ni reinstalar.
      </p>

      <div class="rango">
        <div class="campo">
          <label class="campo__label" for="cuotaMin">Cuota minima ({{ MONEDA }})</label>
          <input
            id="cuotaMin"
            v-model.number="minimo"
            class="campo__input"
            type="number"
            min="1"
            :max="CUOTA_TOPE"
            step="1"
            inputmode="decimal"
          />
        </div>

        <div class="campo">
          <label class="campo__label" for="cuotaMax">Cuota maxima ({{ MONEDA }})</label>
          <input
            id="cuotaMax"
            v-model.number="maximo"
            class="campo__input"
            type="number"
            min="1"
            :max="CUOTA_TOPE"
            step="1"
            inputmode="decimal"
          />
        </div>
      </div>

      <p v-if="rangoInvalido" class="aviso aviso--error">
        El rango debe ser de importes mayores a cero, con el minimo por debajo del maximo
        y sin pasar de {{ MONEDA }} {{ CUOTA_TOPE.toLocaleString('es-BO') }}.
      </p>

      <p v-if="avisoReinicio" class="aviso aviso--info">{{ avisoReinicio }}</p>
      <p v-if="errorReinicio" class="aviso aviso--error">{{ errorReinicio }}</p>

      <div class="feature__acciones">
        <button
          type="button"
          class="btn btn--primario"
          :disabled="reiniciando || rangoInvalido"
          @click="reiniciarCartera"
        >
          <span v-if="reiniciando" class="spinner spinner--sm"></span>
          <AppIcon v-else name="reiniciar" />
          {{ reiniciando ? 'Reiniciando...' : 'Reiniciar cartera' }}
        </button>
      </div>

      <p class="aviso aviso--info">
        Los comprobantes ya emitidos <strong>no se borran</strong>: son el registro de lo
        que se hizo y siguen disponibles en Comprobantes para reimprimir.
      </p>
    </article>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Integracion en uso                                    -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article class="feature tarjeta">
      <header class="feature__cabecera">
        <span class="feature__icono feature__icono--neutro" aria-hidden="true">
          <AppIcon name="funcionalidades" :size="20" />
        </span>
        <div class="feature__titulo">
          <span class="feature__nombre">Integracion en uso</span>
          <span class="feature__estado">
            Ambiente {{ QR_AMBIENTE }}
          </span>
        </div>
      </header>

      <dl class="integracion">
        <div><dt>Destino</dt><dd class="mono">{{ QR_BASE_URL }}</dd></div>
        <div><dt>Ambiente</dt><dd class="mono">{{ QR_AMBIENTE }}</dd></div>
        <div><dt>Transporte</dt>
          <dd>{{ USA_DEV_SERVER ? 'Reenvio del dev-server' : 'Directo al proxy' }}</dd>
        </div>
        <div><dt>API Key</dt>
          <dd>
            {{
              origenClave === 'llavero'
                ? 'Llavero del dispositivo'
                : origenClave === 'compilacion'
                  ? 'Configuracion de compilacion'
                  : 'Sin configurar'
            }}
          </dd>
        </div>
        <div><dt>Sucursal</dt><dd class="mono">{{ CODIGO_SUCURSAL }}</dd></div>
        <div><dt>Moneda</dt><dd class="mono">{{ MONEDA }}</dd></div>
      </dl>

      <p v-if="origenClave === 'ninguna'" class="aviso aviso--error">
        No hay API Key configurada: el proxy respondera 401 a toda llamada. Definala en
        <span class="mono">VITE_QR_API_KEY</span> dentro de <span class="mono">.env</span>.
      </p>
      <p v-else-if="hayLlavero()" class="aviso aviso--info">
        La API Key vive en el llavero del dispositivo (Keystore/Keychain), que la protege
        en reposo. Sigue viniendo dentro del paquete para poder sembrarla la primera vez,
        asi que quien desempaquete el APK la encuentra.
      </p>
      <p v-else class="aviso aviso--atencion">
        La API Key esta compilada en el bundle y es legible por cualquiera que abra las
        herramientas del navegador. Es aceptable para esta demo; una aplicacion real debe
        emitir estas llamadas desde un backend propio.
      </p>
    </article>
  </section>
</template>

<style scoped>
.funcionalidades {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 680px;
  margin: 0 auto;
}

.funcionalidades__intro {
  margin: 0;
  padding: 0 4px;
  font-size: 0.84rem;
  color: var(--pos-text-soft);
}

.feature {
  display: flex;
  flex-direction: column;
  gap: 13px;
  padding: 18px;
}

.feature__cabecera {
  display: flex;
  align-items: center;
  gap: 13px;
}

.feature__icono {
  display: grid;
  place-items: center;
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: rgba(15, 67, 114, 0.09);
  color: var(--pos-primary);
  font-size: 0.82rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  flex-shrink: 0;
}

.feature__icono--neutro {
  background: var(--pos-bg-soft);
  color: var(--pos-text-soft);
  font-size: 1.1rem;
}

.feature__titulo {
  display: flex;
  flex-direction: column;
  gap: 1px;
  flex: 1;
}

.feature__nombre {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.feature__estado {
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.feature__estado--on {
  color: var(--pos-success);
}

.feature__descripcion {
  margin: 0;
  font-size: 0.86rem;
}

/* -----------------------------------------------------------
   Interruptor
   ----------------------------------------------------------- */
.switch {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}

.switch input {
  position: absolute;
  width: 46px;
  height: 26px;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}

.switch__texto {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.switch__pista {
  width: 46px;
  height: 26px;
  border-radius: 999px;
  background: rgba(15, 67, 114, 0.18);
  transition: background 0.18s ease;
}

.switch__pista::after {
  content: '';
  display: block;
  width: 20px;
  height: 20px;
  margin: 3px;
  border-radius: 50%;
  background: #fff;
  box-shadow: var(--pos-shadow-sm);
  transition: transform 0.18s ease;
}

.switch input:checked + .switch__pista {
  background: var(--pos-success);
}

.switch input:checked + .switch__pista::after {
  transform: translateX(20px);
}

.switch input:focus-visible + .switch__pista {
  box-shadow: 0 0 0 3px rgba(15, 67, 114, 0.2);
}

.switch input:disabled + .switch__pista {
  opacity: 0.5;
  cursor: not-allowed;
}

/* -----------------------------------------------------------
   Efectos del flag
   ----------------------------------------------------------- */
.feature__efectos {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 13px;
  background: var(--pos-bg-soft);
  border: 1px solid var(--pos-border-soft);
  border-radius: var(--pos-radius-xs);
}

.efecto {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  font-size: 0.82rem;
  line-height: 1.4;
}

.efecto__marca {
  font-weight: 800;
  line-height: 1.3;
  flex-shrink: 0;
}

.efecto__marca--on {
  color: var(--pos-success);
}

.efecto__marca--off {
  color: var(--pos-text-soft);
  font-size: 1.2rem;
  line-height: 1;
}

/* -----------------------------------------------------------
   Rango de cuotas
   ----------------------------------------------------------- */
.rango {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 12px;
}

.feature__acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* -----------------------------------------------------------
   Integracion
   ----------------------------------------------------------- */
.integracion {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
}

.integracion div {
  display: flex;
  align-items: baseline;
  gap: 12px;
}

.integracion dt {
  min-width: 84px;
  font-size: 0.64rem;
  font-weight: 800;
  letter-spacing: 0.7px;
  text-transform: uppercase;
  color: var(--pos-text-soft);
}

.integracion dd {
  margin: 0;
  overflow-wrap: anywhere;
}
</style>
