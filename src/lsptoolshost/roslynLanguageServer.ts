/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as cp from 'child_process';
import { registerCommands } from './commands';
import { registerDebugger } from './debugger';
import { UriConverter } from './uriConverter';

import {
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
    LanguageClientOptions,
    ServerOptions,
    DidCloseTextDocumentParams,
    DidChangeTextDocumentParams,
    DocumentDiagnosticParams,
    State,
    Trace,
    RequestType,
    RequestType0,
    FormattingOptions,
    TextDocumentIdentifier,
    DocumentDiagnosticRequest,
    DocumentDiagnosticReport,
    CancellationToken,
    CodeAction,
    CodeActionParams,
    CodeActionRequest,
    CodeActionResolveRequest,
    CompletionParams,
    CompletionRequest,
    CompletionResolveRequest,
    CompletionItem,
} from 'vscode-languageclient/node';
import { PlatformInformation } from '../shared/platform';
import { readConfigurations } from './configurationMiddleware';
import OptionProvider from '../shared/observers/optionProvider';
import { DynamicFileInfoHandler } from '../razor/src/dynamicFile/dynamicFileInfoHandler';
import ShowInformationMessage from '../shared/observers/utils/showInformationMessage';
import EventEmitter = require('events');
import Disposable from '../disposable';
import * as RoslynProtocol from './roslynProtocol';
import { OpenSolutionParams } from './openSolutionParams';
import { CSharpDevKitExports } from '../csharpDevKitExports';
import { ISolutionSnapshotProvider, SolutionSnapshotId } from './services/ISolutionSnapshotProvider';
import { Options } from '../shared/options';
import { ServerStateChange } from './serverStateChange';
import TelemetryReporter from '@vscode/extension-telemetry';
import CSharpIntelliCodeExports from '../csharpIntelliCodeExports';
import { csharpDevkitExtensionId, csharpDevkitIntelliCodeExtensionId, getCSharpDevKit } from '../utils/getCSharpDevKit';
import { randomUUID } from 'crypto';
import { DotnetRuntimeExtensionResolver } from './dotnetRuntimeExtensionResolver';
import { IHostExecutableResolver } from '../shared/constants/IHostExecutableResolver';
import { RoslynLanguageClient } from './roslynLanguageClient';

let _languageServer: RoslynLanguageServer;
let _channel: vscode.OutputChannel;
let _traceChannel: vscode.OutputChannel;

export class RoslynLanguageServer {
    // These are commands that are invoked by the Razor extension, and are used to send LSP requests to the Roslyn LSP server
    public static readonly roslynDidOpenCommand: string = 'roslyn.openRazorCSharp';
    public static readonly roslynDidChangeCommand: string = 'roslyn.changeRazorCSharp';
    public static readonly roslynDidCloseCommand: string = 'roslyn.closeRazorCSharp';
    public static readonly roslynPullDiagnosticCommand: string = 'roslyn.pullDiagnosticRazorCSharp';
    public static readonly provideCodeActionsCommand: string = 'roslyn.provideCodeActions';
    public static readonly resolveCodeActionCommand: string = 'roslyn.resolveCodeAction';
    public static readonly provideCompletionsCommand: string = 'roslyn.provideCompletions';
    public static readonly resolveCompletionsCommand: string = 'roslyn.resolveCompletion';
    public static readonly razorInitializeCommand: string = 'razor.initialize';

    // These are notifications we will get from the LSP server and will forward to the Razor extension.
    private static readonly provideRazorDynamicFileInfoMethodName: string = 'razor/provideDynamicFileInfo';
    private static readonly removeRazorDynamicFileInfoMethodName: string = 'razor/removeDynamicFileInfo';

    /**
     * Event name used to fire events to the _eventBus when the server state changes.
     */
    private static readonly serverStateChangeEvent: string = 'serverStateChange';

    /**
     * The timeout for stopping the language server (in ms).
     */
    private static _stopTimeout = 10000;
    private _languageClient: RoslynLanguageClient | undefined;

    /**
     * Flag indicating if C# Devkit was installed the last time we activated.
     * Used to determine if we need to restart the server on extension changes.
     */
    private _wasActivatedWithCSharpDevkit: boolean | undefined;

    /**
     * Event emitter that fires events when state related to the server changes.
     * For example when the server starts or stops.
     *
     * Consumers can register to listen for these events if they need to.
     */
    private _eventBus = new EventEmitter();

    /**
     * The solution file previously opened; we hold onto this so we can send this back over if the server were to be relaunched for any reason, like some other configuration
     * change that required the server to restart, or some other catastrophic failure that completely took down the process. In the case that the process is crashing because
     * of trying to load this solution file, we'll rely on VS Code's support to eventually stop relaunching the LSP server entirely.
     */
    private _solutionFile: vscode.Uri | undefined;

    /**
     * The path to the server executable that is being run, or undefined if none was.
     */
    private _serverExecutablePath: string | undefined;

    constructor(
        private platformInfo: PlatformInformation,
        private hostExecutableResolver: IHostExecutableResolver,
        private optionProvider: OptionProvider,
        private context: vscode.ExtensionContext,
        private telemetryReporter: TelemetryReporter,
        private additionalExtensionPaths: string[]
    ) {}

    /**
     * Resolves server options and starts the dotnet language server process. The process is started asynchronously and this method will not wait until
     * the process is launched.
     */
    public start(): void {
        const options = this.optionProvider.GetLatestOptions();
        const logLevel = options.languageServerOptions.logLevel;
        const languageClientTraceLevel = this.GetTraceLevel(logLevel);

        const serverOptions: ServerOptions = async () => {
            return await this.startServer(logLevel);
        };

        const documentSelector = options.languageServerOptions.documentSelector;

        // Options to control the language client
        const clientOptions: LanguageClientOptions = {
            // Register the server for plain csharp documents
            documentSelector: documentSelector,
            synchronize: {
                // Notify the server about file changes to '.clientrc files contain in the workspace
                fileEvents: vscode.workspace.createFileSystemWatcher('**/*.*'),
            },
            traceOutputChannel: _traceChannel,
            outputChannel: _channel,
            uriConverters: {
                // VSCode encodes the ":" as "%3A" in file paths, for example "file:///c%3A/Users/dabarbet/source/repos/ConsoleApp8/ConsoleApp8/Program.cs".
                // System.Uri does not decode the LocalPath property correctly into a valid windows path, instead you get something like
                // "/c:/Users/dabarbet/source/repos/ConsoleApp8/ConsoleApp8/Program.cs" (note the incorrect forward slashes and prepended "/").
                // Properly decoded, it would look something like "c:\Users\dabarbet\source\repos\ConsoleApp8\ConsoleApp8\Program.cs"
                // So instead we decode the URI here before sending to the server.
                code2Protocol: UriConverter.serialize,
                protocol2Code: UriConverter.deserialize,
            },
            middleware: {
                workspace: {
                    configuration: (params) => readConfigurations(params),
                },
            },
        };

        // Create the language client and start the client.
        const client = new RoslynLanguageClient(
            'microsoft-codeanalysis-languageserver',
            'Microsoft.CodeAnalysis.LanguageServer',
            serverOptions,
            clientOptions
        );

        client.registerProposedFeatures();

        this._languageClient = client;

        // Set the language client trace level based on the log level option.
        // setTrace only works after the client is already running.
        // We don't use registerOnStateChange here because we need to access the actual _languageClient instance.
        this._languageClient.onDidChangeState(async (state) => {
            if (state.newState === State.Running) {
                await this._languageClient!.setTrace(languageClientTraceLevel);
                if (this._solutionFile) {
                    await this.sendOpenSolutionNotification();
                } else {
                    await this.openDefaultSolution();
                }
                await this.sendOrSubscribeForServiceBrokerConnection();
                this._eventBus.emit(RoslynLanguageServer.serverStateChangeEvent, ServerStateChange.Started);
            }
        });

        this._languageClient.onNotification(RoslynProtocol.ProjectInitializationCompleteNotification.type, () => {
            this._eventBus.emit(
                RoslynLanguageServer.serverStateChangeEvent,
                ServerStateChange.ProjectInitializationComplete
            );
        });

        this.registerExtensionsChanged(this._languageClient);
        this.registerTelemetryChanged(this._languageClient);

        // Start the client. This will also launch the server
        this._languageClient.start();

        // Register Razor dynamic file info handling
        this.registerDynamicFileInfo(this._languageClient);
    }

    public async stop(): Promise<void> {
        await this._languageClient?.stop(RoslynLanguageServer._stopTimeout);
        this._languageClient?.dispose(RoslynLanguageServer._stopTimeout);
        this._languageClient = undefined;
    }

    /**
     * Restarts the language server. This does not wait until the server has been restarted.
     * Note that since some options affect how the language server is initialized, we must
     * re-create the LanguageClient instance instead of just stopping/starting it.
     */
    public async restart(): Promise<void> {
        await this.stop();
        this.start();
    }

    /**
     * Allows consumers of this server to register for state change events.
     * These state change events will be registered each time the underlying _languageClient instance is created.
     */
    public registerStateChangeEvent(listener: (event: ServerStateChange) => Promise<any>): Disposable {
        this._eventBus.addListener(RoslynLanguageServer.serverStateChangeEvent, listener);
        return new Disposable(() =>
            this._eventBus.removeListener(RoslynLanguageServer.serverStateChangeEvent, listener)
        );
    }

    /**
     * Returns whether or not the underlying LSP server is running or not.
     */
    public isRunning(): boolean {
        return this._languageClient?.state === State.Running;
    }

    /**
     * Makes an LSP request to the server with a given type and parameters.
     */
    public async sendRequest<Params, Response, Error>(
        type: RequestType<Params, Response, Error>,
        params: Params,
        token: vscode.CancellationToken
    ): Promise<Response> {
        if (!this.isRunning()) {
            throw new Error('Tried to send request while server is not started.');
        }

        const response = await this._languageClient!.sendRequest(type, params, token);
        return response;
    }

    /**
     * Makes an LSP request to the server with a given type and no parameters
     */
    public async sendRequest0<Response, Error>(
        type: RequestType0<Response, Error>,
        token: vscode.CancellationToken
    ): Promise<Response> {
        if (!this.isRunning()) {
            throw new Error('Tried to send request while server is not started.');
        }

        const response = await this._languageClient!.sendRequest(type, token);
        return response;
    }

    /**
     * Sends an LSP notification to the server with a given method and parameters.
     */
    public async sendNotification<Params>(method: string, params: Params): Promise<any> {
        if (!this.isRunning()) {
            throw new Error('Tried to send request while server is not started.');
        }

        const response = await this._languageClient!.sendNotification(method, params);
        return response;
    }

    public async registerSolutionSnapshot(token: vscode.CancellationToken): Promise<SolutionSnapshotId> {
        const response = await _languageServer.sendRequest0(RoslynProtocol.RegisterSolutionSnapshotRequest.type, token);
        if (response) {
            return new SolutionSnapshotId(response.id);
        }

        throw new Error('Unable to retrieve current solution.');
    }

    public async openSolution(solutionFile: vscode.Uri): Promise<void> {
        this._solutionFile = solutionFile;
        await this.sendOpenSolutionNotification();
    }

    private async sendOpenSolutionNotification(): Promise<void> {
        if (
            this._solutionFile !== undefined &&
            this._languageClient !== undefined &&
            this._languageClient.isRunning()
        ) {
            const protocolUri = this._languageClient.clientOptions.uriConverters!.code2Protocol(this._solutionFile);
            await this._languageClient.sendNotification('solution/open', new OpenSolutionParams(protocolUri));
        }
    }

    private async openDefaultSolution(): Promise<void> {
        const options = this.optionProvider.GetLatestOptions();

        // If Dev Kit isn't installed, then we are responsible for picking the solution to open, assuming the user hasn't explicitly
        // disabled it.
        if (
            !this._wasActivatedWithCSharpDevkit &&
            options.commonOptions.defaultSolution !== 'disable' &&
            this._solutionFile === undefined
        ) {
            if (options.commonOptions.defaultSolution !== '') {
                this.openSolution(vscode.Uri.file(options.commonOptions.defaultSolution));
            } else {
                // Auto open if there is just one solution target; if there's more the one we'll just let the user pick with the picker.
                const solutionUris = await vscode.workspace.findFiles('**/*.sln', '**/node_modules/**', 2);
                if (solutionUris && solutionUris.length === 1) {
                    this.openSolution(solutionUris[0]);
                }
            }
        }
    }

    private async sendOrSubscribeForServiceBrokerConnection(): Promise<void> {
        const csharpDevKitExtension = vscode.extensions.getExtension<CSharpDevKitExports>(csharpDevkitExtensionId);
        if (csharpDevKitExtension) {
            const exports = await csharpDevKitExtension.activate();

            // If the server process has already loaded, we'll get the pipe name and send it over to our process; otherwise we'll wait until the Dev Kit server
            // is launched and then send the pipe name over. This avoids us calling getBrokeredServiceServerPipeName() which will launch the server
            // if it's not already running. The rationale here is if Dev Kit is installed, we defer to it for the project system loading; if it's not loaded,
            // then we have no projects, and so this extension won't have anything to do.
            if (exports.hasServerProcessLoaded()) {
                const pipeName = await exports.getBrokeredServiceServerPipeName();
                this._languageClient?.sendNotification('serviceBroker/connect', { pipeName: pipeName });
            } else {
                // We'll subscribe if the process later launches, and call this function again to send the pipe name.
                this.context.subscriptions.push(
                    exports.serverProcessLoaded(async () => this.sendOrSubscribeForServiceBrokerConnection())
                );
            }
        }
    }

    public getServerCapabilities(): any {
        if (!this._languageClient) {
            throw new Error('Tried to send request while server is not started.');
        }

        const capabilities: any = this._languageClient.initializeResult?.capabilities;
        return capabilities;
    }

    private async startServer(logLevel: string | undefined): Promise<cp.ChildProcess> {
        const options = this.optionProvider.GetLatestOptions();
        this._serverExecutablePath = getServerPath(options, this.platformInfo);

        const dotnetInfo = await this.hostExecutableResolver.getHostExecutableInfo(options);
        const dotnetRuntimePath = path.dirname(dotnetInfo.path);
        const dotnetExecutablePath = dotnetInfo.path;

        _channel.appendLine('Dotnet path: ' + dotnetExecutablePath);

        // Take care to always run .NET processes on the runtime that we intend.
        // The dotnet.exe we point to should not go looking for other runtimes.
        const env: NodeJS.ProcessEnv = { ...process.env };
        env.DOTNET_ROOT = dotnetRuntimePath;
        env.DOTNET_MULTILEVEL_LOOKUP = '0';
        // Save user's DOTNET_ROOT env-var value so server can recover the user setting when needed
        env.DOTNET_ROOT_USER = process.env.DOTNET_ROOT ?? 'EMPTY';

        let args: string[] = [];

        if (options.commonOptions.waitForDebugger) {
            args.push('--debug');
        }

        if (logLevel) {
            args.push('--logLevel', logLevel);
        }

        if (this.additionalExtensionPaths.length > 0) {
            args.push('--additionalExtensions', `"${this.additionalExtensionPaths.join(',')}"`);
        }

        // Get the brokered service pipe name from C# Dev Kit (if installed).
        // We explicitly call this in the LSP server start action instead of awaiting it
        // in our activation because C# Dev Kit depends on C# activation completing.
        const csharpDevkitExtension = vscode.extensions.getExtension<CSharpDevKitExports>(csharpDevkitExtensionId);
        if (csharpDevkitExtension) {
            this._wasActivatedWithCSharpDevkit = true;

            // Get the starred suggestion dll location from C# Dev Kit IntelliCode (if both C# Dev Kit and C# Dev Kit IntelliCode are installed).
            const csharpDevkitIntelliCodeExtension = vscode.extensions.getExtension<CSharpIntelliCodeExports>(
                csharpDevkitIntelliCodeExtensionId
            );
            if (csharpDevkitIntelliCodeExtension) {
                _channel.appendLine('Activating C# + C# Dev Kit + C# IntelliCode...');
                const csharpDevkitIntelliCodeArgs = await this.getCSharpDevkitIntelliCodeExportArgs(
                    csharpDevkitIntelliCodeExtension
                );
                args = args.concat(csharpDevkitIntelliCodeArgs);
            } else {
                _channel.appendLine('Activating C# + C# Dev Kit...');
            }

            const csharpDevkitArgs = await this.getCSharpDevkitExportArgs(csharpDevkitExtension, options);
            args = args.concat(csharpDevkitArgs);

            await this.setupDevKitEnvironment(env, csharpDevkitExtension);
        } else {
            // C# Dev Kit is not installed - continue C#-only activation.
            _channel.appendLine('Activating C# standalone...');
            vscode.commands.executeCommand('setContext', 'dotnet.server.activatedStandalone', true);
            this._wasActivatedWithCSharpDevkit = false;
        }

        if (logLevel && [Trace.Messages, Trace.Verbose].includes(this.GetTraceLevel(logLevel))) {
            _channel.appendLine(`Starting server at ${this._serverExecutablePath}`);
        }

        // shouldn't this arg only be set if it's running with CSDevKit?
        args.push('--telemetryLevel', this.telemetryReporter.telemetryLevel);

        let childProcess: cp.ChildProcessWithoutNullStreams;
        const cpOptions: cp.SpawnOptionsWithoutStdio = {
            detached: true,
            windowsHide: true,
            env: env,
        };

        if (this._serverExecutablePath.endsWith('.dll')) {
            // If we were given a path to a dll, launch that via dotnet.
            const argsWithPath = [this._serverExecutablePath].concat(args);
            childProcess = cp.spawn(dotnetExecutablePath, argsWithPath, cpOptions);
        } else {
            // Otherwise assume we were given a path to an executable.
            childProcess = cp.spawn(this._serverExecutablePath, args, cpOptions);
        }

        return childProcess;
    }

    private registerDynamicFileInfo(client: RoslynLanguageClient) {
        // When the Roslyn language server sends a request for Razor dynamic file info, we forward that request along to Razor via
        // a command.
        client.onRequest(RoslynLanguageServer.provideRazorDynamicFileInfoMethodName, async (request) =>
            vscode.commands.executeCommand(DynamicFileInfoHandler.provideDynamicFileInfoCommand, request)
        );
        client.onNotification(RoslynLanguageServer.removeRazorDynamicFileInfoMethodName, async (notification) =>
            vscode.commands.executeCommand(DynamicFileInfoHandler.removeDynamicFileInfoCommand, notification)
        );
    }

    private registerExtensionsChanged(languageClient: RoslynLanguageClient) {
        // subscribe to extension change events so that we can get notified if C# Dev Kit is added/removed later.
        languageClient.addDisposable(
            vscode.extensions.onDidChange(async () => {
                const csharpDevkitExtension = getCSharpDevKit();

                if (this._wasActivatedWithCSharpDevkit === undefined) {
                    // Haven't activated yet.
                    return;
                }

                const title = 'Restart Language Server';
                const command = 'dotnet.restartServer';
                if (csharpDevkitExtension && !this._wasActivatedWithCSharpDevkit) {
                    // We previously started without C# Dev Kit and its now installed.
                    // Offer a prompt to restart the server to use C# Dev Kit.
                    _channel.appendLine(`Detected new installation of ${csharpDevkitExtensionId}`);
                    const message = `Detected installation of ${csharpDevkitExtensionId}. Would you like to relaunch the language server for added features?`;
                    ShowInformationMessage(vscode, message, { title, command });
                } else {
                    // Any other change to extensions is irrelevant - an uninstall requires a reload of the window
                    // which will automatically restart this extension too.
                }
            })
        );
    }

    private registerTelemetryChanged(languageClient: RoslynLanguageClient) {
        // Subscribe to telemetry events so we can enable/disable as needed
        languageClient.addDisposable(
            vscode.env.onDidChangeTelemetryEnabled((_: boolean) => {
                const title = 'Restart Language Server';
                const command = 'dotnet.restartServer';
                const message =
                    'Detected change in telemetry settings. These will not take effect until the language server is restarted, would you like to restart?';
                ShowInformationMessage(vscode, message, { title, command });
            })
        );
    }

    private async getCSharpDevkitExportArgs(
        csharpDevkitExtension: vscode.Extension<CSharpDevKitExports>,
        options: Options
    ): Promise<string[]> {
        const exports: CSharpDevKitExports = await csharpDevkitExtension.activate();

        const extensionPaths = options.languageServerOptions.extensionsPaths || [
            this.getLanguageServicesDevKitComponentPath(exports),
        ];

        const args: string[] = [];

        args.push('--sharedDependencies');
        args.push(exports.components['@microsoft/visualstudio-server-shared']);

        for (const extensionPath of extensionPaths) {
            args.push('--extension');
            args.push(extensionPath);
        }

        args.push('--sessionId', getSessionId());
        return args;
    }

    private async getCSharpDevkitIntelliCodeExportArgs(
        csharpDevkitIntelliCodeExtension: vscode.Extension<CSharpIntelliCodeExports>
    ): Promise<string[]> {
        const exports = await csharpDevkitIntelliCodeExtension.activate();

        const starredCompletionComponentPath = exports.components['@vsintellicode/starred-suggestions-csharp'];

        const csharpIntelliCodeArgs: string[] = ['--starredCompletionComponentPath', starredCompletionComponentPath];
        return csharpIntelliCodeArgs;
    }

    private async setupDevKitEnvironment(
        env: NodeJS.ProcessEnv,
        csharpDevkitExtension: vscode.Extension<CSharpDevKitExports>
    ): Promise<void> {
        const exports: CSharpDevKitExports = await csharpDevkitExtension.activate();

        // setupTelemetryEnvironmentAsync was a later addition to devkit (not in preview 1)
        // so it may not exist in whatever version of devkit the user has installed
        if (!exports.setupTelemetryEnvironmentAsync) {
            return;
        }

        await exports.setupTelemetryEnvironmentAsync(env);
    }

    private getLanguageServicesDevKitComponentPath(csharpDevKitExports: CSharpDevKitExports): string {
        return path.join(
            csharpDevKitExports.components['@microsoft/visualstudio-languageservices-devkit'],
            'Microsoft.VisualStudio.LanguageServices.DevKit.dll'
        );
    }

    private GetTraceLevel(logLevel: string): Trace {
        switch (logLevel) {
            case 'Trace':
                return Trace.Verbose;
            case 'Debug':
                return Trace.Messages;
            case 'Information':
                return Trace.Off;
            case 'Warning':
                return Trace.Off;
            case 'Error':
                return Trace.Off;
            case 'Critical':
                return Trace.Off;
            case 'None':
                return Trace.Off;
            default:
                _channel.appendLine(
                    `Invalid log level ${logLevel}, server will not start. Please set the 'dotnet.server.trace' configuration to a valid value`
                );
                throw new Error(`Invalid log level ${logLevel}`);
        }
    }
}

/**
 * Brokered service implementation.
 */
export class SolutionSnapshotProvider implements ISolutionSnapshotProvider {
    public async registerSolutionSnapshot(token: vscode.CancellationToken): Promise<SolutionSnapshotId> {
        return _languageServer.registerSolutionSnapshot(token);
    }
}

export async function activateRoslynLanguageServer(
    context: vscode.ExtensionContext,
    platformInfo: PlatformInformation,
    optionProvider: OptionProvider,
    outputChannel: vscode.OutputChannel,
    reporter: TelemetryReporter
): Promise<RoslynLanguageServer> {
    // Create a channel for outputting general logs from the language server.
    _channel = outputChannel;
    // Create a separate channel for outputting trace logs - these are incredibly verbose and make other logs very difficult to see.
    _traceChannel = vscode.window.createOutputChannel('C# LSP Trace Logs');

    const hostExecutableResolver = new DotnetRuntimeExtensionResolver(platformInfo, getServerPath);
    const additionalExtensionPaths = scanExtensionPlugins();
    _languageServer = new RoslynLanguageServer(
        platformInfo,
        hostExecutableResolver,
        optionProvider,
        context,
        reporter,
        additionalExtensionPaths
    );

    // Register any commands that need to be handled by the extension.
    registerCommands(context, _languageServer, optionProvider, hostExecutableResolver);

    registerRazorCommands(context, _languageServer);

    // Register any needed debugger components that need to communicate with the language server.
    registerDebugger(context, _languageServer, platformInfo, optionProvider, _channel);

    const options = optionProvider.GetLatestOptions();
    let source = new vscode.CancellationTokenSource();
    vscode.workspace.onDidChangeTextDocument(async (e) => {
        if (!options.languageServerOptions.documentSelector.includes(e.document.languageId)) {
            return;
        }

        if (e.contentChanges.length > 1 || e.contentChanges.length === 0) {
            return;
        }

        const change = e.contentChanges[0];

        if (!change.range.isEmpty) {
            return;
        }

        const capabilities = await _languageServer.getServerCapabilities();

        if (capabilities._vs_onAutoInsertProvider) {
            if (!capabilities._vs_onAutoInsertProvider._vs_triggerCharacters.includes(change.text)) {
                return;
            }

            source.cancel();
            source = new vscode.CancellationTokenSource();
            await applyAutoInsertEdit(e, source.token);
        }
    });

    // Start the language server.
    _languageServer.start();

    return _languageServer;

    function scanExtensionPlugins(): string[] {
        return vscode.extensions.all.flatMap((extension) => {
            const loadPaths = extension.packageJSON.contributes?.['csharpExtensionLoadPaths'];
            if (loadPaths === undefined || loadPaths === null) {
                _traceChannel.appendLine(`Extension ${extension.id} does not contribute csharpExtensionLoadPaths`);
                return [];
            }

            if (!Array.isArray(loadPaths) || loadPaths.some((loadPath) => typeof loadPath !== 'string')) {
                _channel.appendLine(
                    `Extension ${
                        extension.id
                    } has invalid csharpExtensionLoadPaths. Expected string array, found ${typeof loadPaths}`
                );
                return [];
            }

            _traceChannel.appendLine(`Extension ${extension.id} contributes csharpExtensionLoadPaths: ${loadPaths}`);
            return loadPaths;
        });
    }
}

function getServerPath(options: Options, platformInfo: PlatformInformation) {
    const clientRoot = __dirname;

    let serverPath = options.commonOptions.serverPath;
    if (!serverPath) {
        // Option not set, use the path from the extension.
        serverPath = path.join(clientRoot, '..', '.roslyn', getServerFileName(platformInfo));
    }

    if (!fs.existsSync(serverPath)) {
        throw new Error(`Cannot find language server in path '${serverPath}'`);
    }

    return serverPath;
}

function getServerFileName(platformInfo: PlatformInformation) {
    const serverFileName = 'Microsoft.CodeAnalysis.LanguageServer';
    let extension = '';
    if (platformInfo.isWindows()) {
        extension = '.exe';
    }

    if (platformInfo.isMacOS()) {
        // MacOS executables must be signed with codesign.  Currently all Roslyn server executables are built on windows
        // and therefore dotnet publish does not automatically sign them.
        // Tracking bug - https://devdiv.visualstudio.com/DevDiv/_workitems/edit/1767519/
        extension = '.dll';
    }

    return `${serverFileName}${extension}`;
}

function registerRazorCommands(context: vscode.ExtensionContext, languageServer: RoslynLanguageServer) {
    // Razor will call into us (via command) for generated file didChange/didClose notifications. We'll then forward these
    // notifications along to Roslyn. didOpen notifications are handled separately via the vscode.openTextDocument method.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.roslynDidChangeCommand,
            async (notification: DidChangeTextDocumentParams) => {
                await languageServer.sendNotification(DidChangeTextDocumentNotification.method, notification);
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.roslynDidCloseCommand,
            async (notification: DidCloseTextDocumentParams) => {
                await languageServer.sendNotification(DidCloseTextDocumentNotification.method, notification);
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.roslynPullDiagnosticCommand,
            async (request: DocumentDiagnosticParams) => {
                const diagnosticRequestType = new RequestType<DocumentDiagnosticParams, DocumentDiagnosticReport, any>(
                    DocumentDiagnosticRequest.method
                );
                return await languageServer.sendRequest(diagnosticRequestType, request, CancellationToken.None);
            }
        )
    );

    // The VS Code API for code actions (and the vscode.CodeAction type) doesn't support everything that LSP supports,
    // namely the data property, which Razor needs to identify which code actions are on their allow list, so we need
    // to expose a command for them to directly invoke our code actions LSP endpoints, rather than use built-in commands.
    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.provideCodeActionsCommand,
            async (request: CodeActionParams) => {
                return await languageServer.sendRequest(CodeActionRequest.type, request, CancellationToken.None);
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(RoslynLanguageServer.resolveCodeActionCommand, async (request: CodeAction) => {
            return await languageServer.sendRequest(CodeActionResolveRequest.type, request, CancellationToken.None);
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.provideCompletionsCommand,
            async (request: CompletionParams) => {
                return await languageServer.sendRequest(CompletionRequest.type, request, CancellationToken.None);
            }
        )
    );
    context.subscriptions.push(
        vscode.commands.registerCommand(
            RoslynLanguageServer.resolveCompletionsCommand,
            async (request: CompletionItem) => {
                return await languageServer.sendRequest(CompletionResolveRequest.type, request, CancellationToken.None);
            }
        )
    );

    // Roslyn is responsible for producing a json file containing information for Razor, that comes from the compilation for
    // a project. We want to defer this work until necessary, so this command is called by the Razor document manager to tell
    // us when they need us to initialize the Razor things.
    context.subscriptions.push(
        vscode.commands.registerCommand(RoslynLanguageServer.razorInitializeCommand, async () => {
            await languageServer.sendNotification('razor/initialize', {});
        })
    );
}

async function applyAutoInsertEdit(e: vscode.TextDocumentChangeEvent, token: vscode.CancellationToken) {
    const change = e.contentChanges[0];

    // Need to add 1 since the server expects the position to be where the caret is after the last token has been inserted.
    const position = new vscode.Position(change.range.start.line, change.range.start.character + 1);
    const uri = UriConverter.serialize(e.document.uri);
    const textDocument = TextDocumentIdentifier.create(uri);
    const formattingOptions = getFormattingOptions();
    const request: RoslynProtocol.OnAutoInsertParams = {
        _vs_textDocument: textDocument,
        _vs_position: position,
        _vs_ch: change.text,
        _vs_options: formattingOptions,
    };
    const response = await _languageServer.sendRequest(RoslynProtocol.OnAutoInsertRequest.type, request, token);
    if (response) {
        const textEdit = response._vs_textEdit;
        const startPosition = new vscode.Position(textEdit.range.start.line, textEdit.range.start.character);
        const endPosition = new vscode.Position(textEdit.range.end.line, textEdit.range.end.character);
        const docComment = new vscode.SnippetString(textEdit.newText);
        const code: any = vscode;
        const textEdits = [new code.SnippetTextEdit(new vscode.Range(startPosition, endPosition), docComment)];
        const edit = new vscode.WorkspaceEdit();
        edit.set(e.document.uri, textEdits);

        const applied = vscode.workspace.applyEdit(edit);
        if (!applied) {
            throw new Error('Tried to insert a comment but an error occurred.');
        }
    }
}

function getFormattingOptions(): FormattingOptions {
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const tabSize = editorConfig.get<number>('tabSize') ?? 4;
    const insertSpaces = editorConfig.get<boolean>('insertSpaces') ?? true;
    return FormattingOptions.create(tabSize, insertSpaces);
}

// this method is called when your extension is deactivated
export async function deactivate() {
    if (!_languageServer) {
        return undefined;
    }
    return _languageServer.stop();
}

// VS code will have a default session id when running under tests. Since we may still
// report telemetry, we need to give a unique session id instead of the default value.
function getSessionId(): string {
    const sessionId = vscode.env.sessionId;

    // 'somevalue.sessionid' is the test session id provided by vs code
    if (sessionId.toLowerCase() === 'somevalue.sessionid') {
        return randomUUID();
    }

    return sessionId;
}
