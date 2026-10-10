using Microsoft.Extensions.Options;
using QrBancoEconomico.Client.Models;

namespace QrBancoEconomico.Client.Tests;

/// <summary>
/// Pruebas contra el proxy real. Se omiten salvo que se habiliten por variables de entorno, para que la
/// suite normal no dependa de la red ni de una credencial:
/// <list type="bullet">
/// <item><c>QR_PROXY_INTEGRATION=1</c> habilita las de solo lectura (<c>/health</c> y reporte de pagados).</item>
/// <item><c>QR_PROXY_BASE_URL</c> (por defecto <c>http://155.138.212.216:8043</c>).</item>
/// <item><c>QR_PROXY_API_KEY</c> API Key del suscriptor. Nunca la escriba en un archivo versionado.</item>
/// <item><c>QR_PROXY_BANECO_ACCOUNT</c> opcional.</item>
/// <item><c>QR_PROXY_ALLOW_WRITE=1</c> habilita ademas la emision de un QR real.</item>
/// </list>
/// </summary>
[Trait("Category", "Integration")]
public class IntegrationTests
{
    private static QrBancoEconomicoClient CreateClient() => new(new HttpClient(), Options.Create(new QrBancoEconomicoOptions
    {
        BaseUrl = new Uri(Environment.GetEnvironmentVariable("QR_PROXY_BASE_URL") ?? "http://155.138.212.216:8043"),
        // /health no usa la clave; un marcador permite probar conectividad sin tener una.
        ApiKey = Environment.GetEnvironmentVariable("QR_PROXY_API_KEY") ?? "sin-clave",
        BanecoAccount = Environment.GetEnvironmentVariable("QR_PROXY_BANECO_ACCOUNT"),
    }));

    [IntegrationFact]
    public async Task Health_responde()
    {
        Assert.True(await CreateClient().IsHealthyAsync());
    }

    [IntegrationFact(RequiresApiKey = true)]
    public async Task Reporte_de_pagados_de_hoy_responde_una_lista()
    {
        var today = DateOnly.FromDateTime(DateTime.Now);

        var payments = await CreateClient().GetPaidQrsAsync(today);

        Assert.All(payments, p => Assert.False(string.IsNullOrWhiteSpace(p.QrId)));
    }

    /// <summary>
    /// <b>Emite un QR real y cobrable.</b> Con una clave de produccion queda registrado en Baneco. Use un monto
    /// minimo y una clave de un ambiente de pruebas.
    /// </summary>
    [IntegrationFact(RequiresApiKey = true, RequiresWrite = true)]
    public async Task Emite_un_QR_de_un_centavo()
    {
        var now = DateTime.Now;
        var request = GenerateQrRequest.FixedAmount(
            transactionId: $"IT-{now:yyyyMMddHHmmss}-{Guid.NewGuid().ToString("N")[..8].ToUpperInvariant()}",
            amount: 0.01m,
            dueDate: DateOnly.FromDateTime(now).AddDays(1),
            branchCode: "0001",
            description: "Prueba de integracion QrBancoEconomico.Client");

        var response = await CreateClient().GenerateQrAsync(request);

        Assert.Equal(0, response.ResponseCode);
        Assert.False(string.IsNullOrWhiteSpace(response.QrId));
    }
}

/// <summary><see cref="FactAttribute"/> que se omite si el entorno no habilita la prueba.</summary>
public sealed class IntegrationFactAttribute : FactAttribute
{
    public IntegrationFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("QR_PROXY_INTEGRATION") != "1")
            Skip = "Integracion deshabilitada: defina QR_PROXY_INTEGRATION=1.";
    }

    public bool RequiresApiKey
    {
        get => false;
        set
        {
            if (value && Skip is null && string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("QR_PROXY_API_KEY")))
                Skip = "Falta QR_PROXY_API_KEY.";
        }
    }

    public bool RequiresWrite
    {
        get => false;
        set
        {
            if (value && Skip is null && Environment.GetEnvironmentVariable("QR_PROXY_ALLOW_WRITE") != "1")
                Skip = "Emision real deshabilitada: defina QR_PROXY_ALLOW_WRITE=1.";
        }
    }
}
