<script setup lang="ts">
/**
 * Configuracion de la impresora termica. Equivale a `ConfigPrinterPage` de Iza: buscar
 * equipos Bluetooth, elegir uno como preferido y probar la impresion.
 *
 * Al entrar procesa la **impresion pendiente**: si un cobro anterior no se pudo imprimir,
 * sale en cuanto hay impresora conectada. Esa es la razon de que la politica de impresion
 * traiga aqui al usuario ante cualquier fallo — llegar a esta pantalla es, por si mismo,
 * el reintento.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import type { PluginListenerHandle } from '@capacitor/core'
import {
  CapacitorThermalPrinter,
  type BluetoothDevice,
} from 'capacitor-thermal-printer'

import AppIcon from '@/components/AppIcon.vue'
import { useReimpresion } from '@/composables/useImpresion'
import type { Comprobante } from '@/models/comprobante'
import {
  conectar,
  conTiempoLimite,
  desconectar,
  guardarImpresoraPreferida,
  hayImpresoraNativa,
  mensajeDeError,
  obtenerImpresoraPreferida,
  olvidarImpresoraPreferida,
} from '@/helpers/printer.helper'
import { imprimirComprobante } from '@/services/comprobante.service'
import { useAuthStore } from '@/stores/auth.store'
import { useVouchersStore } from '@/stores/vouchers.store'

const auth = useAuthStore()
const vouchers = useVouchersStore()
const reimpresion = useReimpresion()

const esNativo = hayImpresoraNativa()

const equipos = ref<BluetoothDevice[]>([])
const buscando = ref(false)
const conectada = ref(false)
const preferidaDireccion = ref<string | null>(null)
const preferidaNombre = ref<string | null>(null)
const ocupado = ref(false)
const aviso = ref('')
const error = ref('')

let suscripciones: PluginListenerHandle[] = []

onMounted(async () => {
  cargarPreferida()

  if (!esNativo) {
    return
  }

  // Los eventos del plugin son la unica fuente de la lista de equipos: `startScan` no
  // devuelve nada, va emitiendo a medida que descubre.
  suscripciones = await Promise.all([
    CapacitorThermalPrinter.addListener('discoverDevices', ({ devices }) => {
      equipos.value = devices
    }),
    CapacitorThermalPrinter.addListener('discoveryFinish', () => {
      buscando.value = false
    }),
    CapacitorThermalPrinter.addListener('connected', () => {
      conectada.value = true
      void procesarPendiente()
    }),
    CapacitorThermalPrinter.addListener('disconnected', () => {
      conectada.value = false
    }),
  ])

  await procesarPendiente()
})

onBeforeUnmount(() => {
  // Sin esto los escuchas siguen vivos y la busqueda sigue consumiendo bateria al salir.
  suscripciones.forEach((s) => void s.remove())
  suscripciones = []

  if (esNativo && buscando.value) {
    void CapacitorThermalPrinter.stopScan().catch(() => undefined)
  }
})

function cargarPreferida(): void {
  const preferida = obtenerImpresoraPreferida()
  preferidaDireccion.value = preferida.address
  preferidaNombre.value = preferida.name
}

async function buscar(): Promise<void> {
  if (buscando.value || !esNativo) {
    return
  }

  limpiarMensajes()
  equipos.value = []

  try {
    if (conectada.value) {
      await conTiempoLimite(CapacitorThermalPrinter.disconnect(), 'disconnect(busqueda)')
      conectada.value = false
    }

    // Un `startScan` sobre una busqueda ya abierta falla en algunos equipos: se cierra
    // primero y se ignora el error de cerrar lo que no estaba abierto.
    await conTiempoLimite(CapacitorThermalPrinter.stopScan(), 'stopScan(previo)').catch(
      () => undefined,
    )
    await conTiempoLimite(CapacitorThermalPrinter.startScan(), 'startScan')
    buscando.value = true
  } catch (e) {
    fallo(e)
  }
}

async function detenerBusqueda(): Promise<void> {
  try {
    await conTiempoLimite(CapacitorThermalPrinter.stopScan(), 'stopScan')
  } catch (e) {
    fallo(e)
  } finally {
    buscando.value = false
  }
}

async function elegir(equipo: BluetoothDevice): Promise<void> {
  if (ocupado.value) {
    return
  }

  ocupado.value = true
  limpiarMensajes()

  try {
    await conectar(equipo.address)
    guardarImpresoraPreferida(equipo)
    cargarPreferida()
    conectada.value = true
    aviso.value = `Impresora ${equipo.name || equipo.address} configurada.`
    await procesarPendiente()
  } catch (e) {
    fallo(e)
  } finally {
    ocupado.value = false
  }
}

async function desconectarImpresora(): Promise<void> {
  try {
    await desconectar()
    conectada.value = false
  } catch (e) {
    fallo(e)
  }
}

function olvidar(): void {
  olvidarImpresoraPreferida()
  cargarPreferida()
  aviso.value = 'Impresora olvidada en este equipo.'
}

/** Imprime una prueba para confirmar que la impresora responde antes de un cobro real. */
async function imprimirPrueba(): Promise<void> {
  if (ocupado.value) {
    return
  }

  ocupado.value = true
  limpiarMensajes()

  try {
    await imprimirComprobante(comprobanteDePrueba())
    aviso.value = esNativo
      ? 'Prueba enviada a la impresora.'
      : 'Se abrio el dialogo de impresion del navegador.'
  } catch (e) {
    fallo(e)
  } finally {
    ocupado.value = false
  }
}

/**
 * Reintenta el comprobante mas reciente que nunca llego a la impresora. Se dispara al
 * conectar: llegar a esta pantalla y emparejar una impresora es, por si mismo, el
 * reintento de lo que quedo sin imprimir.
 */
async function procesarPendiente(): Promise<void> {
  const voucher = vouchers.pendiente
  if (!voucher) {
    return
  }

  // Sin impresora configurada no se intenta: se dejaria igual y el mensaje de error solo
  // taparia el que ya explica que hay que configurar una.
  if (esNativo && !obtenerImpresoraPreferida().address) {
    return
  }

  limpiarMensajes()

  if (await reimpresion.reimprimir(voucher.comprobante)) {
    aviso.value = `Comprobante pendiente ${voucher.comprobante.numero} impreso.`
  } else {
    error.value = reimpresion.error.value
  }
}

function comprobanteDePrueba(): Comprobante {
  const ahora = new Date()
  return {
    version: 1,
    numero: 'PRUEBA',
    emitidoEn: ahora.toISOString(),
    carnet: '0000000 XX',
    nombreCliente: 'Prueba de impresion',
    numeroOperacion: 'OP-PRUEBA',
    producto: 'Verificacion de la impresora',
    moneda: 'BOB',
    monto: 0,
    canal: 'directo',
    qrId: null,
    transactionId: null,
    fechaPago: ahora.toISOString(),
    horaPago: ahora.toLocaleTimeString('es-BO', { hour12: false }),
    nombrePagador: null,
    codigoBancoOrigen: null,
    codigoSucursal: null,
    cajero: auth.usuario?.nombre ?? '-',
  }
}

function limpiarMensajes(): void {
  aviso.value = ''
  error.value = ''
}

function fallo(e: unknown): void {
  error.value =
    `${mensajeDeError(e)} Si la impresora no aparece o no responde, apague y encienda ` +
    'el Bluetooth del equipo y vuelva a intentar.'
}

function formatoFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-BO')
}
</script>

<template>
  <section class="impresora">
    <p class="impresora__intro">
      Impresora termica Bluetooth de este equipo. La seleccion se guarda localmente y se
      usa para imprimir el comprobante de cada cobro.
    </p>

    <p v-if="aviso" class="aviso aviso--info">{{ aviso }}</p>
    <p v-if="error" class="aviso aviso--error">{{ error }}</p>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Comprobantes sin imprimir                             -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article v-if="vouchers.pendiente" class="tarjeta bloque bloque--pendiente">
      <header class="bloque__cabecera">
        <span class="bloque__titulo">
          <AppIcon name="alerta" />
          Comprobantes sin imprimir
        </span>
        <span class="etiqueta etiqueta--pendiente">
          {{ vouchers.sinImprimir.length }}
        </span>
      </header>

      <p class="bloque__texto">
        El cobro de <strong>{{ vouchers.pendiente.comprobante.nombreCliente }}</strong>
        por
        <strong>
          {{ vouchers.pendiente.comprobante.moneda }}
          {{ vouchers.pendiente.comprobante.monto.toFixed(2) }}
        </strong>
        ({{ vouchers.pendiente.comprobante.numeroOperacion }}) quedo registrado pero no
        se imprimio. Comprobante {{ vouchers.pendiente.comprobante.numero }},
        {{ formatoFecha(vouchers.pendiente.comprobante.emitidoEn) }}.
      </p>

      <div class="bloque__acciones">
        <button
          type="button"
          class="btn btn--primario"
          :disabled="ocupado || !!reimpresion.reimprimiendo.value"
          @click="procesarPendiente"
        >
          <AppIcon name="reimprimir" />
          Reimprimir ahora
        </button>
        <RouterLink :to="{ name: 'vouchers' }" class="btn btn--neutro">
          <AppIcon name="voucher" />
          Ver todos
        </RouterLink>
      </div>
    </article>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Impresora configurada                                 -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article class="tarjeta bloque">
      <header class="bloque__cabecera">
        <span class="bloque__titulo">Impresora configurada</span>
        <span
          class="etiqueta"
          :class="conectada ? 'etiqueta--pagado' : 'etiqueta--pendiente'"
        >
          {{ conectada ? 'Conectada' : 'Sin conectar' }}
        </span>
      </header>

      <div v-if="preferidaDireccion" class="preferida">
        <span class="preferida__nombre">{{ preferidaNombre || 'Sin nombre' }}</span>
        <span class="preferida__dir mono">{{ preferidaDireccion }}</span>
      </div>
      <p v-else class="bloque__texto">
        No hay ninguna impresora configurada en este equipo.
      </p>

      <div class="bloque__acciones">
        <button
          type="button"
          class="btn btn--secundario"
          :disabled="ocupado"
          @click="imprimirPrueba"
        >
          Imprimir prueba
        </button>
        <button
          v-if="esNativo && conectada"
          type="button"
          class="btn btn--contorno"
          @click="desconectarImpresora"
        >
          Desconectar
        </button>
        <button
          v-if="preferidaDireccion"
          type="button"
          class="btn btn--neutro"
          @click="olvidar"
        >
          Olvidar
        </button>
      </div>

      <p v-if="!esNativo" class="aviso aviso--info">
        La aplicacion corre en el navegador, donde no hay acceso a Bluetooth. El
        comprobante se imprime por el dialogo del sistema. La busqueda de impresoras
        funciona en la aplicacion empaquetada con Capacitor.
      </p>
    </article>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Equipos disponibles                                   -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <article v-if="esNativo" class="tarjeta bloque">
      <header class="bloque__cabecera">
        <span class="bloque__titulo">Equipos Bluetooth</span>
        <button
          v-if="!buscando"
          type="button"
          class="btn btn--primario"
          :disabled="ocupado"
          @click="buscar"
        >
          Buscar
        </button>
        <button v-else type="button" class="btn btn--neutro" @click="detenerBusqueda">
          Detener
        </button>
      </header>

      <div v-if="buscando" class="estado-vacio">
        <span class="spinner"></span>
        <span>Buscando equipos...</span>
      </div>

      <div v-else-if="equipos.length === 0" class="estado-vacio">
        <span>Sin equipos. Encienda la impresora y pulse Buscar.</span>
      </div>

      <ul v-else class="equipos">
        <li v-for="equipo in equipos" :key="equipo.address" class="equipo">
          <div class="equipo__datos">
            <span class="equipo__nombre">{{ equipo.name || 'Sin nombre' }}</span>
            <span class="equipo__dir mono">{{ equipo.address }}</span>
          </div>
          <button
            type="button"
            class="btn"
            :class="
              equipo.address === preferidaDireccion ? 'btn--contorno' : 'btn--primario'
            "
            :disabled="ocupado"
            @click="elegir(equipo)"
          >
            {{ equipo.address === preferidaDireccion ? 'Reconectar' : 'Usar esta' }}
          </button>
        </li>
      </ul>
    </article>
  </section>
</template>

<style scoped>
.impresora {
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 680px;
  margin: 0 auto;
}

.impresora__intro {
  margin: 0;
  padding: 0 4px;
  font-size: 0.84rem;
  color: var(--pos-text-soft);
}

.bloque {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 18px;
}

.bloque--pendiente {
  border-color: rgba(255, 176, 32, 0.42);
  background: var(--pos-warning-soft);
}

.bloque__cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.bloque__titulo {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.bloque__texto {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.45;
}

.bloque__acciones {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

/* -----------------------------------------------------------
   Impresora preferida
   ----------------------------------------------------------- */
.preferida {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 12px 14px;
  background: var(--pos-bg-soft);
  border: 1px solid var(--pos-border-soft);
  border-radius: var(--pos-radius-xs);
}

.preferida__nombre {
  font-size: 0.92rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.preferida__dir {
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Equipos
   ----------------------------------------------------------- */
.equipos {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
}

.equipo {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 0;
  border-bottom: 1px solid var(--pos-border-soft);
}

.equipo:last-child {
  border-bottom: none;
}

.equipo__datos {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.equipo__nombre {
  font-weight: 600;
}

.equipo__dir {
  color: var(--pos-text-soft);
}

@media (max-width: 560px) {
  .equipo {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
