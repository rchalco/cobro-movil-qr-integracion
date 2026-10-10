using System.Net;
using System.Net.Http.Headers;
using QrBancoEconomico.Client.Tests.Support;

namespace QrBancoEconomico.Client.Tests;

/// <summary>Clasificacion de fallos con los cuerpos de error reales del proxy (ver <c>Payloads/error.*</c>).</summary>
public class ErrorHandlingTests
{
    private static readonly DateOnly Day = new(2026, 10, 10);

    [Theory]
    [InlineData(HttpStatusCode.BadRequest, "error.400.validation.json", QrFailureCause.BadRequest, "Amount: amount debe ser mayor que 0")]
    [InlineData(HttpStatusCode.BadRequest, "error.400.ambiguous-account.json", QrFailureCause.BadRequest, "indique X-Baneco-Account")]
    [InlineData(HttpStatusCode.Unauthorized, "error.401.problem.json", QrFailureCause.Authentication, "API Key revocada.")]
    [InlineData(HttpStatusCode.Forbidden, "error.403.problem.json", QrFailureCause.Authentication, "no tiene el alcance requerido")]
    [InlineData(HttpStatusCode.Conflict, "error.409.no-savings-account.json", QrFailureCause.Conflict, "no tiene cuenta de ahorro asociada")]
    [InlineData(HttpStatusCode.Conflict, "error.409.duplicate-transaction.json", QrFailureCause.Conflict, "transactionId ya existe.")]
    [InlineData(HttpStatusCode.TooManyRequests, "error.429.problem.json", QrFailureCause.QuotaExceeded, "límite de solicitudes")]
    [InlineData(HttpStatusCode.BadGateway, "generate-qr.response.rejected.json", QrFailureCause.Bank, "Cuenta de abono no habilitada")]
    public async Task Clasifica_el_estado_y_extrae_el_detalle_accionable(HttpStatusCode status, string payload,
        QrFailureCause cause, string detail)
    {
        var client = TestClient.Create(StubHandler.Returning(status, Payload.Read(payload)));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(cause, error.Cause);
        Assert.Equal(status, error.StatusCode);
        Assert.Contains(detail, error.Message);
        Assert.False(error.IsConnectionFailure);
    }

    [Fact]
    public async Task Guarda_el_traceId_del_ProblemDetails()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.Unauthorized, Payload.Read("error.401.problem.json")));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal("0HN7DEMO0000:00000001", error.TraceId);
    }

    [Fact]
    public async Task Prefiere_detail_sobre_title()
    {
        // En los ProblemDetails del proxy el titulo es la categoria y el detalle es lo accionable.
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.Unauthorized, Payload.Read("error.401.problem.json")));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.DoesNotContain("No autenticado", error.Message);
    }

    [Fact]
    public async Task El_429_expone_Retry_After()
    {
        var handler = StubHandler.Returning(HttpStatusCode.TooManyRequests, Payload.Read("error.429.problem.json"),
            r => r.Headers.RetryAfter = new RetryConditionHeaderValue(TimeSpan.FromSeconds(17)));
        var client = TestClient.Create(handler);

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(TimeSpan.FromSeconds(17), error.RetryAfter);
    }

    [Fact]
    public async Task El_404_sin_cuerpo_es_falta_de_servidor_no_un_error_de_negocio()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.NotFound));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.ConnectionFailed, error.Cause);
        Assert.Contains("BaseUrl", error.Message);
    }

    [Fact]
    public async Task El_503_es_falta_de_conexion()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.ServiceUnavailable, Payload.Read("health.unavailable.json")));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.ConnectionFailed, error.Cause);
        Assert.True(error.IsConnectionFailure);
    }

    [Fact]
    public async Task Estado_no_previsto_cae_en_Http_con_el_texto_plano_recortado()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.InternalServerError, new string('x', 500)));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.Http, error.Cause);
        Assert.Contains("respondio 500", error.Message);
        Assert.Contains(new string('x', 300) + "...", error.Message);
        Assert.DoesNotContain(new string('x', 301), error.Message);
    }

    [Theory]
    [InlineData("")]
    [InlineData("<html>no es json</html>")]
    public async Task Respuesta_exitosa_vacia_o_ilegible_es_error_de_protocolo(string body)
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.OK, body));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.Protocol, error.Cause);
    }

    [Fact]
    public async Task Servidor_inalcanzable_es_falta_de_conexion()
    {
        var client = TestClient.Create(StubHandler.Throwing(new HttpRequestException("Connection refused")));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.ConnectionFailed, error.Cause);
        Assert.Null(error.StatusCode);
        Assert.True(error.IsConnectionFailure);
    }

    [Fact]
    public async Task Servidor_que_no_responde_es_timeout()
    {
        var client = TestClient.Create(StubHandler.Hanging(), o => o.Timeout = TimeSpan.FromMilliseconds(100));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.Equal(QrFailureCause.Timeout, error.Cause);
        Assert.True(error.IsConnectionFailure);
    }

    [Fact]
    public async Task La_cancelacion_de_quien_llama_no_se_disfraza_de_timeout()
    {
        var client = TestClient.Create(StubHandler.Hanging());
        using var cts = new CancellationTokenSource(TimeSpan.FromMilliseconds(100));

        await Assert.ThrowsAnyAsync<OperationCanceledException>(() => client.GetPaidQrsAsync(Day, cts.Token));
    }

    [Fact]
    public async Task El_mensaje_de_error_nunca_lleva_la_API_Key()
    {
        // El proxy podria devolver la cabecera recibida en un cuerpo de error; el cliente no la agrega nunca.
        var client = TestClient.Create(StubHandler.Throwing(new HttpRequestException("boom")));

        var error = await Assert.ThrowsAsync<QrProxyException>(() => client.GetPaidQrsAsync(Day));

        Assert.DoesNotContain(TestClient.ApiKey, error.Message);
        Assert.DoesNotContain(TestClient.ApiKey, error.ToString());
    }
}
