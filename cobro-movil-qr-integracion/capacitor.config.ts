import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'bo.com.bancosol.cobromovilqr.demo',
  appName: 'Cobro Movil QR',
  webDir: 'dist',

  server: {
    /**
     * Esquema con el que el WebView sirve la aplicacion en Android.
     *
     * Capacitor usa `https` por defecto, de modo que la pagina queda en
     * `https://localhost`. Desde ahi, llamar a `http://155.138.212.216:8043` es
     * **contenido mixto** y el WebView lo bloquea: la solicitud no llega a salir y la
     * aplicacion solo ve «no hay conexion con el servidor».
     *
     * Con `http` el origen es `http://localhost` y la llamada al proxy deja de ser
     * contenido mixto, porque ambos extremos van en claro. Es lo que permite usar el
     * servicio sin SSL.
     *
     * Lo que se pierde al servir en `http`: el origen deja de ser un contexto seguro, asi
     * que quedan fuera `getUserMedia`, la geolocalizacion del navegador, los service
     * workers y la Web Bluetooth. Esta aplicacion no usa ninguno —el Bluetooth de la
     * impresora va por plugin nativo, no por el navegador—, pero conviene saberlo antes
     * de agregar una camara para leer QR.
     *
     * OJO al cambiar este valor: el esquema **es el origen**, y `localStorage` vive por
     * origen. Un equipo que ya tenia instalada la version en `https` pierde al actualizar
     * el registro de comprobantes, las funcionalidades, la impresora preferida y la
     * sesion. La API Key no: vive en el llavero nativo, que no depende del origen.
     */
    androidScheme: 'http',
  },

  android: {
    /**
     * Ya no hace falta para alcanzar al proxy —con el origen en `http` no hay contenido
     * mixto que permitir— y se deja a proposito en `false`: dejarlo en `true` permitiria
     * que la aplicacion cargara recursos en claro tambien desde una pagina `https`, que
     * es justamente lo que no se quiere si algun dia el proxy pasa a SSL.
     */
    allowMixedContent: false,
  },
}

export default config
