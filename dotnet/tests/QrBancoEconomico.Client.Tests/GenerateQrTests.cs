using System.Globalization;
using System.Net;
using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using QrBancoEconomico.Client.Models;
using QrBancoEconomico.Client.Tests.Support;

namespace QrBancoEconomico.Client.Tests;

public class GenerateQrTests
{
    private static GenerateQrRequest SampleRequest() => GenerateQrRequest.FixedAmount(
        "DEMO-0001-20261010103015-1A2B3C4D", 350.50m, new DateOnly(2026, 10, 11), "0001",
        "Cuota 4/12 credito 100200300");

    [Fact]
    public async Task Envia_POST_con_API_Key_y_el_cuerpo_del_ejemplo()
    {
        // Cliente armado como en una aplicacion real: opciones desde appsettings.json, HttpClient desde
        // IHttpClientFactory. Solo se sustituye el handler primario para no salir a la red.
        var configuration = TestConfiguration.Build();
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.ok.json"));
        using var provider = new ServiceCollection()
            .AddQrBancoEconomicoClient(configuration)
            .ConfigurePrimaryHttpMessageHandler(() => handler)
            .Services.BuildServiceProvider();

        var options = provider.GetRequiredService<IOptions<QrBancoEconomicoOptions>>().Value;
        var section = configuration.GetSection(QrBancoEconomicoOptions.SectionName);
        Assert.Equal(new Uri(section["BaseUrl"]!), options.BaseUrl);
        Assert.Equal(TimeSpan.Parse(section["Timeout"]!, CultureInfo.InvariantCulture), options.Timeout);
        Assert.Equal(section["ApiKey"], options.ApiKey);

        var response = await provider.GetRequiredService<IQrBancoEconomicoClient>().GenerateQrAsync(SampleRequest());

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Post, sent.Method);
        Assert.Equal(new Uri(options.BaseUrl!, "api/baneco/qrs"), sent.Uri);
        Assert.Equal(options.ApiKey, sent.Headers["X-Api-Key"]);
        Assert.False(sent.Headers.ContainsKey("X-Baneco-Account"));
        Assert.Equal("application/json", sent.ContentType);
        Assert.True(JsonNode.DeepEquals(JsonNode.Parse(Payload.Read("generate-qr.request.json")), JsonNode.Parse(sent.Body!)));

        Assert.Equal("QR0000000000DEMO0001", response.QrId);
    }

    [Fact]
    public async Task Envia_X_Baneco_Account_cuando_esta_configurada()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.ok.json"));
        var client = TestClient.Create(handler, o => o.BanecoAccount = "recaudos-01");

        await client.GenerateQrAsync(SampleRequest());

        Assert.Equal("recaudos-01", handler.Requests[0].Headers["X-Baneco-Account"]);
    }

    [Fact]
    public async Task Respeta_el_prefijo_de_ruta_de_la_URL_base()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.ok.json"));
        var client = TestClient.Create(handler, o => o.BaseUrl = new Uri("http://proxy.local:8043/qr"));

        await client.GenerateQrAsync(SampleRequest());

        Assert.Equal("http://proxy.local:8043/qr/api/baneco/qrs", handler.Requests[0].Uri.ToString());
    }

    [Fact]
    public async Task ResponseCode_distinto_de_cero_es_rechazo_del_banco()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.rejected.json"));
        var client = TestClient.Create(handler);

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GenerateQrAsync(SampleRequest()));

        Assert.Equal(QrFailureCause.Bank, error.Cause);
        Assert.Contains("Cuenta de abono no habilitada para QR", error.Message);
    }

    [Fact]
    public async Task Respuesta_exitosa_sin_qrId_es_error_de_protocolo()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK,
            """{ "responseCode": 0, "message": "ok", "qrId": null, "qrImage": null }""");
        var client = TestClient.Create(handler);

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GenerateQrAsync(SampleRequest()));

        Assert.Equal(QrFailureCause.Protocol, error.Cause);
    }

    public static TheoryData<GenerateQrRequest, string> InvalidRequests => new()
    {
        { SampleRequest() with { TransactionId = " " }, "transactionId" },
        { SampleRequest() with { Currency = "" }, "currency" },
        { SampleRequest() with { Amount = 0m }, "mayor que 0" },
        { SampleRequest() with { Amount = -1m }, "mayor que 0" },
        { SampleRequest() with { ModifyAmount = true, Amount = 10m }, "debe ser 0" },
    };

    [Theory]
    [MemberData(nameof(InvalidRequests))]
    public async Task Rechaza_antes_de_la_red_lo_que_el_proxy_rechazaria(GenerateQrRequest request, string expected)
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.ok.json"));
        var client = TestClient.Create(handler);

        var error = await Assert.ThrowsAsync<ArgumentException>(() => client.GenerateQrAsync(request));

        Assert.Contains(expected, error.Message);
        Assert.Empty(handler.Requests);
    }

    [Fact]
    public async Task Monto_abierto_con_cero_es_valido()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("generate-qr.response.ok.json"));
        var client = TestClient.Create(handler);

        await client.GenerateQrAsync(SampleRequest() with { ModifyAmount = true, Amount = 0m });

        Assert.Single(handler.Requests);
    }
}
