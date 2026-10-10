namespace QrBancoEconomico.Client.Models;

/// <summary>Respuesta de <c>POST api/baneco/qrs</c>. Espeja <c>GenerateQrResponse</c> del proxy.</summary>
/// <param name="ResponseCode"><c>0</c> es exito; cualquier otro valor es un rechazo de Baneco.</param>
/// <param name="Message">Mensaje del banco.</param>
/// <param name="QrId">Identificador del QR en Baneco. Es la clave para reconciliar el cobro.</param>
/// <param name="QrImage">Imagen PNG del QR en Base64, sin prefijo <c>data:</c>.</param>
public sealed record GenerateQrResponse(int ResponseCode, string Message, string? QrId, string? QrImage);
