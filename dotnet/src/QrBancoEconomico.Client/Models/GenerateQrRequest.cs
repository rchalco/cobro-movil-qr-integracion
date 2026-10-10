namespace QrBancoEconomico.Client.Models;

/// <summary>
/// Cuerpo de <c>POST api/baneco/qrs</c>. Espeja <c>GenerateQrRequest</c> del proxy campo por campo.
/// </summary>
/// <remarks>
/// El proxy rechaza con 400 cualquier campo desconocido (<c>JsonUnmappedMemberHandling.Disallow</c>), asi que
/// este tipo no debe crecer con propiedades propias del cliente. En particular no lleva <c>accountCredit</c>:
/// la cuenta a acreditar es la del suscriptor y la pone el proxy.
/// </remarks>
/// <param name="TransactionId">Identificador del comercio. El proxy lo exige unico por suscriptor y por cuenta (409 si se repite).</param>
/// <param name="Currency">Moneda ISO, p. ej. <c>BOB</c>.</param>
/// <param name="Amount">Monto del cobro. Mayor a cero con <paramref name="ModifyAmount"/> en <c>false</c>; exactamente cero con <c>true</c>.</param>
/// <param name="Description">Glosa que ve el pagador.</param>
/// <param name="DueDate">Vencimiento del QR. Viaja como <c>yyyy-MM-dd</c>.</param>
/// <param name="SingleUse">QR de un solo uso. Necesario para que el <c>qrId</c> identifique un unico cobro.</param>
/// <param name="ModifyAmount">Si el pagador puede cambiar el monto.</param>
/// <param name="BranchCode">Sucursal que recauda; vuelve en el reporte de cobros.</param>
public sealed record GenerateQrRequest(
    string TransactionId,
    string Currency,
    decimal Amount,
    string? Description,
    DateOnly DueDate,
    bool SingleUse,
    bool ModifyAmount,
    string? BranchCode)
{
    /// <summary>
    /// QR de cobro de una cuota: un solo uso y monto fijo. Es la combinacion que usa la aplicacion movil y la
    /// unica con la que el cobro se puede verificar por <c>qrId</c>.
    /// </summary>
    public static GenerateQrRequest FixedAmount(
        string transactionId,
        decimal amount,
        DateOnly dueDate,
        string? branchCode,
        string? description = null,
        string currency = "BOB") =>
        new(transactionId, currency, amount, description, dueDate, SingleUse: true, ModifyAmount: false, branchCode);
}
