/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as utils from './utils';
import * as vscode from 'vscode';

import { AddAssetResult, addAssetsIfNecessary } from '../assets';
import reportDiagnostics, { Advisor } from '../features/diagnosticsProvider';
import { safeLength, sum } from '../common';

import { CSharpConfigurationProvider } from '../configurationProvider';
import CodeActionProvider from '../features/codeActionProvider';
import CodeLensProvider from '../features/codeLensProvider';
import CompletionItemProvider from '../features/completionItemProvider';
import DefinitionMetadataDocumentProvider from '../features/definitionMetadataDocumentProvider';
import DefinitionProvider from '../features/definitionProvider';
import DocumentHighlightProvider from '../features/documentHighlightProvider';
import DocumentSymbolProvider from '../features/documentSymbolProvider';
import FormatProvider from '../features/formattingEditProvider';
import HoverProvider from '../features/hoverProvider';
import ImplementationProvider from '../features/implementationProvider';
import { OmniSharpServer } from './server';
import { Options } from './options';
import ReferenceProvider from '../features/referenceProvider';
import RenameProvider from '../features/renameProvider';
import SignatureHelpProvider from '../features/signatureHelpProvider';
import TelemetryReporter from 'vscode-extension-telemetry';
import TestManager from '../features/dotnetTest';
import WorkspaceSymbolProvider from '../features/workspaceSymbolProvider';
import forwardChanges from '../features/changeForwarding';
import registerCommands from '../features/commands';
import reportStatus from '../features/status';
import { Logger } from '../logger';

export let omnisharp: OmniSharpServer;

export function activate(context: vscode.ExtensionContext, reporter: TelemetryReporter, channel: vscode.OutputChannel, logger: Logger, packageJSON: any) {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file' // only files from disk
    };

    const options = Options.Read();

    const server = new OmniSharpServer(reporter, logger, channel, packageJSON);
    omnisharp = server;
    const advisor = new Advisor(server); // create before server is started
    const disposables: vscode.Disposable[] = [];
    const localDisposables: vscode.Disposable[] = [];

    disposables.push(server.onServerStart(() => {
        // register language feature provider on start
        const definitionMetadataDocumentProvider = new DefinitionMetadataDocumentProvider();
        definitionMetadataDocumentProvider.register();
        localDisposables.push(definitionMetadataDocumentProvider);

        const definitionProvider = new DefinitionProvider(server, reporter, definitionMetadataDocumentProvider);
        localDisposables.push(vscode.languages.registerDefinitionProvider(documentSelector, definitionProvider));
        localDisposables.push(vscode.languages.registerDefinitionProvider({ scheme: definitionMetadataDocumentProvider.scheme }, definitionProvider));
        localDisposables.push(vscode.languages.registerImplementationProvider(documentSelector, new ImplementationProvider(server, reporter)));
        const testManager = new TestManager(server, reporter);
        localDisposables.push(testManager);
        localDisposables.push(vscode.languages.registerCodeLensProvider(documentSelector, new CodeLensProvider(server, reporter, testManager)));
        localDisposables.push(vscode.languages.registerDocumentHighlightProvider(documentSelector, new DocumentHighlightProvider(server, reporter)));
        localDisposables.push(vscode.languages.registerDocumentSymbolProvider(documentSelector, new DocumentSymbolProvider(server, reporter)));
        localDisposables.push(vscode.languages.registerReferenceProvider(documentSelector, new ReferenceProvider(server, reporter)));
        localDisposables.push(vscode.languages.registerHoverProvider(documentSelector, new HoverProvider(server, reporter)));
        localDisposables.push(vscode.languages.registerRenameProvider(documentSelector, new RenameProvider(server, reporter)));
        if (options.useFormatting) {
            localDisposables.push(vscode.languages.registerDocumentRangeFormattingEditProvider(documentSelector, new FormatProvider(server, reporter)));
            localDisposables.push(vscode.languages.registerOnTypeFormattingEditProvider(documentSelector, new FormatProvider(server, reporter), '}','{', ';','\n'));
        }
        localDisposables.push(vscode.languages.registerCompletionItemProvider(documentSelector, new CompletionItemProvider(server, reporter), '.', ' '));
        localDisposables.push(vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(server, reporter)));
        localDisposables.push(vscode.languages.registerSignatureHelpProvider(documentSelector, new SignatureHelpProvider(server, reporter), '(', ','));
        const codeActionProvider = new CodeActionProvider(server, reporter);
        localDisposables.push(codeActionProvider);
        localDisposables.push(vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider));
        localDisposables.push(reportDiagnostics(server, reporter, advisor));
        localDisposables.push(forwardChanges(server));
    }));

    disposables.push(server.onServerStop(() => {
        // remove language feature providers on stop
        vscode.Disposable.from(...localDisposables).dispose();
    }));

    disposables.push(registerCommands(server, reporter, channel));
    disposables.push(reportStatus(server));

    if (!context.workspaceState.get<boolean>('assetPromptDisabled')) {
        disposables.push(server.onServerStart(() => {
            // Update or add tasks.json and launch.json
            addAssetsIfNecessary(server).then(result => {
                if (result === AddAssetResult.Disable) {
                    context.workspaceState.update('assetPromptDisabled', true);
                }
            });
        }));
    }

    // After server is started (and projects are loaded), check to see if there are
    // any project.json projects if the suppress option is not set. If so, notify the user about migration.
    let csharpConfig = vscode.workspace.getConfiguration('csharp');
    if (!csharpConfig.get<boolean>('suppressProjectJsonWarning')) {
        disposables.push(server.onServerStart(() => {
            utils.requestWorkspaceInformation(server)
                .then(workspaceInfo => {
                    if (workspaceInfo.DotNet && workspaceInfo.DotNet.Projects.length > 0) {
                        const shortMessage = 'project.json is no longer a supported project format for .NET Core applications.';
                        const detailedMessage = "Warning: project.json is no longer a supported project format for .NET Core applications. Update to the latest version of .NET Core (https://aka.ms/netcoredownload) and use 'dotnet migrate' to upgrade your project (see https://aka.ms/netcoremigrate for details).";
                        const moreDetailItem: vscode.MessageItem = { title: 'More Detail' };
                        vscode.window.showWarningMessage(shortMessage, moreDetailItem)
                            .then(item => {
                                channel.appendLine(detailedMessage);
                                channel.show();
                            });
                    }
                });
        }));
    }

    // Send telemetry about the sorts of projects the server was started on.
    disposables.push(server.onServerStart(() => {
        let measures: { [key: string]: number } = {};

         utils.requestWorkspaceInformation(server)
            .then(workspaceInfo => {
                if (workspaceInfo.DotNet && workspaceInfo.DotNet.Projects.length > 0) {
                    measures['projectjson.projectcount'] = workspaceInfo.DotNet.Projects.length;
                    measures['projectjson.filecount'] = sum(workspaceInfo.DotNet.Projects, p => safeLength(p.SourceFiles));
                }

                if (workspaceInfo.MsBuild && workspaceInfo.MsBuild.Projects.length > 0) {
                    measures['msbuild.projectcount'] = workspaceInfo.MsBuild.Projects.length;
                    measures['msbuild.filecount'] = sum(workspaceInfo.MsBuild.Projects, p => safeLength(p.SourceFiles));
                    measures['msbuild.unityprojectcount'] = sum(workspaceInfo.MsBuild.Projects, p => p.IsUnityProject ? 1 : 0);
                    measures['msbuild.netcoreprojectcount'] = sum(workspaceInfo.MsBuild.Projects, p => utils.isNetCoreProject(p) ? 1 : 0);
                }

                // TODO: Add measurements for script.

                reporter.sendTelemetryEvent('OmniSharp.Start', null, measures);
            });
    }));

    // read and store last solution or folder path
    disposables.push(server.onBeforeServerStart(path => context.workspaceState.update('lastSolutionPathOrFolder', path)));

    if (options.autoStart) {
        server.autoStart(context.workspaceState.get<string>('lastSolutionPathOrFolder'));
    }

    // stop server on deactivate
    disposables.push(new vscode.Disposable(() => {
        advisor.dispose();
        server.stop();
    }));

    // Register ConfigurationProvider
    disposables.push(vscode.debug.registerDebugConfigurationProvider('coreclr', new CSharpConfigurationProvider(server)));

    context.subscriptions.push(...disposables);
    
    return new Promise<string>(resolve => server.onServerStart(e => resolve(e)));
}