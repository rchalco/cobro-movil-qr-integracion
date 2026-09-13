/**
 * Rutas y guards.
 *
 * Dos guards, por dos motivos distintos:
 *  - `requiereSesion`: sin sesion no se entra a ninguna pantalla operativa.
 *  - `requiereFlag`: una funcionalidad apagada tiene que salir tambien de la navegacion,
 *    no solo del menu. Si solo se ocultara el enlace, la pantalla seguiria alcanzable
 *    escribiendo la URL y llamaria al proxy de una funcionalidad dada de baja.
 */

import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'
import { useFeatureFlagsStore, type FeatureFlags } from '@/stores/featureFlags.store'

declare module 'vue-router' {
  interface RouteMeta {
    /** La ruta exige sesion abierta. */
    requiereSesion?: boolean
    /** La ruta solo existe con esta funcionalidad encendida. */
    requiereFlag?: keyof FeatureFlags
    titulo?: string
    /** Aparece en la barra de navegacion. */
    enMenu?: boolean
    /** Nombre del icono en `AppIcon`. */
    icono?: string
  }
}

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginView.vue'),
    meta: { titulo: 'Ingreso' },
  },
  {
    path: '/clientes',
    name: 'clientes',
    component: () => import('@/views/ClientesView.vue'),
    meta: {
      requiereSesion: true,
      titulo: 'Clientes',
      icono: 'clientes',
      enMenu: true,
    },
  },
  {
    path: '/cobro/:creditoId',
    name: 'cobro',
    component: () => import('@/views/CobroQrView.vue'),
    props: true,
    // Es la pantalla del QR: sin la funcionalidad encendida no debe existir.
    meta: {
      requiereSesion: true,
      requiereFlag: 'pagoQr',
      titulo: 'Cobro por QR',
      icono: 'qr',
    },
  },
  {
    path: '/pagos-qr',
    name: 'pagos-qr',
    component: () => import('@/views/PagosQrView.vue'),
    meta: {
      requiereSesion: true,
      requiereFlag: 'pagoQr',
      titulo: 'Pagos QR',
      icono: 'qr',
      enMenu: true,
    },
  },
  {
    path: '/vouchers',
    name: 'vouchers',
    component: () => import('@/views/VouchersView.vue'),
    meta: {
      requiereSesion: true,
      titulo: 'Comprobantes',
      icono: 'voucher',
      enMenu: true,
    },
  },
  {
    path: '/impresora',
    name: 'impresora',
    component: () => import('@/views/ImpresoraView.vue'),
    meta: {
      requiereSesion: true,
      titulo: 'Impresora',
      icono: 'impresora',
      enMenu: true,
    },
  },
  {
    path: '/funcionalidades',
    name: 'funcionalidades',
    component: () => import('@/views/FuncionalidadesView.vue'),
    meta: {
      requiereSesion: true,
      titulo: 'Funcionalidades',
      icono: 'funcionalidades',
      enMenu: true,
    },
  },
  { path: '/', redirect: '/clientes' },
  { path: '/:pathMatch(.*)*', redirect: '/clientes' },
]

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach((to) => {
  const auth = useAuthStore()

  if (to.meta.requiereSesion && !auth.autenticado) {
    // Se recuerda el destino para volver a el despues del ingreso: perderlo obligaria a
    // rehacer la navegacion despues de cada expiracion de sesion.
    return { name: 'login', query: { redirigir: to.fullPath } }
  }

  if (to.name === 'login' && auth.autenticado) {
    return { name: 'clientes' }
  }

  if (to.meta.requiereFlag) {
    const flags = useFeatureFlagsStore()
    flags.cargar()

    if (!flags.flags[to.meta.requiereFlag]) {
      return { name: 'clientes' }
    }
  }

  return true
})
