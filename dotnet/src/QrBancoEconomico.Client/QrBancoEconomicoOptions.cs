namespace QrBancoEconomico.Client;

/// <summary>
/// Configuracion del cliente. Se enlaza desde la seccion <see cref="SectionName"/>.
/// </summary>
/// <remarks>
/// <see cref="ApiKey"/> es un secreto: debe venir de un almacen de secretos o de variables de entorno
/// (<c>QrBancoEconomico__ApiKey</c>), nunca de un <c>appsettings.json</c> versionado. El proxy emite las
/// claves por ambiente y rechaza con 401 una clave de otro ambiente.
/// </remarks>
public sealed class QrBancoEconomicoOptions
{
    /// <summary>Seccion de configuracion: <c>QrBancoEconomico</c>.</summary>
    public const string SectionName = "QrBancoEconomico";

    /// <summary>Direccion del proxy, p. ej. <c>http://155.138.212.216:8043</c>.</summary>
    public Uri? BaseUrl { get; set; }

    /// <summary>API Key del suscriptor (GUID). Viaja en <c>X-Api-Key</c>.</summary>
    public string? ApiKey { get; set; }

    /// <summary>
    /// Codigo de la cuenta de Baneco. Solo hace falta si el suscriptor tiene varias concedidas y ninguna
    /// predeterminada; sin ella el proxy responde 400. Viaja en <c>X-Baneco-Account</c>.
    /// </summary>
    public string? BanecoAccount { get; set; }

    /// <summary>Tope de espera de una llamada. Sin esto un proxy caido cuelga a quien llama.</summary>
    public TimeSpan Timeout { get; set; } = TimeSpan.FromSeconds(30);

    /// <summary>Tope de espera de <c>/health</c>. Es corto a proposito: solo responde si hay o no servidor.</summary>
    public TimeSpan HealthTimeout { get; set; } = TimeSpan.FromSeconds(5);

    internal IEnumerable<string> Validate()
    {
        if (BaseUrl is null || !BaseUrl.IsAbsoluteUri)
            yield return $"{SectionName}:BaseUrl es obligatoria y debe ser absoluta.";
        if (string.IsNullOrWhiteSpace(ApiKey))
            yield return $"{SectionName}:ApiKey es obligatoria.";
        if (Timeout <= TimeSpan.Zero)
            yield return $"{SectionName}:Timeout debe ser mayor a cero.";
        if (HealthTimeout <= TimeSpan.Zero)
            yield return $"{SectionName}:HealthTimeout debe ser mayor a cero.";
    }
}
