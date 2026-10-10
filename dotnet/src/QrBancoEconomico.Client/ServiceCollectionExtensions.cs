using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;

namespace QrBancoEconomico.Client;

/// <summary>Registro del cliente en el contenedor de dependencias.</summary>
public static class ServiceCollectionExtensions
{
    /// <summary>
    /// Registra <see cref="IQrBancoEconomicoClient"/> como cliente tipado de <c>IHttpClientFactory</c>, con la
    /// configuracion de la seccion <see cref="QrBancoEconomicoOptions.SectionName"/>.
    /// </summary>
    /// <returns>El <see cref="IHttpClientBuilder"/>, para agregar handlers (resiliencia, proxy, certificados).</returns>
    public static IHttpClientBuilder AddQrBancoEconomicoClient(this IServiceCollection services,
        IConfiguration configuration)
    {
        ArgumentNullException.ThrowIfNull(configuration);
        return services.AddQrBancoEconomicoClient(o => configuration.GetSection(QrBancoEconomicoOptions.SectionName).Bind(o));
    }

    /// <inheritdoc cref="AddQrBancoEconomicoClient(IServiceCollection, IConfiguration)"/>
    public static IHttpClientBuilder AddQrBancoEconomicoClient(this IServiceCollection services,
        Action<QrBancoEconomicoOptions> configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentNullException.ThrowIfNull(configure);

        // ValidateOnStart: una API Key faltante tiene que tumbar el arranque, no aparecer como 401 en el
        // primer cobro del dia.
        services.AddOptions<QrBancoEconomicoOptions>()
            .Configure(configure)
            .Validate(o => !o.Validate().Any(), "Configuracion invalida de QrBancoEconomico (BaseUrl, ApiKey o Timeout).")
            .ValidateOnStart();

        return services.AddHttpClient<IQrBancoEconomicoClient, QrBancoEconomicoClient>((sp, http) =>
        {
            // El tope real lo pone el cliente por solicitud con QrBancoEconomicoOptions.Timeout, para poder
            // distinguir el timeout de una cancelacion de quien llama. Este es solo un techo de seguridad.
            var options = sp.GetRequiredService<IOptions<QrBancoEconomicoOptions>>().Value;
            http.Timeout = options.Timeout + TimeSpan.FromSeconds(5);
        });
    }
}
