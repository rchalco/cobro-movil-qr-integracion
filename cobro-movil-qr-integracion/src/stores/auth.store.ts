/**
 * Sesion de la demo. **El login es mockeado**: valida contra un usuario y una clave
 * fijos y no habla con ningun servicio de autenticacion.
 *
 * Es deliberado y solo sirve para la demo: no hay hash, no hay token, no hay expiracion
 * ni bloqueo por intentos. La pantalla protegida por el guard no guarda nada sensible
 * —la cartera tambien es ficticia— asi que lo que este login protege es la navegacion,
 * no un dato. Una version real reemplaza este archivo por el proveedor de identidad de
 * la institucion y el resto de la aplicacion no cambia.
 */

import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/** Credenciales de la demo. Son publicas a proposito y no abren nada real. */
const USUARIO_DEMO = 'admin'
const CLAVE_DEMO = 'admin'

/**
 * La sesion vive en `sessionStorage` y no en `localStorage`: al cerrar la pestana se
 * pierde, que es el comportamiento que se espera de una sesion en un equipo compartido.
 */
const CLAVE_SESION = 'cobroMovilQr.sesion'

export interface Usuario {
  usuario: string
  nombre: string
  rol: string
}

export const useAuthStore = defineStore('auth', () => {
  const usuario = ref<Usuario | null>(leerSesion())
  const autenticando = ref(false)
  const error = ref('')

  const autenticado = computed(() => usuario.value !== null)

  /** Valida las credenciales de la demo. Devuelve `true` si la sesion quedo abierta. */
  async function ingresar(nombreUsuario: string, clave: string): Promise<boolean> {
    if (autenticando.value) {
      return autenticado.value
    }

    autenticando.value = true
    error.value = ''

    try {
      // Retardo breve para que la pantalla muestre su estado de carga como lo haria
      // contra un servicio real. No hay nada asincrono detras.
      await new Promise((resolve) => setTimeout(resolve, 350))

      const coincide =
        nombreUsuario.trim().toLowerCase() === USUARIO_DEMO && clave === CLAVE_DEMO

      if (!coincide) {
        error.value = 'Usuario o contrasena incorrectos.'
        return false
      }

      const sesion: Usuario = {
        usuario: USUARIO_DEMO,
        nombre: 'Administrador de demostracion',
        rol: 'Cajero',
      }

      usuario.value = sesion
      guardarSesion(sesion)
      return true
    } finally {
      autenticando.value = false
    }
  }

  function salir(): void {
    usuario.value = null
    error.value = ''
    try {
      sessionStorage.removeItem(CLAVE_SESION)
    } catch {
      // Un almacenamiento bloqueado no debe impedir cerrar sesion: el estado en memoria
      // ya quedo limpio y es el que consulta el guard.
    }
  }

  return { usuario, autenticado, autenticando, error, ingresar, salir }
})

function leerSesion(): Usuario | null {
  try {
    const crudo = sessionStorage.getItem(CLAVE_SESION)
    return crudo ? (JSON.parse(crudo) as Usuario) : null
  } catch {
    return null
  }
}

function guardarSesion(sesion: Usuario): void {
  try {
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion))
  } catch {
    // Sin persistencia la sesion sigue viva en memoria; solo se pierde al recargar.
  }
}
