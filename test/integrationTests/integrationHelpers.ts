/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as path from 'path';
import { CSharpExtensionExports } from '../../src/csharpExtensionExports';
import { existsSync } from 'fs';
import testAssetWorkspace from './testAssets/testAssetWorkspace';
import { WaitForAsyncOperationsRequest } from './testHooks';

export async function activateCSharpExtension(): Promise<void> {
    // Ensure the dependent extension exists - when launching via F5 launch.json we can't install the extension prior to opening vscode.
    const vscodeDotnetRuntimeExtensionId = 'ms-dotnettools.vscode-dotnet-runtime';
    const dotnetRuntimeExtension =
        vscode.extensions.getExtension<CSharpExtensionExports>(vscodeDotnetRuntimeExtensionId);
    if (!dotnetRuntimeExtension) {
        await vscode.commands.executeCommand('workbench.extensions.installExtension', vscodeDotnetRuntimeExtensionId);
        await vscode.commands.executeCommand('workbench.action.reloadWindow');
    }

    const csharpExtension = vscode.extensions.getExtension<CSharpExtensionExports>('ms-dotnettools.csharp');
    if (!csharpExtension) {
        throw new Error('Failed to find installation of ms-dotnettools.csharp');
    }

    // Run a restore manually to make sure the project is up to date since we don't have automatic restore.
    await testAssetWorkspace.restoreLspToolsHostAsync();

    // Explicitly await the extension activation even if completed so that we capture any errors it threw during activation.
    await csharpExtension.activate();
    await csharpExtension.exports.initializationFinished();
    console.log('ms-dotnettools.csharp activated');
    console.log(`Extension Log Directory: ${csharpExtension.exports.logDirectory}`);

    await waitForAllAsyncOperationsAsync(csharpExtension.exports);
    console.log('Async operations completed');
}

export async function openFileInWorkspaceAsync(relativeFilePath: string): Promise<void> {
    const root = vscode.workspace.workspaceFolders![0].uri.fsPath;
    const filePath = path.join(root, relativeFilePath);
    if (!existsSync(filePath)) {
        throw new Error(`File ${filePath} does not exist`);
    }

    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
}

export function isRazorWorkspace(workspace: typeof vscode.workspace) {
    return isGivenSln(workspace, 'BasicRazorApp2_1');
}

export function isSlnWithGenerator(workspace: typeof vscode.workspace) {
    return isGivenSln(workspace, 'slnWithGenerator');
}

export async function waitForAllAsyncOperationsAsync(exports: CSharpExtensionExports): Promise<void> {
    const source = new vscode.CancellationTokenSource();
    await exports.experimental.sendServerRequest(WaitForAsyncOperationsRequest.type, { operations: [] }, source.token);
}

function isGivenSln(workspace: typeof vscode.workspace, expectedProjectFileName: string) {
    const primeWorkspace = workspace.workspaceFolders![0];
    const projectFileName = primeWorkspace.uri.fsPath.split(path.sep).pop();

    return projectFileName === expectedProjectFileName;
}
