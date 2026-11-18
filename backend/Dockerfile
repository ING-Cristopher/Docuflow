FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src

COPY src/DocuFlow.Domain/DocuFlow.Domain.csproj src/DocuFlow.Domain/
COPY src/DocuFlow.Application/DocuFlow.Application.csproj src/DocuFlow.Application/
COPY src/DocuFlow.Infrastructure/DocuFlow.Infrastructure.csproj src/DocuFlow.Infrastructure/
COPY src/DocuFlow.API/DocuFlow.API.csproj src/DocuFlow.API/
COPY src/DocuFlow.Worker/DocuFlow.Worker.csproj src/DocuFlow.Worker/

RUN dotnet restore src/DocuFlow.API/DocuFlow.API.csproj && \
    dotnet restore src/DocuFlow.Worker/DocuFlow.Worker.csproj

COPY src/ src/

RUN dotnet publish src/DocuFlow.API/DocuFlow.API.csproj -c Release -o /app/api --no-restore && \
    dotnet publish src/DocuFlow.Worker/DocuFlow.Worker.csproj -c Release -o /app/worker --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS api
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/api .
ENV ASPNETCORE_URLS=http://+:5000
EXPOSE 5000
ENTRYPOINT ["dotnet", "DocuFlow.API.dll"]

FROM mcr.microsoft.com/dotnet/aspnet:10.0 AS worker
WORKDIR /app
COPY --from=build /app/worker .
ENTRYPOINT ["dotnet", "DocuFlow.Worker.dll"]
