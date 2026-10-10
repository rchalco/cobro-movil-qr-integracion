# QrBancoEconomico.Client (.NET 8)

Cliente tipado del proxy **qr-banco-economico** (`http://155.138.212.216:8043`), extraído de
`cobro-movil-qr-integracion/src/services/qrProxy.client.ts`. Cubre todos los endpoints que hoy consume la
aplicación Vue, con el mismo contrato que el proxy (`QrBancoEconomico.Application/Contracts.cs`).

| Método del cliente   | Endpoint                                   | Auth / alcance      |
|----------------------|--------------------------------------------|---------------------|
| `IsHealthyAsync`     | `GET /health`                              | anónimo             |
| `GenerateQrAsync`    | `POST /api/baneco/qrs`                     | `X-Api-Key`, `qr:write` |
| `GetPaidQrsAsync`    | `GET /api/baneco/qrs/paid/{yyyy-MM-dd}`    | `X-Api-Key`, `qr:read`  |
| `FindPaidQrAsync`    | (mismo GET, filtrado por `qrId` en cliente) | `X-Api-Key`, `qr:read`  |

`X-Baneco-Account` se envía solo si `BanecoAccount` está configurada.

## Uso

```csharp
builder.Services.AddQrBancoEconomicoClient(builder.Configuration);

// ...
var qr = await client.GenerateQrAsync(GenerateQrRequest.FixedAmount(
    transactionId: "DEMO-0001-20261010103015-1A2B3C4D",
    amount: 350.50m,
    dueDate: DateOnly.FromDateTime(DateTime.Today).AddDays(1),
    branchCode: "0001"));

var pago = await client.FindPaidQrAsync(qr.QrId!, DateOnly.FromDateTime(DateTime.Today)); // null = aún no pagó
```

```json
// appsettings.json — sin la API Key
{ "QrBancoEconomico": { "BaseUrl": "http://155.138.212.216:8043", "Timeout": "00:00:30" } }
```

La API Key va por variable de entorno (`QrBancoEconomico__ApiKey`) o un almacén de secretos. Las opciones se
validan al arrancar (`ValidateOnStart`).

## Errores

Todo fallo de la integración es `QrProxyException` con `Cause` (`ConnectionFailed`, `Timeout`,
`Authentication`, `Conflict`, `QuotaExceeded`, `Bank`, `BadRequest`, `Protocol`, `Http`), `StatusCode`,
`TraceId` del ProblemDetails del proxy y `RetryAfter` en el 429. `IsConnectionFailure` indica si reintentar
tiene sentido. Los logs registran causa, estado, ruta y traceId; nunca cuerpos ni cabeceras.

## Resiliencia

El cliente no trae reintentos: `AddQrBancoEconomicoClient` devuelve el `IHttpClientBuilder` para agregarlos.
Si lo hace, **no reintente el POST con un `transactionId` nuevo**: cada emisión crea un QR cobrable. Reintentar
con el mismo `transactionId` es seguro frente a duplicados (el proxy responde 409), pero el 409 significa que
el primer intento sí emitió y su `qrId` se perdió.

## Tests

```bash
dotnet test                       # unitarios: sin red, con los payloads de tests/.../Payloads
```

`tests/QrBancoEconomico.Client.Tests/Payloads/` contiene ejemplos de cada payload del contrato (request,
respuestas OK/rechazo, reporte de pagados y cada formato de error del proxy). Los tests verifican que el
cliente produce y entiende exactamente esos JSON.

Integración contra el proxy real (omitidos por defecto):

```bash
QR_PROXY_INTEGRATION=1 dotnet test --filter Category=Integration            # solo /health
QR_PROXY_INTEGRATION=1 QR_PROXY_API_KEY=... dotnet test --filter Category=Integration  # + reporte de pagados
QR_PROXY_ALLOW_WRITE=1 ...                                                    # + emite un QR REAL de 0.01
```

> Con una clave de `prd` la emisión crea un QR real en Baneco. Use una clave de un ambiente de pruebas.

Si solo tiene un runtime más nuevo que .NET 8, ejecute con `DOTNET_ROLL_FORWARD=Major`.
