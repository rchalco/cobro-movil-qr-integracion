<script setup lang="ts">
/**
 * Iconos de la aplicacion, como SVG en linea.
 *
 * En linea y no como fuente de iconos ni archivos sueltos: son nueve trazos, no
 * justifican una descarga adicional ni una dependencia, y al ser SVG heredan el color del
 * texto —`currentColor`— de modo que el mismo icono sirve sobre la cabecera azul y sobre
 * el fondo claro sin tener dos versiones.
 */
const props = withDefaults(
  defineProps<{ name: string; size?: number }>(),
  { size: 18 },
)

/** Trazos de cada icono, sobre una caja de 24x24. */
const TRAZOS: Record<string, string> = {
  // Cartera de clientes: dos personas.
  clientes:
    'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75',
  // Cobros del dia: un codigo QR.
  qr: 'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h3v3h-3 M19 19h2v2h-2',
  // Comprobantes: un ticket con el borde dentado.
  voucher:
    'M4 3h16v18l-2.5-1.5L15 21l-2.5-1.5L10 21l-2.5-1.5L5 21l-1-.7z M8 8h8 M8 12h8 M8 16h5',
  // Impresora.
  impresora:
    'M6 9V3h12v6 M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 14h12v7H6z',
  // Funcionalidades: controles deslizantes.
  funcionalidades:
    'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6',
  // Salir de la sesion.
  salir: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  // Reiniciar los datos de la demo.
  reiniciar: 'M3 2v6h6 M3.5 14a9 9 0 1 0 2.1-9.4L3 8',
  // Imprimir de nuevo.
  reimprimir: 'M23 4v6h-6 M20.5 14a9 9 0 1 1-2.1-9.4L23 8',
  // Advertencia: comprobante sin imprimir.
  alerta: 'M12 9v4 M12 17h.01 M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
}
</script>

<template>
  <svg
    class="icono"
    :width="props.size"
    :height="props.size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path v-for="(d, i) in (TRAZOS[props.name] ?? '').split(' M')" :key="i" :d="i === 0 ? d : `M${d}`" />
  </svg>
</template>

<style scoped>
.icono {
  flex-shrink: 0;
  display: block;
}
</style>
