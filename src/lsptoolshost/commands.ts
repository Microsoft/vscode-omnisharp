/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { UriConverter } from './uriConverter';
import * as languageClient from 'vscode-languageclient/node';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { createLaunchTargetForSolution } from '../shared/LaunchTarget';

export function registerCommands(context: vscode.ExtensionContext, languageServer: RoslynLanguageServer) {
    // It is very important to be careful about the types used as parameters for these command callbacks.
    // If the arguments are coming from the server as json, it is NOT appropriate to use type definitions
    // from the normal vscode API (e.g. vscode.Location) as input parameters.
    //
    // This is because at runtime the json objects do not contain the expected prototypes that the vscode types
    // have and will fail 'instanceof' checks that are sprinkled throught the vscode APIs.
    //
    // Instead, we define inputs from the server using the LSP type definitions as those have no prototypes
    // so we don't accidentally pass them directly into vscode APIs.
    context.subscriptions.push(vscode.commands.registerCommand('roslyn.client.peekReferences', peekReferencesCallback));
    context.subscriptions.push(vscode.commands.registerCommand('dotnet.restartServer', async () => restartServer(languageServer)));
    context.subscriptions.push(vscode.commands.registerCommand('dotnet.openSolution', async () => openSolution(languageServer)));
}

/**
 * Callback for code lens commands.  Executes a references request via the VSCode command
 * which will call into the LSP server to get the data.  Then calls the VSCode command to display the result.
 * @param uriStr The uri containing the location to find references for.
 * @param serverPosition The position json object to execute the find references request.
 */
async function peekReferencesCallback(uriStr: string, serverPosition: languageClient.Position): Promise<void> {  
    const uri = UriConverter.deserialize(uriStr);

    // Convert the json position object into the corresponding vscode position type.
    const vscodeApiPosition = new vscode.Position(serverPosition.line, serverPosition.character);
    const references: vscode.Location[] = await vscode.commands.executeCommand('vscode.executeReferenceProvider', uri, vscodeApiPosition);
    if (references && Array.isArray(references)) {
      // The references could come back after the document has moved to a new state (that may not even contain the position).
      // This is fine - the VSCode API is resilient to that scenario and will not crash.
      vscode.commands.executeCommand('editor.action.showReferences', uri, vscodeApiPosition, references);
    }
}

async function restartServer(languageServer: RoslynLanguageServer): Promise<void> {
  await languageServer.restart();
}

async function openSolution(languageServer: RoslynLanguageServer): Promise<void> {
  if (!vscode.workspace.workspaceFolders) {
    return;
  }

  const solutionFiles = await vscode.workspace.findFiles('**/*.sln');
  const launchTargets = solutionFiles.map(createLaunchTargetForSolution);
  const launchTarget = await vscode.window.showQuickPick(launchTargets, {
    matchOnDescription: true,
    placeHolder: `Select solution file`
  });

  if (launchTarget) {
    languageServer.openSolution(vscode.Uri.file(launchTarget.target));
  }
}

