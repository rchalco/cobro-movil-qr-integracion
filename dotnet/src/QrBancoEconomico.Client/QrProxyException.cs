using System.Net;

namespace QrBancoEconomico.Client;

/// <summary>Causa de un fallo, ya clasificada. Espeja <c>CausaFallo</c> de la aplicacion movil.</summary>
public enum QrFailureCause
{
    /// <summary>No se alcanzo al servidor, o respondio 503. Reintentar tiene sentido.</summary>
    ConnectionFailed,
    /// <summary>El servidor no respondio dentro de <see cref="QrBancoEconomicoOptions.Timeout"/>.</summary>
    Timeout,
    /// <summary>401/403: API Key invalida, revocada, de otro ambiente, sin alcances o cuenta no concedida.</summary>
    Authentication,
    /// <summary>409: transactionId repetido, suscriptor sin cuenta de ahorro o cuenta de Baneco dada de baja.</summary>
    Conflict,
    /// <summary>429: se supero la cuota por minuto del suscriptor.</summary>
    QuotaExceeded,
    /// <summary>El proxy respondio, pero Baneco fallo o rechazo la operacion (502 o <c>responseCode</c> distinto de 0).</summary>
    Bank,
    /// <summary>400: el proxy rechazo la solicitud por invalida.</summary>
    BadRequest,
    /// <summary>La respuesta no se pudo interpretar: vacia o JSON ilegible.</summary>
    Protocol,
    /// <summary>Cualquier otro estado HTTP.</summary>
    Http,
}

/// <summary>
/// Falla esperada de la integracion. El mensaje es accionable y nunca incluye la API Key ni datos del pagador.
/// </summary>
public sealed class QrProxyException : Exception
{
    /// <summary>Crea la excepcion con la causa ya clasificada.</summary>
    public QrProxyException(string message, QrFailureCause cause, HttpStatusCode? statusCode = null,
        string? traceId = null, TimeSpan? retryAfter = null, Exception? innerException = null)
        : base(message, innerException)
    {
        Cause = cause;
        StatusCode = statusCode;
        TraceId = traceId;
        RetryAfter = retryAfter;
    }

    /// <summary>Causa clasificada del fallo.</summary>
    public QrFailureCause Cause { get; }

    /// <summary>Estado HTTP de la respuesta. <c>null</c> cuando no hubo respuesta.</summary>
    public HttpStatusCode? StatusCode { get; }

    /// <summary><c>traceId</c> del ProblemDetails del proxy. Es lo que hay que pasarle a quien opera el proxy.</summary>
    public string? TraceId { get; }

    /// <summary>Cabecera <c>Retry-After</c> del 429, si vino.</summary>
    public TimeSpan? RetryAfter { get; }

    /// <summary>No hubo conversacion con el servidor: reintentar tiene sentido y no hay nada que corregir.</summary>
    public bool IsConnectionFailure => Cause is QrFailureCause.ConnectionFailed or QrFailureCause.Timeout;
}
