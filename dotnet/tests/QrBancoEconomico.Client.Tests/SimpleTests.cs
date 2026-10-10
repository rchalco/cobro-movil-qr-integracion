using Microsoft.Extensions.Options;
using QrBancoEconomico.Client.Models;
using Xunit.Abstractions;

namespace QrBancoEconomico.Client.Tests;

/// <summary>
/// Llamadas simples al proxy real. Ajuste las constantes y ejecute cada test desde el IDE.
/// Para ver la salida por consola: <c>dotnet test --filter SimpleTests --logger "console;verbosity=detailed"</c>.
/// </summary>
public class SimpleTests(ITestOutputHelper output)
{
    // ─── Conexion ────────────────────────────────────────────────────────────
    private const string BaseUrl = "http://155.138.212.216:8043";
    private const string ApiKey = "DEEC9E06-63E0-4A4F-8694-CE7F31BF4973";              // NO haga commit con una clave real
    private const string? BanecoAccount = null;    // p. ej. "recaudos-01"

    // ─── Datos de las llamadas ───────────────────────────────────────────────
    private static readonly DateOnly PaidDate = new(2026, 10, 10);
    private const string QrIdToFind = "QR_ID_A_BUSCAR";
    private  readonly string TransactionId = new Guid().ToString("N").ToUpperInvariant();  // debe ser unico por emision
    private const double Amount = 0.01;
    private const string Currency = "BOB";
    private const string BranchCode = "0001";
    private const string Description = "Prueba simple";
    private const int DueDays = 1;

    // ─── Habilitar ───────────────────────────────────────────────────────────
    // null = corre. Se dejan deshabilitados para que la suite normal no salga a la red.
    private const string? Skip = "Llamada real: poner Skip = null para ejecutar.";
    // Emite un QR real y cobrable: se habilita aparte.
    private const string? SkipEmit = "Emite un QR real: poner SkipEmit = null para ejecutar.";

    private static QrBancoEconomicoClient Client() => new(new HttpClient(), Options.Create(new QrBancoEconomicoOptions
    {
        BaseUrl = new Uri(BaseUrl),
        ApiKey = ApiKey,
        BanecoAccount = BanecoAccount,
    }));

    [Fact]
    public async Task Health()
    {
        var healthy = await Client().IsHealthyAsync();

        output.WriteLine($"health: {healthy}");
        Assert.True(healthy);
    }

    [Fact]
    public async Task Pagados()
    {
        var payments = await Client().GetPaidQrsAsync(PaidDate);

        output.WriteLine($"pagos: {payments.Count}");
        foreach (var p in payments)
            output.WriteLine($"{p.QrId} tx={p.TransactionId} {p.Amount} {p.Currency} {p.PaymentTime}");
    }

    [Fact]
    public async Task Buscar_pagado()
    {
        var paid = await Client().FindPaidQrAsync(QrIdToFind, PaidDate);

        output.WriteLine(paid is null
            ? $"{QrIdToFind}: no pagado"
            : $"{QrIdToFind}: pagado {paid.PaymentDate} {paid.PaymentTime} {paid.Amount} {paid.Currency}");
    }

    [Fact]
    public async Task Emitir_QR()
    {
        var request = GenerateQrRequest.FixedAmount(TransactionId, (decimal)Amount,
            DateOnly.FromDateTime(DateTime.Now).AddDays(DueDays), BranchCode, Description, Currency);

        var response = await Client().GenerateQrAsync(request);

        output.WriteLine($"responseCode={response.ResponseCode} message={response.Message} qrId={response.QrId}");
        Assert.Equal(0, response.ResponseCode);
    }
}
