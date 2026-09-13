<script setup lang="ts">
/**
 * Ingreso. El login es mockeado: valida contra `admin`/`admin` en el store y no habla
 * con ningun proveedor de identidad. Las credenciales se muestran en pantalla a
 * proposito, porque son las de la demo y no abren nada real.
 */
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'

import { useAuthStore } from '@/stores/auth.store'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const usuario = ref('')
const clave = ref('')

async function ingresar(): Promise<void> {
  if (!(await auth.ingresar(usuario.value, clave.value))) {
    clave.value = ''
    return
  }

  const destino = route.query.redirigir
  router.push(typeof destino === 'string' && destino ? destino : { name: 'clientes' })
}
</script>

<template>
  <div class="login">
    <div class="login__marca">
      <span class="login__logo" aria-hidden="true">QR</span>
      <h1 class="login__app">Cobro Movil QR</h1>
      <p class="login__sub">Cobramos por ti!</p>
    </div>

    <form class="login__form tarjeta" @submit.prevent="ingresar">
      <div class="campo">
        <label class="campo__label" for="usuario">Usuario</label>
        <input
          id="usuario"
          v-model="usuario"
          class="campo__input"
          type="text"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          :disabled="auth.autenticando"
          required
        />
      </div>

      <div class="campo">
        <label class="campo__label" for="clave">Contrasena</label>
        <input
          id="clave"
          v-model="clave"
          class="campo__input"
          type="password"
          autocomplete="current-password"
          :disabled="auth.autenticando"
          required
        />
      </div>

      <p v-if="auth.error" class="aviso aviso--error">{{ auth.error }}</p>

      <button
        type="submit"
        class="btn btn--primario btn--bloque"
        :disabled="auth.autenticando"
      >
        <span v-if="auth.autenticando" class="spinner spinner--sm"></span>
        {{ auth.autenticando ? 'Validando...' : 'Ingresar' }}
      </button>

      <p class="aviso aviso--info login__demo">
        Ambiente demo, Credenciales: <strong>admin</strong> /
        <strong>admin</strong>
      </p>
    </form>
  </div>
</template>

<style scoped>
.login {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 24px;
  width: 100%;
  max-width: 380px;
  padding: 32px 18px;
}

.login__marca {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  text-align: center;
}

.login__logo {
  display: grid;
  place-items: center;
  width: 58px;
  height: 58px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-dark) 100%);
  color: #fff;
  font-size: 1.15rem;
  font-weight: 800;
  letter-spacing: 0.5px;
  box-shadow: var(--pos-shadow-md);
}

.login__app {
  margin: 4px 0 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--pos-text-title);
}

.login__sub {
  margin: 0;
  font-size: 0.8rem;
  color: var(--pos-text-soft);
}

.login__form {
  display: flex;
  flex-direction: column;
  gap: 15px;
  width: 100%;
  padding: 24px 22px;
}

.login__demo {
  margin-top: 2px;
  font-size: 0.74rem;
}
</style>
