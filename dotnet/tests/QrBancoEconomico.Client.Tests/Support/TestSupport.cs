using System.Net;
using System.Text;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace QrBancoEconomico.Client.Tests.Support;

/// <summary>Lee los payloads de ejemplo de <c>Payloads/</c>.</summary>
internal static class Payload
{
    public static string Read(string name) =>
        File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Payloads", name));
}

/// <summary>
/// Handler que responde lo que el test le indique y guarda la solicitud recibida, con su cuerpo ya leido
/// (el contenido se descarta al terminar <c>SendAsync</c>).
/// </summary>
internal sealed class StubHandler(Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> respond)
    : HttpMessageHandler
{
    public List<CapturedRequest> Requests { get; } = [];

    public static StubHandler Returning(HttpStatusCode status, string? body = null,
        Action<HttpResponseMessage>? customize = null) =>
        new((_, _) =>
        {
            var response = new HttpResponseMessage(status);
            if (body is not null)
                response.Content = new StringContent(body, Encoding.UTF8, "application/json");
            customize?.Invoke(response);
            return Task.FromResult(response);
        });

    public static StubHandler Throwing(Exception exception) => new((_, _) => throw exception);

    /// <summary>No responde nunca: solo termina cuando se cancela el token.</summary>
    public static StubHandler Hanging() => new(async (_, ct) =>
    {
        await Task.Delay(Timeout.Infinite, ct);
        throw new InvalidOperationException("inalcanzable");
    });

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request,
        CancellationToken cancellationToken)
    {
        var body = request.Content is null ? null : await request.Content.ReadAsStringAsync(cancellationToken);
        Requests.Add(new CapturedRequest(request.Method, request.RequestUri!, request.Headers.ToDictionary(
            h => h.Key, h => string.Join(",", h.Value), StringComparer.OrdinalIgnoreCase),
            request.Content?.Headers.ContentType?.MediaType, body));
        return await respond(request, cancellationToken);
    }
}

internal sealed record CapturedRequest(HttpMethod Method, Uri Uri, IReadOnlyDictionary<string, string> Headers,
    string? ContentType, string? Body);

internal static class TestClient
{
    /// <summary>
    /// Direccion del proxy que consume la aplicacion movil. En estos tests no se contacta: todo pasa por
    /// <see cref="StubHandler"/>.
    /// </summary>
    public const string BaseUrl = "http://155.138.212.216:8043";

    /// <summary>Clave ficticia. Nunca use una clave real en un test.</summary>
    public const string ApiKey = "00000000-0000-0000-0000-00000000test";

    public static QrBancoEconomicoClient Create(StubHandler handler, Action<QrBancoEconomicoOptions>? configure = null)
    {
        var options = new QrBancoEconomicoOptions { BaseUrl = new Uri(BaseUrl), ApiKey = ApiKey };
        configure?.Invoke(options);
        return new QrBancoEconomicoClient(new HttpClient(handler), Options.Create(options));
    }
}

/// <summary>
/// Configuracion de los tests: <c>appsettings.json</c> y luego variables de entorno (<c>QrBancoEconomico__*</c>).
/// La API Key de respaldo es la ficticia de <see cref="TestClient.ApiKey"/>; la real nunca va en un archivo.
/// </summary>
internal static class TestConfiguration
{
    public static IConfiguration Build() => new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
            [$"{QrBancoEconomicoOptions.SectionName}:ApiKey"] = TestClient.ApiKey,
        })
        .AddJsonFile(Path.Combine(AppContext.BaseDirectory, "appsettings.json"), optional: false)
        .AddEnvironmentVariables()
        .Build();
}
