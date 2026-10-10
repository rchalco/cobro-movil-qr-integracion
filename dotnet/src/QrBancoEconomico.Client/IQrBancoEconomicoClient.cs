using QrBancoEconomico.Client.Models;

namespace QrBancoEconomico.Client;

/// <summary>
/// Superficie del proxy qr-banco-economico que consume la aplicacion movil de cobro por QR.
/// </summary>
/// <remarks>
/// El proxy no expone consulta de estado por QR: para saber si un QR se cobro hay que leer el reporte del dia
/// (<see cref="GetPaidQrsAsync"/>) y buscarlo por <c>qrId</c>, que es lo que hace <see cref="FindPaidQrAsync"/>.
/// </remarks>
public interface IQrBancoEconomicoClient
{
    /// <summary>
    /// <c>GET /health</c>, el unico endpoint anonimo. Sirve para afirmar «no hay conexion» con certeza sin
    /// gastar la API Key ni tocar un endpoint con efectos. Nunca lanza salvo por cancelacion de quien llama.
    /// </summary>
    Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// <c>POST api/baneco/qrs</c>. Emite un QR de cobro. Requiere el alcance <c>qr:write</c>.
    /// </summary>
    /// <remarks>
    /// <b>No es idempotente:</b> cada llamada con un <c>transactionId</c> nuevo crea un QR cobrable. No la
    /// reintente con otro <c>transactionId</c> ante un timeout, o quedaran dos QR por el mismo importe.
    /// </remarks>
    /// <exception cref="ArgumentException">La solicitud viola una regla que el proxy rechazaria con 400.</exception>
    /// <exception cref="QrProxyException">El proxy o Baneco rechazaron la emision, o no se pudo hablar con el proxy.</exception>
    Task<GenerateQrResponse> GenerateQrAsync(GenerateQrRequest request, CancellationToken cancellationToken = default);

    /// <summary>
    /// <c>GET api/baneco/qrs/paid/{yyyy-MM-dd}</c>. QR cobrados en la fecha, ya filtrados por el proxy a los
    /// emitidos por este suscriptor. Requiere el alcance <c>qr:read</c>. El banco reporta por dia, no por rango.
    /// </summary>
    /// <exception cref="QrProxyException">El proxy respondio con error o no se pudo hablar con el.</exception>
    Task<IReadOnlyList<PaymentQr>> GetPaidQrsAsync(DateOnly paymentDate, CancellationToken cancellationToken = default);

    /// <summary>
    /// Busca el cobro de un QR puntual en el reporte de la fecha. <c>null</c> significa «todavia no se pago»,
    /// no un fallo: es la respuesta normal mientras el cajero espera.
    /// </summary>
    /// <exception cref="QrProxyException">El proxy respondio con error o no se pudo hablar con el.</exception>
    Task<PaymentQr?> FindPaidQrAsync(string qrId, DateOnly paymentDate, CancellationToken cancellationToken = default);
}
