using System.Net;
using QrBancoEconomico.Client.Tests.Support;

namespace QrBancoEconomico.Client.Tests;

public class PaidQrsTests
{
    private static readonly DateOnly Day = new(2026, 10, 10);

    [Fact]
    public async Task Envia_GET_con_la_fecha_en_la_ruta_y_sin_cuerpo()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("paid-qrs.response.json"));
        var client = TestClient.Create(handler);

        var payments = await client.GetPaidQrsAsync(Day);

        var sent = Assert.Single(handler.Requests);
        Assert.Equal(HttpMethod.Get, sent.Method);
        Assert.Equal($"{TestClient.BaseUrl}/api/baneco/qrs/paid/2026-10-10", sent.Uri.ToString());
        Assert.Equal(TestClient.ApiKey, sent.Headers["X-Api-Key"]);
        Assert.Null(sent.Body);
        Assert.Equal(2, payments.Count);
    }

    [Theory]
    [InlineData("[]")]
    [InlineData("null")]
    public async Task Dia_sin_cobros_devuelve_lista_vacia(string body)
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.OK, body));

        Assert.Empty(await client.GetPaidQrsAsync(Day));
    }

    [Theory]
    [InlineData("QR0000000000DEMO0001")]
    [InlineData("  qr0000000000demo0001 ")]
    public async Task FindPaidQr_encuentra_el_cobro_sin_importar_mayusculas_ni_espacios(string qrId)
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.OK, Payload.Read("paid-qrs.response.json")));

        var payment = await client.FindPaidQrAsync(qrId, Day);

        Assert.NotNull(payment);
        Assert.Equal("DEMO-0001-20261010103015-1A2B3C4D", payment.TransactionId);
    }

    [Fact]
    public async Task FindPaidQr_devuelve_null_si_aun_no_se_pago()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.OK, Payload.Read("paid-qrs.response.json")));

        Assert.Null(await client.FindPaidQrAsync("QR-QUE-NO-EXISTE", Day));
    }

    [Fact]
    public async Task FindPaidQr_exige_qrId()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.OK, "[]"));

        await Assert.ThrowsAsync<ArgumentException>(() => client.FindPaidQrAsync(" ", Day));
    }
}
