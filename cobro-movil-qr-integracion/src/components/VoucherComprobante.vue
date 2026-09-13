<script setup lang="ts">
/**
 * Comprobante en pantalla. Muestra **lo mismo que sale impreso**, con la forma de un
 * ticket: cuando la impresora falla, esto es lo que el cajero le muestra al cliente y lo
 * que puede fotografiar. Si mostrara datos distintos a los del papel, un cobro
 * reimpreso mas tarde no coincidiria con lo que el cliente ya vio.
 */
import { computed } from 'vue'

import { esPagoDeTercero, type Comprobante } from '@/models/comprobante'

const props = defineProps<{ comprobante: Comprobante }>()

const pagoDeTercero = computed(() => esPagoDeTercero(props.comprobante))

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
  <article class="voucher">
    <header class="voucher__cabecera">
      <span class="voucher__marca">COBRO MOVIL QR</span>
      <span class="voucher__tipo">Comprobante de pago</span>
    </header>

    <div class="voucher__sep"></div>

    <dl class="voucher__filas">
      <div><dt>Nro</dt><dd class="mono">{{ comprobante.numero }}</dd></div>
      <div><dt>Fecha</dt><dd>{{ fechaHora(comprobante.emitidoEn) }}</dd></div>
      <div><dt>Sucursal</dt><dd>{{ comprobante.codigoSucursal ?? '-' }}</dd></div>
      <div><dt>Cajero</dt><dd>{{ comprobante.cajero }}</dd></div>
    </dl>

    <div class="voucher__sep"></div>

    <span class="voucher__titulo">Cliente</span>
    <p class="voucher__nombre">{{ comprobante.nombreCliente }}</p>
    <dl class="voucher__filas">
      <div><dt>Carnet</dt><dd class="mono">{{ comprobante.carnet }}</dd></div>
    </dl>

    <div class="voucher__sep"></div>

    <span class="voucher__titulo">Credito</span>
    <dl class="voucher__filas">
      <div>
        <dt>Operacion</dt>
        <dd class="mono">{{ comprobante.numeroOperacion }}</dd>
      </div>
    </dl>
    <p class="voucher__producto">{{ comprobante.producto }}</p>

    <div class="voucher__sep"></div>

    <p class="voucher__monto">
      {{ comprobante.moneda }} {{ monto(comprobante.monto) }}
    </p>

    <div class="voucher__sep"></div>

    <template v-if="comprobante.canal === 'qr'">
      <span class="voucher__titulo">Pago por QR</span>

      <p v-if="pagoDeTercero" class="voucher__tercero">Pago de tercero</p>

      <dl class="voucher__filas">
        <div><dt>Hora</dt><dd>{{ comprobante.horaPago ?? '-' }}</dd></div>
        <div><dt>Pagador</dt><dd>{{ comprobante.nombrePagador ?? '-' }}</dd></div>
        <div v-if="comprobante.documentoPagador">
          <dt>Documento</dt><dd class="mono">{{ comprobante.documentoPagador }}</dd>
        </div>
        <div v-if="comprobante.cuentaPagador">
          <dt>Cuenta</dt><dd class="mono">{{ comprobante.cuentaPagador }}</dd>
        </div>
        <div><dt>Banco</dt><dd>{{ comprobante.codigoBancoOrigen ?? '-' }}</dd></div>
      </dl>
      <p class="voucher__codigo mono">QR: {{ comprobante.qrId ?? '-' }}</p>
      <p class="voucher__codigo mono">Trx: {{ comprobante.transactionId ?? '-' }}</p>
    </template>

    <template v-else>
      <span class="voucher__titulo">Pago registrado en caja</span>
      <dl class="voucher__filas">
        <div><dt>Hora</dt><dd>{{ comprobante.horaPago ?? '-' }}</dd></div>
      </dl>
      <p class="voucher__nota">Cobro registrado sin emision de QR.</p>
    </template>

    <div class="voucher__sep"></div>

    <p class="voucher__pie">
      Documento de demostracion.<br />No tiene validez legal ni tributaria.
    </p>
  </article>
</template>

<style scoped>
/* El ticket se dibuja como el papel: monoespaciado, angosto y con el borde dentado del
   corte. Es lo que hace que se lea como un comprobante y no como otra tarjeta mas. */
.voucher {
  width: 100%;
  max-width: 320px;
  margin: 0 auto;
  padding: 18px 20px 22px;
  background: #fff;
  color: #111;
  border: 1px solid var(--pos-border);
  border-radius: 4px;
  box-shadow: var(--pos-shadow-md);
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  font-size: 0.76rem;
  line-height: 1.5;
}

.voucher__cabecera {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.voucher__marca {
  font-size: 0.95rem;
  font-weight: 800;
  letter-spacing: 1.5px;
}

.voucher__tipo {
  font-size: 0.68rem;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.voucher__sep {
  margin: 9px 0;
  border-top: 1px dashed #999;
}

.voucher__titulo {
  display: block;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.voucher__filas {
  margin: 0;
}

.voucher__filas div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.voucher__filas dt {
  flex-shrink: 0;
}

.voucher__filas dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.voucher__nombre,
.voucher__producto,
.voucher__nota,
.voucher__codigo {
  margin: 2px 0 0;
  overflow-wrap: anywhere;
}

.voucher__codigo {
  font-size: 0.68rem;
}

.voucher__monto {
  margin: 4px 0;
  text-align: center;
  font-size: 1.25rem;
  font-weight: 800;
}

.voucher__pie {
  margin: 0;
  text-align: center;
  font-size: 0.66rem;
  line-height: 1.4;
}

.voucher__tercero {
  margin: 3px 0;
  padding: 2px 0;
  text-align: center;
  font-weight: 800;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  color: #fff;
  background: #111;
}

/* -----------------------------------------------------------
   Impresion por el dialogo del sistema
   ----------------------------------------------------------- */
/* El navegador puede imprimir este ticket directamente —util cuando la termica no
   respondio y hay una impresora comun a mano—. Se fija el papel en 80 mm y se saca del
   flujo todo lo demas: sin esto sale la aplicacion entera y el ticket en una esquina. */
@media print {
  @page {
    size: 80mm auto;
    margin: 4mm;
  }

  .voucher {
    width: 72mm;
    max-width: none;
    margin: 0;
    padding: 0;
    border: none;
    border-radius: 0;
    box-shadow: none;
    font-size: 11px;
  }

  .voucher__tercero {
    /* Los fondos no se imprimen salvo que se pida; sin esto quedaria texto blanco sobre
       blanco, es decir, invisible justo en el aviso que mas importa. */
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
</style>
