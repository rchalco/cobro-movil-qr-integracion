using System.Net;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Options;
using QrBancoEconomico.Client.Tests.Support;

namespace QrBancoEconomico.Client.Tests;

public class HealthTests
{
    [Fact]
    public async Task Health_es_anonimo_y_no_envia_la_API_Key()
    {
        var handler = StubHandler.Returning(HttpStatusCode.OK, Payload.Read("health.ok.json"));
        var client = TestClient.Create(handler);

        Assert.True(await client.IsHealthyAsync());

        var sent = Assert.Single(handler.Requests);
        Assert.Equal($"{TestClient.BaseUrl}/health", sent.Uri.ToString());
        Assert.False(sent.Headers.ContainsKey("X-Api-Key"));
    }

    [Fact]
    public async Task Health_503_es_no_disponible()
    {
        var client = TestClient.Create(StubHandler.Returning(HttpStatusCode.ServiceUnavailable, Payload.Read("health.unavailable.json")));

        Assert.False(await client.IsHealthyAsync());
    }

    [Fact]
    public async Task Health_no_lanza_si_el_servidor_no_esta()
    {
        var client = TestClient.Create(StubHandler.Throwing(new HttpRequestException("Connection refused")));

        Assert.False(await client.IsHealthyAsync());
    }

    [Fact]
    public async Task Health_respeta_su_propio_timeout()
    {
        var client = TestClient.Create(StubHandler.Hanging(), o => o.HealthTimeout = TimeSpan.FromMilliseconds(100));

        Assert.False(await client.IsHealthyAsync());
    }
}

public class RegistrationTests
{
    [Fact]
    public void Se_registra_desde_configuracion()
    {
        var configuration = new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string, string?>
        {
            ["QrBancoEconomico:BaseUrl"] = TestClient.BaseUrl,
            ["QrBancoEconomico:ApiKey"] = TestClient.ApiKey,
            ["QrBancoEconomico:BanecoAccount"] = "recaudos-01",
            ["QrBancoEconomico:Timeout"] = "00:00:15",
        }).Build();

        using var provider = new ServiceCollection().AddQrBancoEconomicoClient(configuration).Services.BuildServiceProvider();

        Assert.IsType<QrBancoEconomicoClient>(provider.GetRequiredService<IQrBancoEconomicoClient>());
        var options = provider.GetRequiredService<IOptions<QrBancoEconomicoOptions>>().Value;
        Assert.Equal(TimeSpan.FromSeconds(15), options.Timeout);
        Assert.Equal("recaudos-01", options.BanecoAccount);
    }

    [Fact]
    public void Sin_API_Key_falla_al_resolver_y_no_en_el_primer_cobro()
    {
        using var provider = new ServiceCollection()
            .AddQrBancoEconomicoClient(o => o.BaseUrl = new Uri(TestClient.BaseUrl))
            .Services.BuildServiceProvider();

        Assert.Throws<OptionsValidationException>(() => provider.GetRequiredService<IQrBancoEconomicoClient>());
    }

    [Fact]
    public void El_constructor_directo_valida_las_opciones()
    {
        var options = Options.Create(new QrBancoEconomicoOptions { ApiKey = TestClient.ApiKey });

        var error = Assert.Throws<ArgumentException>(() => new QrBancoEconomicoClient(new HttpClient(), options));

        Assert.Contains("BaseUrl", error.Message);
    }
}
