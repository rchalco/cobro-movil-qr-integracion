using System.Globalization;
using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using QrBancoEconomico.Client.Models;

namespace QrBancoEconomico.Client;

/// <summary>
/// Implementacion HTTP de <see cref="IQrBancoEconomicoClient"/>. Equivale a <c>services/qrProxy.client.ts</c>
/// de la aplicacion movil, con la misma clasificacion de fallos.
/// </summary>
/// <remarks>
/// Registrese con <see cref="ServiceCollectionExtensions.AddQrBancoEconomicoClient(Microsoft.Extensions.DependencyInjection.IServiceCollection, Microsoft.Extensions.Configuration.IConfiguration)"/>
/// para que el <see cref="HttpClient"/> salga de <c>IHttpClientFactory</c>. Las cabeceras se ponen por
/// solicitud y no en <c>DefaultRequestHeaders</c>, para no contaminar un <see cref="HttpClient"/> compartido.
/// </remarks>
public sealed partial class QrBancoEconomicoClient : IQrBancoEconomicoClient
{
    internal const string ApiKeyHeader = "X-Api-Key";
    internal const string AccountHeader = "X-Baneco-Account";

    internal static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    private const int MaxDetailLength = 300;

    private readonly HttpClient _http;
    private readonly QrBancoEconomicoOptions _options;
    private readonly Uri _baseUrl;
    private readonly ILogger _logger;

    /// <summary>Crea el cliente. Valida las opciones y lanza <see cref="ArgumentException"/> si son invalidas.</summary>
    public QrBancoEconomicoClient(HttpClient httpClient, IOptions<QrBancoEconomicoOptions> options,
        ILogger<QrBancoEconomicoClient>? logger = null)
    {
        ArgumentNullException.ThrowIfNull(httpClient);
        ArgumentNullException.ThrowIfNull(options);

        _http = httpClient;
        _options = options.Value;
        _logger = (ILogger?)logger ?? NullLogger.Instance;

        var errors = _options.Validate().ToList();
        if (errors.Count > 0)
            throw new ArgumentException(string.Join(" ", errors), nameof(options));

        // Sin la barra final, Uri descarta el ultimo segmento de la base al combinar: un proxy publicado en
        // http://host/qr terminaria recibiendo http://host/api/... en lugar de http://host/qr/api/...
        var raw = _options.BaseUrl!.AbsoluteUri;
        _baseUrl = new Uri(raw.EndsWith('/') ? raw : raw + "/");
    }

    /// <inheritdoc />
    public async Task<bool> IsHealthyAsync(CancellationToken cancellationToken = default)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.HealthTimeout);

        try
        {
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(_baseUrl, "health"));
            using var response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);
            // Solo un 2xx confirma que del otro lado hay un servidor de cobros: el 503 del proxy significa que
            // no alcanza su base de datos, y un 404 que en esa direccion hay otra cosa.
            return response.IsSuccessStatusCode;
        }
        catch (Exception e) when (!cancellationToken.IsCancellationRequested &&
                                  e is HttpRequestException or OperationCanceledException)
        {
            return false;
        }
    }

    /// <inheritdoc />
    public async Task<GenerateQrResponse> GenerateQrAsync(GenerateQrRequest request,
        CancellationToken cancellationToken = default)
    {
        ValidateGenerateRequest(request);

        var response = await SendAsync<GenerateQrResponse>(HttpMethod.Post, "api/baneco/qrs", "generar el QR",
            request, cancellationToken).ConfigureAwait(false);

        if (response.ResponseCode != 0)
            throw Fail(new QrProxyException(
                $"Baneco rechazo la emision del QR: {Fallback(response.Message, "sin detalle")}",
                QrFailureCause.Bank, HttpStatusCode.OK), "api/baneco/qrs");

        if (string.IsNullOrWhiteSpace(response.QrId) || string.IsNullOrWhiteSpace(response.QrImage))
            throw Fail(new QrProxyException("El proxy respondio sin qrId o sin imagen del QR.",
                QrFailureCause.Protocol, HttpStatusCode.OK), "api/baneco/qrs");

        return response;
    }

    /// <inheritdoc />
    public async Task<IReadOnlyList<PaymentQr>> GetPaidQrsAsync(DateOnly paymentDate,
        CancellationToken cancellationToken = default)
    {
        var path = $"api/baneco/qrs/paid/{FormatDate(paymentDate)}";
        var payments = await SendAsync<List<PaymentQr>?>(HttpMethod.Get, path, "consultar los QR pagados",
            body: null, cancellationToken).ConfigureAwait(false);

        return payments ?? [];
    }

    /// <inheritdoc />
    public async Task<PaymentQr?> FindPaidQrAsync(string qrId, DateOnly paymentDate,
        CancellationToken cancellationToken = default)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(qrId);

        var target = qrId.Trim();
        var payments = await GetPaidQrsAsync(paymentDate, cancellationToken).ConfigureAwait(false);
        return payments.FirstOrDefault(p => string.Equals(p.QrId, target, StringComparison.OrdinalIgnoreCase));
    }

    /// <summary>
    /// <c>yyyy-MM-dd</c> en cultura invariante. Se recibe <see cref="DateOnly"/> a proposito: convertir un
    /// <see cref="DateTime"/> en UTC haria que en Bolivia (UTC-4) se pidiera el dia anterior toda la tarde.
    /// </summary>
    internal static string FormatDate(DateOnly date) => date.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture);

    /// <summary>Mismas reglas que <c>GenerateQrRequest.Validate</c> del proxy, para fallar antes de la red.</summary>
    private static void ValidateGenerateRequest(GenerateQrRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (string.IsNullOrWhiteSpace(request.TransactionId))
            throw new ArgumentException("transactionId es obligatorio.", nameof(request));
        if (string.IsNullOrWhiteSpace(request.Currency))
            throw new ArgumentException("currency es obligatoria.", nameof(request));
        if (request.ModifyAmount && request.Amount != 0m)
            throw new ArgumentException("amount debe ser 0 cuando modifyAmount es true.", nameof(request));
        if (!request.ModifyAmount && request.Amount <= 0m)
            throw new ArgumentException("amount debe ser mayor que 0 cuando modifyAmount es false.", nameof(request));
    }

    private async Task<T> SendAsync<T>(HttpMethod method, string path, string action, object? body,
        CancellationToken cancellationToken)
    {
        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        timeout.CancelAfter(_options.Timeout);

        using var request = new HttpRequestMessage(method, new Uri(_baseUrl, path));
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
        request.Headers.Add(ApiKeyHeader, _options.ApiKey);
        if (!string.IsNullOrWhiteSpace(_options.BanecoAccount))
            request.Headers.Add(AccountHeader, _options.BanecoAccount.Trim());
        if (body is not null)
            request.Content = new StringContent(JsonSerializer.Serialize(body, body.GetType(), JsonOptions),
                Encoding.UTF8, "application/json");

        HttpResponseMessage response;
        try
        {
            response = await _http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, timeout.Token)
                .ConfigureAwait(false);
        }
        catch (OperationCanceledException e) when (!cancellationToken.IsCancellationRequested)
        {
            throw Fail(new QrProxyException(
                $"No hay conexion con el servidor de cobros: no respondio en {_options.Timeout.TotalSeconds:0} s " +
                $"al {action}.", QrFailureCause.Timeout, innerException: e), path);
        }
        catch (HttpRequestException e)
        {
            throw Fail(new QrProxyException(
                $"No hay conexion con el servidor de cobros: no se pudo contactar a {_baseUrl} para {action}.",
                QrFailureCause.ConnectionFailed, innerException: e), path);
        }

        using (response)
        {
            string text;
            try
            {
                text = await response.Content.ReadAsStringAsync(timeout.Token).ConfigureAwait(false);
            }
            catch (OperationCanceledException e) when (!cancellationToken.IsCancellationRequested)
            {
                throw Fail(new QrProxyException(
                    $"El servidor de cobros dejo de responder a mitad de la respuesta al {action}.",
                    QrFailureCause.Timeout, response.StatusCode, innerException: e), path);
            }

            if (!response.IsSuccessStatusCode)
                throw Fail(DescribeError(response, text, action), path);

            if (string.IsNullOrWhiteSpace(text))
                throw Fail(new QrProxyException($"El servidor de cobros devolvio una respuesta vacia al {action}.",
                    QrFailureCause.Protocol, response.StatusCode), path);

            try
            {
                return JsonSerializer.Deserialize<T>(text, JsonOptions)!;
            }
            catch (JsonException e)
            {
                throw Fail(new QrProxyException($"El servidor de cobros devolvio una respuesta ilegible al {action}.",
                    QrFailureCause.Protocol, response.StatusCode, innerException: e), path);
            }
        }
    }

    /// <summary>
    /// Traduce el estado HTTP a una causa concreta. Sin esto un 401 por API Key vencida y un 409 por cuenta
    /// de ahorro faltante llegarian como el mismo «error de servicio» y nadie sabria a quien llamar.
    /// </summary>
    internal static QrProxyException DescribeError(HttpResponseMessage response, string body, string action)
    {
        var status = response.StatusCode;
        var (detail, traceId) = ReadProblem(body);

        // 404 sin cuerpo: nadie atendio la ruta. Las rutas del proxy son fijas, asi que en esa direccion no hay
        // un servidor de cobros o la URL base es incorrecta.
        if (status == HttpStatusCode.NotFound && string.IsNullOrWhiteSpace(body))
            return new QrProxyException(
                $"No hay conexion con el servidor de cobros: la direccion respondio 404 al {action}. " +
                $"Revise {QrBancoEconomicoOptions.SectionName}:BaseUrl.",
                QrFailureCause.ConnectionFailed, status, traceId);

        if (status == HttpStatusCode.ServiceUnavailable)
            return new QrProxyException("No hay conexion con el servidor de cobros: no esta disponible en este momento.",
                QrFailureCause.ConnectionFailed, status, traceId);

        var (cause, reason) = status switch
        {
            HttpStatusCode.BadRequest => (QrFailureCause.BadRequest,
                "el proxy rechazo la solicitud (campo invalido, o falta X-Baneco-Account con varias cuentas concedidas)"),
            HttpStatusCode.Unauthorized => (QrFailureCause.Authentication,
                "la API Key es invalida, fue revocada o corresponde a otro ambiente"),
            HttpStatusCode.Forbidden => (QrFailureCause.Authentication,
                "la API Key no tiene los alcances 'qr:write'/'qr:read' o la cuenta no le fue concedida"),
            HttpStatusCode.Conflict => (QrFailureCause.Conflict,
                "el proxy rechazo la operacion por conflicto (transactionId repetido o suscriptor sin cuenta de ahorro cargada)"),
            HttpStatusCode.TooManyRequests => (QrFailureCause.QuotaExceeded,
                "se supero la cuota por minuto del suscriptor; reintente en unos segundos"),
            HttpStatusCode.BadGateway => (QrFailureCause.Bank, "Baneco no respondio correctamente al proxy"),
            _ => (QrFailureCause.Http, $"el servidor de cobros respondio {(int)status}"),
        };

        var message = string.IsNullOrEmpty(detail)
            ? $"No se pudo {action}: {reason}."
            : $"No se pudo {action}: {reason}. Detalle: {detail}";

        return new QrProxyException(message, cause, status, traceId, response.Headers.RetryAfter?.Delta);
    }

    /// <summary>
    /// Extrae el mensaje accionable de los cuatro formatos de error del proxy: <c>ApiResult</c>
    /// (<c>message</c>), ProblemDetails (<c>detail</c> antes que <c>title</c>, que es solo la categoria),
    /// ValidationProblemDetails (<c>errors</c>) y un string JSON suelto (<c>Conflict("...")</c>).
    /// </summary>
    internal static (string Detail, string? TraceId) ReadProblem(string body)
    {
        if (string.IsNullOrWhiteSpace(body))
            return (string.Empty, null);

        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;

            if (root.ValueKind == JsonValueKind.String)
                return (Truncate(root.GetString() ?? string.Empty), null);

            if (root.ValueKind == JsonValueKind.Object)
            {
                var traceId = GetString(root, "traceId");
                var detail = GetString(root, "message") ?? GetString(root, "detail") ?? GetString(root, "title");

                if (root.TryGetProperty("errors", out var errors) && errors.ValueKind == JsonValueKind.Object)
                {
                    var fields = errors.EnumerateObject()
                        .Select(f => $"{f.Name}: {string.Join(" ", f.Value.EnumerateArray().Select(m => m.GetString()))}");
                    detail = $"{detail} {string.Join("; ", fields)}".Trim();
                }

                if (!string.IsNullOrWhiteSpace(detail))
                    return (Truncate(detail), traceId);
            }
        }
        catch (JsonException)
        {
            // Texto plano: se usa el crudo.
        }

        return (Truncate(body.Trim()), null);
    }

    private static string? GetString(JsonElement element, string name) =>
        element.TryGetProperty(name, out var value) && value.ValueKind == JsonValueKind.String
            ? value.GetString()
            : null;

    private static string Truncate(string text) =>
        text.Length > MaxDetailLength ? string.Concat(text.AsSpan(0, MaxDetailLength), "...") : text;

    private static string Fallback(string? value, string fallback) =>
        string.IsNullOrWhiteSpace(value) ? fallback : value;

    /// <summary>
    /// Deja constancia del fallo para trazabilidad. Solo causa, estado, ruta y traceId: nunca el cuerpo, que
    /// puede traer datos del pagador, ni las cabeceras, que traen la API Key.
    /// </summary>
    private QrProxyException Fail(QrProxyException exception, string path)
    {
        LogFailure(_logger, exception.Cause, (int?)exception.StatusCode, path, exception.TraceId, exception);
        return exception;
    }

    [LoggerMessage(EventId = 1, Level = LogLevel.Warning,
        Message = "Fallo en el proxy qr-banco-economico: causa {Cause}, estado {StatusCode}, ruta {Path}, traceId {TraceId}")]
    private static partial void LogFailure(ILogger logger, QrFailureCause cause, int? statusCode, string path,
        string? traceId, Exception exception);
}
