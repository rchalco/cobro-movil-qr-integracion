# cobro-movil-qr-integracion

Aplicación **de demostración** del cobro por QR de Banco Económico sobre una cartera de
créditos. Reproduce el mecanismo que hoy vive en `Iza-pub` (pantalla *Venta Express*) y lo
integra **directamente contra el proxy `qr-banco-economico`**, sin BFF propio.

> Todos los datos de la demo son ficticios: el login, los clientes, los carnets y los
> créditos. No hay información de ninguna persona real en este repositorio.

## Qué incluye

| Pantalla | Ruta | Qué hace |
|---|---|---|
| Ingreso | `/login` | Login mockeado: `admin` / `admin`. |
| Cartera de clientes | `/clientes` | Lista con búsqueda por carnet; carnet, nombre completo y créditos con su estado (*Pagado* / *Pendiente de pago* / *Vencido*). Botón de pago por crédito. |
| Cobro por QR | `/cobro/:creditoId` | Emite el QR de la cuota y espera la acreditación. |
| Pagos QR | `/pagos-qr` | Cobros acreditados en una fecha. Fuente para cruzar contra el cierre del día. |
| Comprobantes | `/vouchers` | Registro de vouchers emitidos: titular y pagador, ver en pantalla y reimprimir sin límite. |
| Impresora | `/impresora` | Emparejar la térmica Bluetooth, imprimir prueba y resolver comprobantes pendientes. |
| Funcionalidades | `/funcionalidades` | Interruptor del *feature flag* `pagoQr` y estado de la integración. |

## Cómo levantarla

```bash
npm install
cp .env.example .env       # complete VITE_QR_API_KEY
npm run dev
```

`npm run build` compila; `npm run type-check` valida tipos.

## Credenciales

**Una sola API Key para todos los casos** (`VITE_QR_API_KEY` en `.env`), y el transporte
se elige solo:

| Entorno | Destino | Quién manda `X-Api-Key` |
|---|---|---|
| `npm run dev` | `/qr-proxy` → reenvío del dev-server | el navegador |
| `npm run build` / `preview` | `VITE_QR_BASE_URL` directo | el navegador |
| Capacitor nativo | `VITE_QR_BASE_URL` directo | la app, leyéndola del llavero |

El reenvío del dev-server existe por **un** motivo y no es la clave: `qr-banco-economico`
no declara CORS, y un `fetch` desde `localhost:5173` sería rechazado por el navegador. El
reenvío es servidor a servidor, donde CORS no aplica. No toca las cabeceras.

> Antes el dev-server inyectaba la clave y el build no la mandaba: dos formas de hacer lo
> mismo, y en producción las llamadas salían sin credencial. Ahora la manda siempre el
> cliente.

### Secure storage en Capacitor

En el empaquetado nativo la clave se traslada al **llavero del dispositivo** en el primer
arranque —Keystore en Android, Keychain en iOS, vía `@aparajita/capacitor-secure-storage`—
y a partir de ahí se lee de ahí (`src/services/credenciales.ts`). La pantalla de
Funcionalidades muestra de dónde salió la que se está usando.

Qué protege y qué no, porque la diferencia importa:

- **Sí** protege la clave en reposo: no queda en texto plano en `localStorage` ni en los
  respaldos de la app, y otra aplicación del equipo no puede leerla.
- **No** la hace irrecuperable: sigue compilada dentro del APK para poder sembrarla la
  primera vez, así que quien desempaquete el APK la encuentra. Eliminar eso exige que la
  clave no venga en el paquete —que la entregue un backend tras autenticar, o que la
  cargue un operador al instalar—, que es justamente lo que esta demo evita para levantar
  sin pasos previos.

El día que la clave deje de venir compilada, se borra `sembrar()` y el resto sigue igual.

### Empaquetar con Capacitor

```bash
npm run build
npx cap add android      # la primera vez
npx cap sync android     # registra los plugins nativos (llavero, impresora térmica)
npx cap open android
```

`capacitor.config.json` apunta a `webDir: "dist"`. En el emulador de Android, `localhost`
es el propio teléfono: use `VITE_QR_BASE_URL="http://10.0.2.2:5000"` para alcanzar la
máquina anfitriona.

## Diagnóstico de fallos

Las llamadas atraviesan dos saltos (navegador → dev-server → proxy), así que un mismo
código HTTP puede venir de piezas distintas y significar cosas opuestas. El cliente los
separa por el **cuerpo** de la respuesta y traduce cada uno a un mensaje accionable:

| Qué pasó | Respuesta | Causa | Mensaje al operador |
|---|---|---|---|
| Reenvío no registrado (dev) | 404 sin cuerpo | `sin-reenvio` | No hay conexión… revise `VITE_QR_BASE_URL` en `.env` |
| URL base incorrecta (build) | 404 sin cuerpo | `sin-conexion` | No hay conexión… revise `VITE_QR_BASE_URL` y recompile |
| Proxy caído / inalcanzable | 502 sin cuerpo | `sin-conexion` | No hay conexión… verifique que qr-banco-economico esté levantado |
| Red caída o CORS | `fetch` rechaza | `sin-conexion` | No hay conexión… |
| Sin respuesta a tiempo | aborta | `timeout` | No hay conexión… no respondió en *n* s |
| Falta / vence la API Key | 401 · 403 | `autenticacion` | La API Key es inválida… + detalle del proxy |
| `transactionId` repetido | 409 | `conflicto` | Conflicto… |
| Cuota por minuto excedida | 429 | `cuota` | Reintente en unos segundos |
| Baneco falló por detrás | 502 **con** cuerpo | `banco` | Baneco no respondió correctamente al proxy |

Un 502 vacío y un 502 con cuerpo son el caso que más importa distinguir: confundirlos
manda al operador a revisar el banco cuando el problema es que el servidor local no está
levantado.

Los fallos de conexión se muestran como aviso destacado con botón de reintento, y no
detienen el ciclo de verificación: si el servidor vuelve antes de que el cliente pague, el
cobro se detecta solo. `hayConexion()` comprueba `/health`, el único endpoint anónimo del
proxy, para afirmar la falta de conexión con certeza en lugar de deducirla.

## El mecanismo de cobro

Es el mismo de `Iza-pub` y se apoya en una sola propiedad del QR: **un solo uso y monto
fijo** (`singleUse: true`, `modifyAmount: false`). Por eso el cobro se verifica por
`qrId`: un pago acreditado sobre ese código pertenece a esa cuota y a ninguna otra, sin
conciliar por importe ni descartar movimientos ajenos.

```
Cartera ──[Pagar]──▶ CobroQrView ──▶ PagoQrPanel
                                        │
                                        │ 1. generaQrTransaccion(monto)
                                        ▼
                                   POST /api/baneco/qrs   ──▶ proxy ──▶ Baneco
                                        │  { qrId, qrImage }
                                        ▼
                                   [ muestra el QR ]
                                        │
                                        │ 2. cada 60 s (o "Verificar ahora")
                                        ▼
                              GET /api/baneco/qrs/paid/{fecha}
                                        │  filtra por qrId
                          ┌─────────────┴─────────────┐
                     no aparece                  aparece
                          │                           │
                  sigue esperando          3. la cuota se marca PAGADA
```

**El orden importa:** antes de la acreditación no hay pago, solo un QR emitido. La cuota
se asienta en `pagoQrConfirmado` y nunca al abrir la pantalla. Una vez acreditado, la
pantalla se queda mostrando el movimiento en lugar de volver sola: si algo fallara al
registrar, el cajero tiene que ver que la plata ya entró y no volver a cobrar. Y si
cancela, el QR **sigue siendo cobrable hasta su vencimiento**: por eso existe la pantalla
*Pagos QR*.

### Feature flag `pagoQr`

Igual que en `Iza-pub`: se persiste por equipo en `localStorage`, arranca del valor de
`VITE_FEATURE_PAGO_QR` y se cambia desde *Funcionalidades* sin reiniciar.

- **Encendido:** el botón abre la pantalla del QR y *Pagos QR* aparece en el menú.
- **Apagado:** el botón **sigue disponible** y registra la cuota al instante, como una
  caja que cobra en efectivo. Bloquearlo dejaría a la cartera sin forma de cobro, que es
  peor que cobrar por el camino simple. Las rutas `/cobro/:id` y `/pagos-qr` quedan
  cerradas por guard, no solo ocultas del menú: si solo se ocultara el enlace, la pantalla
  seguiría alcanzable escribiendo la URL.

## Diferencias con `Iza-pub` (consecuencias de no tener BFF)

En Iza, `EnginePagosQr` corre en el backend y la caja solo consume tres métodos. Aquí esa
lógica corre en el navegador, y eso cambia tres cosas que conviene tener presentes:

1. **La API Key.** El proxy exige `X-Api-Key` y un SPA no puede guardar un secreto. Esta
   demo asume esa exposición a cambio de levantar sin pasos previos: la clave va en `.env`
   (no versionado) y queda dentro del bundle. En nativo se mueve al llavero, que la
   protege en reposo pero no la saca del paquete. Ver **Credenciales**.
2. **CORS.** `qr-banco-economico` no declara CORS (no hay `AddCors`/`UseCors` en el
   repositorio). El reenvío del dev-server ocurre servidor a servidor, donde CORS no
   aplica. El modo directo solo funciona desde un origen que no lo imponga (Capacitor
   nativo) o si el proxy lo habilita explícitamente.
3. **El filtro por `qrId`.** El proxy no publica consulta de estado por QR; verificar un
   cobro puntual es filtrar el reporte del día. En Iza ese filtro queda en el backend para
   que ningún punto de venta reciba la operativa completa de la cuenta. **Aquí ocurre en
   el navegador**, que por tanto ve todos los cobros del suscriptor en la fecha.

Las tres desaparecen al poner un BFF delante: el contrato de `src/services/pagosQr.service.ts`
está pensado para moverse ahí sin tocar las pantallas.

## Impresión del comprobante

Portada de Iza (`PrinterHelper` + `ConfigPrinterPage`) con la misma plomería: impresora
preferida guardada en el equipo, conexión con reintento, tope de 10 s en cada operación
Bluetooth e **impresión pendiente** que sobrevive al fallo.

Se imprime en los dos caminos de cobro — igual que en Iza, donde toda venta registrada
emite comprobante sea cual sea la forma de pago — y hay reimpresión desde la cartera y
desde la pantalla de cobro.

**Diferencia con Iza:** allí el backend genera un PDF y el dispositivo lo rasteriza
(`pdfjs` → canvas → imagen). Aquí no hay backend, así que el ticket se compone en el
dispositivo con las primitivas de texto del plugin. Sale más nítido —la impresora usa su
fuente en lugar de una imagen a 203 ppp— y evita arrastrar `pdfjs-dist`. El pendiente
guarda **los datos** del cobro, no una imagen: ocupa cientos de bytes en vez de un PDF y
reimprime con el mismo formato que habría salido en el momento.

### Qué pasa cuando no se puede imprimir

El cobro ya ocurrió y está registrado; que el papel no salga es un problema de papel. Por
eso ninguna rama propaga el fallo al cobro — y el comprobante **se muestra en pantalla**,
para que el cliente lo vea y pueda fotografiarlo sin salir del mostrador:

```
cobro acreditado ──▶ cuota marcada PAGADA ──▶ imprimir comprobante
                                                     │
                            ┌────────────────────────┼────────────────────────┐
                       sin impresora            falla la impresión        imprime
                            │                        │                        │
                            └────────────────────────┘                        │
                                         │                                    │
                        voucher EN PANTALLA + registrado           registrado como
                             como «sin imprimir»                       impreso
                                         │
                        reimprimible desde /vouchers; el más
                        reciente sin imprimir sale solo al
                        conectar una impresora en /impresora
```

Todo comprobante queda en un **registro único** (`vouchers.store`, persistido) con su
estado `impreso`. Antes había dos registros en paralelo —un «pendiente» propio del helper
de impresora y el historial— y dos registros de lo mismo terminan discrepando: uno decía
que había algo pendiente y el otro que el cobro ya estaba impreso.

El menú marca con un contador los comprobantes sin imprimir: es el único estado que exige
volver a una pantalla ya visitada.

### Reimprimir

**A discreción del usuario: un comprobante se reimprime las veces que haga falta**, esté
ya impreso o no. El papel se atasca, sale ilegible, o el cliente pide otra copia — eso lo
decide quien atiende, no la aplicación. No hay tope ni bloqueo por haberlo impreso ya; el
contador de reimpresiones es informativo.

Reimprimir es volver a sacar **el mismo papel**: se busca el comprobante ya emitido
(`buscarPorOperacion`) y se manda tal cual, con su número y sus datos de cobro. Reconstruir
uno nuevo le daría al cliente un segundo comprobante con número distinto por un solo cobro,
y llenaría el registro con una entrada por reimpresión.

Se reimprime desde tres lugares, todos sobre el mismo comprobante: la fila de la cartera,
la pantalla de cobro recién acreditado, y la lista de Comprobantes. Lo único irreversible
es *Vaciar registro*, que pide confirmación: sin comprobante guardado no hay nada que
reimprimir.

### Ancho del papel

`VITE_PRINTER_PAPER_MM` nombra el **papel**, que es lo que uno compra: `80` para las
portátiles de recibos (el valor por defecto), `58` para las de bolsillo.

Los puntos imprimibles salen de una tabla, no de convertir milímetros: son valores fijos
de la cabeza térmica —576 puntos en 80 mm, 384 en 58 mm— y calcularlos daba 575, una
columna menos de la que la impresora admite. De ahí se derivan las columnas, con la fuente
A a 12 puntos de ancho y la B a 9:

| Papel | Imprimible | Fuente A | Fuente B |
|---|---|---|---|
| 80 mm | 72 mm (576 pt) | **48 col** | 64 col |
| 58 mm | 48 mm (384 pt) | 32 col | 42 col |

Verificado en ambos: ninguna línea desborda y el `transactionId` entra en una sola. Los
identificadores (`qrId`, `transactionId`) van en fuente B justamente para eso — partido en
dos sigue siendo legible, pero quien lo copia a mano para un reclamo se equivoca mucho más.

`limitWidth` y `dpi` se fijan aunque el ticket sea texto: el plugin los documenta como
formato de imagen y arranca en 45 mm, así que sin fijarlos el QR sale más chico de lo
necesario.

En el navegador no hay Bluetooth: el comprobante sale por el diálogo de impresión del
sistema con `@page { size: 80mm auto }` — equivalente del `abrirPDFEnWeb` de Iza. El
voucher que se muestra en pantalla lleva sus propias reglas `@media print`, de modo que
imprimir la página produce el ticket a 80 mm y no la aplicación entera.

### Quién pagó

El titular del crédito y quien paga **no tienen por qué ser la misma persona**: un
familiar, el garante o un tercero pueden pagar la cuota. El comprobante guarda del banco
`nombrePagador`, `documentoPagador` y `cuentaPagador` (enmascarada) además del titular, y
los muestra en los tres lugares: la lista de Comprobantes, el voucher en pantalla y el
papel.

`esPagoDeTercero()` compara el **conjunto de palabras** de ambos nombres, no la cadena: el
banco devuelve el titular de la cuenta pagadora en su propio orden —«QUISPE MAMANI MARIA
ELENA»— y una comparación literal marcaría como tercero a la misma persona. Es una
heurística y falla en los dos sentidos (un segundo nombre ausente la hace ver como tercero;
dos homónimos pasan por la misma persona): sirve para resaltar el caso, no para decidir
nada. Cuando da positivo, el papel lleva un `PAGO DE TERCERO` en vídeo inverso — es lo que
explica, meses después, por qué el recibo de esa cuota está a nombre de otra persona.

## Reinicio de la demostración

En **Funcionalidades → Datos de demostración**: devuelve la cartera al estado inicial con
todas las cuotas *pendientes* y sortea importes nuevos dentro de un rango configurable
(mínimo y máximo, persistidos en el equipo).

Todo pendiente, y no la mezcla con la que arranca la aplicación por primera vez: lo que se
quiere después de una demostración es poder volver a cobrar todo, no reproducir una foto.
Los **comprobantes ya emitidos no se borran** — son el registro de lo que se hizo, y
borrarlos junto con la cartera haría imposible revisar después cómo salió cada ticket.

El rango se valida en la pantalla *y* se normaliza en el store: un mínimo mayor que el
máximo se invierte (es un error de tipeo evidente y invertirlos hace lo que la persona
quería), y un valor no numérico, negativo o desmedido cae al valor por defecto.

## Estructura

```
src/
  config/env.ts              parámetros y modo de integración
  models/                    QrTransaccion / QrPagado (espejo de los DTO de Iza), cartera
  services/
    qrProxy.client.ts        HTTP contra el proxy: generar QR, listar pagados
    pagosQr.service.ts       equivalente de EnginePagosQr, con la misma semántica de estados
  stores/                    Pinia: sesión, feature flags, cartera
  router/index.ts            rutas + guards de sesión y de feature flag
  components/PagoQrPanel.vue equivalente de PagoQrComponent (ciclo de 60 s)
  helpers/printer.helper.ts  equivalente de PrinterHelper: conexión, reintentos, pendiente
  services/
    comprobante.service.ts   compone el ticket y lo imprime (o abre el diálogo del sistema)
  composables/useImpresion.ts política ante fallo: registrar + mostrar en pantalla
  components/AppIcon.vue     iconos SVG en línea del menú (heredan currentColor)
  components/VoucherComprobante.vue  el ticket en pantalla, igual al impreso
  stores/vouchers.store.ts   registro único de comprobantes y su estado `impreso`
  views/                     Login, Clientes, CobroQr, PagosQr, Vouchers, Impresora,
                             Funcionalidades
  assets/theme.css           tokens --pos-* heredados de Venta Express, paleta institucional
```

## Estados de respuesta

Se conserva la semántica de `ResponseType` de Iza porque la pantalla depende de
distinguir «todavía no pagó» de «falló»:

| Estado | Significado |
|---|---|
| `Success` (1) | La operación se completó. |
| `Error` (2) | Falló. Se muestra pero **no corta el ciclo** de verificación. |
| `NoData` (4) | El QR aún no registra el cobro. Es la respuesta **normal** mientras se espera. |
