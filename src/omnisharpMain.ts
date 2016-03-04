/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import DefinitionProvider from './features/definitionProvider';
import CodeLensProvider from './features/codeLensProvider';
import DocumentHighlightProvider from './features/documentHighlightProvider';
import DocumentSymbolProvider from './features/documentSymbolProvider';
import CodeActionProvider from './features/codeActionProvider';
import ReferenceProvider from './features/referenceProvider';
import HoverProvider from './features/hoverProvider';
import RenameProvider from './features/renameProvider';
import FormatProvider from './features/formattingEditProvider';
import CompletionItemProvider from './features/completionItemProvider';
import WorkspaceSymbolProvider from './features/workspaceSymbolProvider';
import reportDiagnostics,{Advisor} from './features/diagnosticsProvider';
import SignatureHelpProvider from './features/signatureHelpProvider';
import registerCommands from './features/commands';
import {StdioOmnisharpServer} from './omnisharpServer';
import forwardChanges from './features/changeForwarding';
import reportStatus from './features/omnisharpStatus';
import findLaunchTargets from './launchTargetFinder';
import {installCoreClrDebug} from './coreclr-debug';
import * as vscode from 'vscode';
import {registerInstallCommand} from './omnisharpInstall';

export function activate(context: vscode.ExtensionContext): any {

	const _selector: vscode.DocumentSelector = {
		language: 'csharp',
		scheme: 'file' // only files from disk
	};

	const server = new StdioOmnisharpServer();
	const advisor = new Advisor(server); // create before server is started
	const disposables: vscode.Disposable[] = [];
	const localDisposables: vscode.Disposable[] = [];

	disposables.push(registerInstallCommand(server));

	disposables.push(server.onServerStart(() => {
		// register language feature provider on start
		localDisposables.push(vscode.languages.registerDefinitionProvider(_selector, new DefinitionProvider(server)));
		localDisposables.push(vscode.languages.registerCodeLensProvider(_selector, new CodeLensProvider(server)));
		localDisposables.push(vscode.languages.registerDocumentHighlightProvider(_selector, new DocumentHighlightProvider(server)));
		localDisposables.push(vscode.languages.registerDocumentSymbolProvider(_selector, new DocumentSymbolProvider(server)));
		localDisposables.push(vscode.languages.registerReferenceProvider(_selector, new ReferenceProvider(server)));
		localDisposables.push(vscode.languages.registerHoverProvider(_selector, new HoverProvider(server)));
		localDisposables.push(vscode.languages.registerRenameProvider(_selector, new RenameProvider(server)));
		localDisposables.push(vscode.languages.registerDocumentRangeFormattingEditProvider(_selector, new FormatProvider(server)));
		localDisposables.push(vscode.languages.registerOnTypeFormattingEditProvider(_selector, new FormatProvider(server), '}', ';'));
		localDisposables.push(vscode.languages.registerCompletionItemProvider(_selector, new CompletionItemProvider(server), '.', '<'));
		localDisposables.push(vscode.languages.registerWorkspaceSymbolProvider(new WorkspaceSymbolProvider(server)));
		localDisposables.push(vscode.languages.registerSignatureHelpProvider(_selector, new SignatureHelpProvider(server), '(', ','));
		const codeActionProvider = new CodeActionProvider(server);
		localDisposables.push(codeActionProvider);
		localDisposables.push(vscode.languages.registerCodeActionsProvider(_selector, codeActionProvider));
		localDisposables.push(reportDiagnostics(server, advisor));
		localDisposables.push(forwardChanges(server));
	}));

	disposables.push(server.onServerStop(() => {
		// remove language feature providers on stop
		vscode.Disposable.from(...localDisposables).dispose();
	}));

	disposables.push(registerCommands(server, context.extensionPath));
	disposables.push(reportStatus(server));

	// read and store last solution or folder path
	disposables.push(server.onBeforeServerStart(path => context.workspaceState.update('lastSolutionPathOrFolder', path)));
	server.autoStart(context.workspaceState.get<string>('lastSolutionPathOrFolder'));

	// stop server on deactivate
	disposables.push(new vscode.Disposable(() => {
		advisor.dispose();
		server.stop();
	}));
    
    // install coreclr-debug
    installCoreClrDebug(context);

	context.subscriptions.push(...disposables);
}

