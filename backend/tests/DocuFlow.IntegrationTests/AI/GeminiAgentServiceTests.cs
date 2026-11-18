using System.Net;
using System.Text;
using System.Text.Json;
using DocuFlow.Application.Abstractions;
using DocuFlow.Domain.Common;
using DocuFlow.Domain.Tenancy;
using DocuFlow.Infrastructure.AI;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;

namespace DocuFlow.IntegrationTests.AI;

public sealed class GeminiAgentServiceTests
{
    [Fact]
    public async Task ChatAsync_SendsApiKeyInHeader_SupportsSystemInstructionAndFunctionCalling()
    {
        var capturedUris = new List<string>();
        var capturedHeaders = new List<string>();
        var capturedBodies = new List<string>();
        var callCount = 0;

        var handler = new StubHttpMessageHandler(async (req, _) =>
        {
            callCount++;
            capturedUris.Add(req.RequestUri!.ToString());
            capturedHeaders.Add(req.Headers.TryGetValues("x-goog-api-key", out var vals) ? vals.Single() : string.Empty);
            capturedBodies.Add(await req.Content!.ReadAsStringAsync());

            if (callCount == 1)
            {
                var firstPayload = """
                {
                  "candidates": [{
                    "content": {
                      "role": "model",
                      "parts": [{
                        "functionCall": {
                          "name": "get_organization_document_summary",
                          "args": { "statusFilter": "PendingReview" }
                        }
                      }]
                    }
                  }]
                }
                """;
                return new HttpResponseMessage(HttpStatusCode.OK)
                {
                    Content = new StringContent(firstPayload, Encoding.UTF8, "application/json")
                };
            }

            var secondPayload = """
            {
              "candidates": [{
                "content": {
                  "role": "model",
                  "parts": [{ "text": "Tienes 3 documentos pendientes de revisión." }]
                }
              }]
            }
            """;
            return new HttpResponseMessage(HttpStatusCode.OK)
            {
                Content = new StringContent(secondPayload, Encoding.UTF8, "application/json")
            };
        });

        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://generativelanguage.googleapis.com/v1beta/")
        };

        var options = Options.Create(new GeminiAgentOptions
        {
            ApiKey = "SECRET_TEST_KEY_DO_NOT_LEAK",
            Model = "gemini-2.5-flash"
        });

        var tool = new FakeDocumentTool();
        var service = new GeminiAgentService(
            httpClient,
            options,
            [tool],
            new FakeTenantContext(),
            NullLogger<GeminiAgentService>.Instance);

        var response = await service.ChatAsync(new AgentChatRequest
        {
            Message = "¿Cuántos documentos requieren revisión?"
        });

        Assert.Equal("Tienes 3 documentos pendientes de revisión.", response.Reply);
        Assert.Equal("gemini-2.5-flash", response.Model);
        Assert.Contains("get_organization_document_summary", response.ExecutedTools);
        Assert.Equal(2, callCount);
        Assert.All(capturedUris, uri => Assert.DoesNotContain("SECRET_TEST_KEY_DO_NOT_LEAK", uri));
        Assert.All(capturedHeaders, key => Assert.Equal("SECRET_TEST_KEY_DO_NOT_LEAK", key));
        Assert.Contains("systemInstruction", capturedBodies[0]);
        Assert.Contains("functionDeclarations", capturedBodies[0]);
        Assert.Contains("functionResponse", capturedBodies[1]);
    }

    [Fact]
    public async Task ChatAsync_WhenGeminiFails_ReturnsGenericErrorWithoutLeakingApiKey()
    {
        var handler = new StubHttpMessageHandler((_, _) =>
            Task.FromResult(new HttpResponseMessage(HttpStatusCode.InternalServerError)
            {
                Content = new StringContent("{\"error\":\"upstream failure\"}", Encoding.UTF8, "application/json")
            }));

        var httpClient = new HttpClient(handler)
        {
            BaseAddress = new Uri("https://generativelanguage.googleapis.com/v1beta/")
        };

        var options = Options.Create(new GeminiAgentOptions
        {
            ApiKey = "SECRET_TEST_KEY_DO_NOT_LEAK",
            Model = "gemini-2.5-flash"
        });

        var service = new GeminiAgentService(
            httpClient,
            options,
            [],
            new FakeTenantContext(),
            NullLogger<GeminiAgentService>.Instance);

        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            service.ChatAsync(new AgentChatRequest { Message = "Hola" }));

        Assert.Equal("Agent.Unavailable", ex.Code);
        Assert.DoesNotContain("SECRET_TEST_KEY_DO_NOT_LEAK", ex.Message);
    }

    [Fact]
    public async Task ChatAsync_WhenMessageExceedsMaxLength_ThrowsDomainException()
    {
        var httpClient = new HttpClient(new StubHttpMessageHandler((_, _) =>
            throw new InvalidOperationException("Should not be called.")));

        var service = new GeminiAgentService(
            httpClient,
            Options.Create(new GeminiAgentOptions { ApiKey = "test-key" }),
            [],
            new FakeTenantContext(),
            NullLogger<GeminiAgentService>.Instance);

        var longMessage = new string('a', AgentChatRequest.MaxMessageLength + 1);
        var ex = await Assert.ThrowsAsync<DomainException>(() =>
            service.ChatAsync(new AgentChatRequest { Message = longMessage }));

        Assert.Equal("Agent.MessageTooLong", ex.Code);
    }

    private sealed class StubHttpMessageHandler(
        Func<HttpRequestMessage, CancellationToken, Task<HttpResponseMessage>> handler) : HttpMessageHandler
    {
        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
            => handler(request, cancellationToken);
    }

    private sealed class FakeDocumentTool : IAgentTool
    {
        public string Name => "get_organization_document_summary";
        public string Description => "Summary tool";
        public object ParametersSchema => new { type = "OBJECT", properties = new { } };

        public Task<object> ExecuteAsync(JsonElement arguments, CancellationToken cancellationToken = default)
            => Task.FromResult<object>(new { pendingReviewCount = 3 });
    }

    private sealed class FakeTenantContext : ITenantContext
    {
        public Guid? OrganizationId => Guid.Parse("11111111-1111-1111-1111-111111111111");
        public Guid? UserId => Guid.Parse("22222222-2222-2222-2222-222222222222");
        public OrganizationRole? Role => OrganizationRole.Admin;
    }
}
