using System.Text.Json;
using System.Text.Json.Nodes;
using QrBancoEconomico.Client.Models;
using QrBancoEconomico.Client.Tests.Support;

namespace QrBancoEconomico.Client.Tests;

/// <summary>
/// Los archivos de <c>Payloads/</c> son ejemplos del contrato del proxy. Estos tests garantizan que el cliente
/// produce y entiende exactamente esos JSON, de modo que sirven tambien como documentacion viva.
/// </summary>
public class PayloadContractTests
{
    private static readonly JsonSerializerOptions Json = QrBancoEconomicoClient.JsonOptions;

    [Fact]
    public void GenerateQrRequest_se_serializa_igual_al_payload_de_ejemplo()
    {
        var request = GenerateQrRequest.FixedAmount(
            transactionId: "DEMO-0001-20261010103015-1A2B3C4D",
            amount: 350.50m,
            dueDate: new DateOnly(2026, 10, 11),
            branchCode: "0001",
            description: "Cuota 4/12 credito 100200300");

        var actual = JsonNode.Parse(JsonSerializer.Serialize(request, Json));
        var expected = JsonNode.Parse(Payload.Read("generate-qr.request.json"));

        Assert.True(JsonNode.DeepEquals(expected, actual), $"Serializado: {actual}");
    }

    [Fact]
    public void GenerateQrRequest_no_envia_campos_que_el_proxy_no_conoce()
    {
        // El proxy rechaza con 400 cualquier campo desconocido (JsonUnmappedMemberHandling.Disallow).
        var request = GenerateQrRequest.FixedAmount("T-1", 10m, new DateOnly(2026, 1, 1), "0001");
        var properties = JsonNode.Parse(JsonSerializer.Serialize(request, Json))!.AsObject()
            .Select(p => p.Key).Order().ToArray();

        Assert.Equal(
            ["amount", "branchCode", "currency", "description", "dueDate", "modifyAmount", "singleUse", "transactionId"],
            properties);
    }

    [Fact]
    public void GenerateQrRequest_envia_la_fecha_como_yyyy_MM_dd()
    {
        var request = GenerateQrRequest.FixedAmount("T-1", 10m, new DateOnly(2026, 3, 7), "0001");
        var json = JsonNode.Parse(JsonSerializer.Serialize(request, Json))!;

        Assert.Equal("2026-03-07", json["dueDate"]!.GetValue<string>());
    }

    [Fact]
    public void GenerateQrResponse_exitosa_se_deserializa()
    {
        var response = JsonSerializer.Deserialize<GenerateQrResponse>(Payload.Read("generate-qr.response.ok.json"), Json)!;

        Assert.Equal(0, response.ResponseCode);
        Assert.Equal("QR0000000000DEMO0001", response.QrId);
        Assert.NotEmpty(Convert.FromBase64String(response.QrImage!));
    }

    [Fact]
    public void GenerateQrResponse_rechazada_se_deserializa_sin_qr()
    {
        var response = JsonSerializer.Deserialize<GenerateQrResponse>(
            Payload.Read("generate-qr.response.rejected.json"), Json)!;

        Assert.NotEqual(0, response.ResponseCode);
        Assert.Null(response.QrId);
        Assert.Null(response.QrImage);
    }

    [Fact]
    public void PaymentQr_se_deserializa_con_campos_completos_y_con_opcionales_nulos()
    {
        var payments = JsonSerializer.Deserialize<List<PaymentQr>>(Payload.Read("paid-qrs.response.json"), Json)!;

        Assert.Equal(2, payments.Count);

        var full = payments[0];
        Assert.Equal("QR0000000000DEMO0001", full.QrId);
        Assert.Equal(new DateOnly(2026, 10, 10), full.PaymentDate);
        Assert.Equal("10:42:07", full.PaymentTime);
        Assert.Equal(350.50m, full.Amount);
        Assert.Equal("******1234", full.SenderAccount);
        Assert.Equal("0001", full.BranchCode);

        var minimal = payments[1];
        Assert.Equal(120m, minimal.Amount);
        Assert.Null(minimal.PaymentTime);
        Assert.Null(minimal.SenderName);
        Assert.Null(minimal.BranchCode);
    }
}
