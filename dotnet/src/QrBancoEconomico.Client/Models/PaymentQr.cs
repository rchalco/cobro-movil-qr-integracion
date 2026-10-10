namespace QrBancoEconomico.Client.Models;

/// <summary>
/// Cobro acreditado sobre un QR. Elemento de <c>GET api/baneco/qrs/paid/{fecha}</c>; espeja <c>PaymentQr</c>
/// del proxy.
/// </summary>
/// <remarks>
/// Contiene datos personales del pagador (nombre, documento, cuenta enmascarada). No debe ir a logs.
/// </remarks>
public sealed record PaymentQr(
    string QrId,
    string? TransactionId,
    DateOnly PaymentDate,
    string? PaymentTime,
    string Currency,
    decimal Amount,
    string? SenderBankCode,
    string? SenderName,
    string? SenderDocumentId,
    string? SenderAccount,
    string? Description,
    string? BranchCode);
