<script setup lang="ts">
/**
 * Shell de la aplicacion: cabecera institucional, navegacion y salida de sesion.
 * La navegacion se arma de `router.options.routes`, filtrando por `enMenu` y por el
 * estado de la funcionalidad: el guard ya bloquea la ruta, esto evita ademas mostrar un
 * enlace que no lleva a ninguna parte.
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import AppIcon from '@/components/AppIcon.vue'
import VoucherComprobante from '@/components/VoucherComprobante.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useFeatureFlagsStore } from '@/stores/featureFlags.store'
import { useVouchersStore } from '@/stores/vouchers.store'

const auth = useAuthStore()
const flags = useFeatureFlagsStore()
const vouchers = useVouchersStore()
const router = useRouter()
const route = useRoute()

onMounted(() => flags.cargar())

const enlaces = computed(() =>
  router.options.routes.filter((r) => {
    if (!r.meta?.enMenu) {
      return false
    }
    const flag = r.meta.requiereFlag
    return !flag || flags.flags[flag]
  }),
)

function salir(): void {
  auth.salir()
  vouchers.mostrar(null)
  router.push({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <header v-if="auth.autenticado" class="cabecera">
      <div class="cabecera__marca">
        <span class="cabecera__logo" aria-hidden="true">QR</span>
        <div class="cabecera__titulo">
          <span class="cabecera__app">Cobro Movil QR</span>
          <span class="cabecera__ambiente">Integracion de demostracion</span>
        </div>
      </div>

      <nav class="cabecera__nav" aria-label="Navegacion principal">
        <RouterLink
          v-for="enlace in enlaces"
          :key="String(enlace.name)"
          :to="{ name: enlace.name }"
          class="nav-link"
          active-class="nav-link--activo"
          :title="enlace.meta?.titulo"
        >
          <AppIcon :name="enlace.meta?.icono ?? ''" />
          <span class="nav-link__texto">{{ enlace.meta?.titulo }}</span>
          <!-- Los comprobantes sin imprimir se avisan en el menu: es el unico estado
               que exige volver a una pantalla que ya se visito. -->
          <span
            v-if="enlace.name === 'vouchers' && vouchers.sinImprimir.length > 0"
            class="nav-link__marca"
            >{{ vouchers.sinImprimir.length }}</span
          >
        </RouterLink>
      </nav>

      <div class="cabecera__sesion">
        <div class="cabecera__usuario">
          <span class="cabecera__usuario-nombre">{{ auth.usuario?.nombre }}</span>
          <span class="cabecera__usuario-rol">{{ auth.usuario?.rol }}</span>
        </div>
        <button
          type="button"
          class="btn btn--neutro cabecera__salir"
          title="Cerrar sesion"
          @click="salir"
        >
          <AppIcon name="salir" />
          <span class="cabecera__salir-texto">Salir</span>
        </button>
      </div>
    </header>

    <main class="contenido" :class="{ 'contenido--plena': !auth.autenticado }">
      <RouterView :key="route.fullPath" />
    </main>

    <!-- ═══════════════════════════════════════════════════════ -->
    <!--  Comprobante que no se pudo imprimir                   -->
    <!-- ═══════════════════════════════════════════════════════ -->
    <!-- Vive en el shell y no en cada pantalla: el cobro puede venir de la cartera o de
         la pantalla del QR, y en ambos casos lo que hay que hacer es lo mismo. -->
    <div v-if="vouchers.enPantalla" class="velo" @click.self="vouchers.mostrar(null)">
      <div class="velo__contenido">
        <p class="velo__aviso">
          <AppIcon name="alerta" />
          No se pudo imprimir. El cobro quedo registrado; muestre este comprobante al
          cliente y reimprimalo desde Comprobantes.
        </p>

        <VoucherComprobante :comprobante="vouchers.enPantalla" />

        <div class="velo__acciones">
          <button type="button" class="btn btn--primario" @click="vouchers.mostrar(null)">
            Entendido
          </button>
          <RouterLink
            :to="{ name: 'vouchers' }"
            class="btn btn--contorno"
            @click="vouchers.mostrar(null)"
          >
            <AppIcon name="reimprimir" />
            Ir a Comprobantes
          </RouterLink>
        </div>
      </div>
    </div>

    <footer v-if="auth.autenticado" class="pie">
      Datos de clientes, creditos y sesion simulados. Los cobros por QR se emiten contra
      el proxy <strong>qr-banco-economico</strong> configurado.
    </footer>
  </div>
</template>

<style scoped>
.shell {
  display: flex;
  flex-direction: column;
  min-height: 100%;
}

/* -----------------------------------------------------------
   Cabecera
   ----------------------------------------------------------- */
.cabecera {
  display: flex;
  align-items: center;
  gap: 22px;
  flex-wrap: wrap;
  padding: 12px 22px;
  background: linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-dark) 100%);
  color: #fff;
  box-shadow: var(--pos-shadow-md);
}

.cabecera__marca {
  display: flex;
  align-items: center;
  gap: 11px;
}

.cabecera__logo {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.15);
  border: 1px solid rgba(255, 255, 255, 0.25);
  font-size: 0.86rem;
  font-weight: 800;
  letter-spacing: 0.5px;
}

.cabecera__titulo {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.cabecera__app {
  font-size: 1rem;
  font-weight: 700;
  letter-spacing: 0.2px;
}

.cabecera__ambiente {
  font-size: 0.68rem;
  font-weight: 600;
  letter-spacing: 0.6px;
  text-transform: uppercase;
  opacity: 0.72;
}

.cabecera__nav {
  display: flex;
  gap: 4px;
  flex: 1;
  flex-wrap: wrap;
}

.nav-link {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border-radius: var(--pos-radius-xs);
  color: rgba(255, 255, 255, 0.82);
  font-size: 0.82rem;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
  transition: background 0.15s ease, color 0.15s ease;
}

/* Cuenta de comprobantes sin imprimir. */
.nav-link__marca {
  display: grid;
  place-items: center;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  border-radius: 999px;
  background: #ffb020;
  color: #4a3000;
  font-size: 0.64rem;
  font-weight: 800;
}

.nav-link:hover {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.nav-link--activo {
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
}

.cabecera__sesion {
  display: flex;
  align-items: center;
  gap: 12px;
}

.cabecera__usuario {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
}

.cabecera__usuario-nombre {
  font-size: 0.8rem;
  font-weight: 700;
}

.cabecera__usuario-rol {
  font-size: 0.68rem;
  opacity: 0.72;
}

.cabecera__salir {
  color: rgba(255, 255, 255, 0.9);
  border-color: rgba(255, 255, 255, 0.3);
  padding: 7px 13px;
}

.cabecera__salir:hover {
  background: rgba(255, 255, 255, 0.12);
}

/* -----------------------------------------------------------
   Contenido
   ----------------------------------------------------------- */
.contenido {
  flex: 1;
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 22px 18px;
}

.contenido--plena {
  display: grid;
  place-items: center;
  max-width: none;
}

.pie {
  padding: 14px 22px 22px;
  text-align: center;
  font-size: 0.72rem;
  color: var(--pos-text-soft);
}

/* -----------------------------------------------------------
   Comprobante en pantalla
   ----------------------------------------------------------- */
.velo {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;
  background: rgba(12, 32, 51, 0.55);
  backdrop-filter: blur(2px);
}

.velo__contenido {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  max-width: 380px;
}

.velo__aviso {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  padding: 11px 14px;
  border-radius: var(--pos-radius-xs);
  background: #fff7e6;
  border: 1px solid rgba(255, 176, 32, 0.5);
  color: var(--pos-warning);
  font-size: 0.79rem;
  line-height: 1.4;
}

.velo__acciones {
  display: flex;
  justify-content: center;
  gap: 8px;
  flex-wrap: wrap;
}

.velo__acciones .btn {
  text-decoration: none;
}

.velo__acciones .btn--contorno {
  background: #fff;
}

/* -----------------------------------------------------------
   Responsive
   ----------------------------------------------------------- */
@media (max-width: 760px) {
  .cabecera {
    gap: 12px;
    padding: 12px 14px;
  }

  .cabecera__nav {
    order: 3;
    width: 100%;
    flex: none;
  }

  .cabecera__sesion {
    margin-left: auto;
  }

  .cabecera__usuario {
    display: none;
  }

  /* Solo iconos: cinco etiquetas no entran en un telefono, y partir la barra en dos
     filas empuja el contenido fuera de la pantalla. El `title` queda como ayuda. */
  .nav-link__texto,
  .cabecera__salir-texto {
    display: none;
  }

  .cabecera__nav {
    justify-content: space-between;
  }

  .nav-link {
    padding: 8px 12px;
  }

  .contenido {
    padding: 16px 12px;
  }
}
</style>
