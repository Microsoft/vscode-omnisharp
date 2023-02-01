﻿// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.
// See the LICENSE file in the project root for more information.

using Microsoft.CodeAnalysis.Host;
using Microsoft.CodeAnalysis.LanguageServer.Handler;
using Microsoft.CodeAnalysis.LanguageServer.LanguageServer;
using Microsoft.CodeAnalysis.LanguageServer.Logging;
using Microsoft.CommonLanguageServerProtocol.Framework;
using Microsoft.Extensions.Logging;
using Microsoft.VisualStudio.Composition;
using StreamJsonRpc;

namespace Microsoft.CodeAnalysis.LanguageServer;

#pragma warning disable CA1001 // The JsonRpc instance is disposed of by the AbstractLanguageServer during shutdown
internal sealed class LanguageServerHost
#pragma warning restore CA1001 // The JsonRpc instance is disposed of by the AbstractLanguageServer during shutdown
{
    /// <summary>
    /// A static reference to the server instance.
    /// Used by loggers to determine if they can send log messages via LSP
    /// or if they need to use a fallback mechanism.
    /// </summary>
    internal static LanguageServerHost? Instance { get; private set; }

    private readonly ILogger _logger;
    private readonly AbstractLanguageServer<RequestContext> _roslynLanguageServer;
    private readonly JsonRpc _jsonRpc;

    public LanguageServerHost(Stream inputStream, Stream outputStream, ExportProvider exportProvider, HostServices hostServices, ILogger logger)
    {
        var handler = new HeaderDelimitedMessageHandler(outputStream, inputStream, new JsonMessageFormatter());

        // If there is a jsonrpc disconnect or server shutdown, that is handled by the AbstractLanguageServer.  No need to do anything here.
        _jsonRpc = new JsonRpc(handler)
        {
            ExceptionStrategy = ExceptionProcessing.CommonErrorData,
        };

        var roslynLspFactory = exportProvider.GetExportedValue<ILanguageServerFactory>();
        var capabilitiesProvider = new ServerCapabilitiesProvider(exportProvider.GetExportedValue<ExperimentalCapabilitiesProvider>());

        _logger = logger;
        var lspLogger = new LspServiceLogger(_logger);
        _roslynLanguageServer = roslynLspFactory.Create(_jsonRpc, capabilitiesProvider, WellKnownLspServerKinds.CSharpVisualBasicLspServer, lspLogger, hostServices);
    }

    public async Task StartAsync()
    {
        _logger.LogInformation("Starting server...");
        _jsonRpc.StartListening();

        // Now that the server is started, update the our instance reference
        Instance = this;

        await _jsonRpc.Completion.ConfigureAwait(false);
        await _roslynLanguageServer.WaitForExitAsync().ConfigureAwait(false);
    }

    public Task NotifyAsync(string targetName, object? argument)
    {
        return _jsonRpc.NotifyAsync(targetName, argument);
    }
}
