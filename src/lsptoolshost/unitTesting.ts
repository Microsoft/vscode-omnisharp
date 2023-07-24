/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as languageClient from 'vscode-languageclient/node';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { RunTestsParams, RunTestsPartialResult, RunTestsRequest } from './roslynProtocol';

export function registerUnitTestingCommands(
    context: vscode.ExtensionContext,
    languageServer: RoslynLanguageServer,
    dotnetTestChannel: vscode.OutputChannel
) {
    context.subscriptions.push(
        vscode.commands.registerCommand('dotnet.test.run', async (request) =>
            runTests(request, languageServer, dotnetTestChannel)
        )
    );
    context.subscriptions.push(
        vscode.commands.registerTextEditorCommand(
            'dotnet.test.runTestsInContext',
            async (textEditor: vscode.TextEditor) => runTestsInContext(textEditor, languageServer, dotnetTestChannel)
        )
    );
}

async function runTestsInContext(
    textEditor: vscode.TextEditor,
    languageServer: RoslynLanguageServer,
    dotnetTestChannel: vscode.OutputChannel
) {
    const contextRange: languageClient.Range = { start: textEditor.selection.active, end: textEditor.selection.active };
    const textDocument: languageClient.TextDocumentIdentifier = { uri: textEditor.document.fileName };
    const request: RunTestsParams = { textDocument: textDocument, range: contextRange };
    await runTests(request, languageServer, dotnetTestChannel);
}

let _testRunInProgress = false;

async function runTests(
    request: RunTestsParams,
    languageServer: RoslynLanguageServer,
    dotnetTestChannel: vscode.OutputChannel
) {
    if (_testRunInProgress) {
        vscode.window.showErrorMessage('Test run already in progress');
        return;
    }

    _testRunInProgress = true;

    dotnetTestChannel.show(true);
    vscode.window
        .withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Dotnet Test',
                cancellable: true,
            },
            async (progress, token) => {
                let totalReportedComplete = 0;
                const writeOutput = (output: RunTestsPartialResult) => {
                    if (output.message) {
                        dotnetTestChannel.appendLine(output.message);
                    }

                    if (output.progress) {
                        const totalTests = output.progress.totalTests;
                        const completed =
                            output.progress.testsPassed + output.progress.testsFailed + output.progress.testsSkipped;

                        // VSCode requires us to report the additional amount completed (in x out of 100) from this report compared to what we've previously reported.
                        const reportIncrement = ((completed - totalReportedComplete) / totalTests) * 100;
                        progress.report({ message: output.stage, increment: reportIncrement });
                        totalReportedComplete = completed;
                    } else {
                        progress.report({ message: output.stage });
                    }
                };

                progress.report({ message: 'Saving files...' });
                // Ensure all files are saved before we run tests so they accurately reflect what the user has requested to run.
                await vscode.workspace.saveAll(/*includeUntitled*/ false);

                progress.report({ message: 'Requesting server...' });
                const responsePromise = languageServer.sendRequestWithProgress(
                    RunTestsRequest.type,
                    request,
                    async (p) => {
                        writeOutput(p);
                    },
                    token
                );

                await responsePromise.then(
                    (result) => {
                        result.forEach((r) => {
                            writeOutput(r);
                        });
                        return;
                    },
                    (err) => {
                        dotnetTestChannel.appendLine(err);
                        return;
                    }
                );
            }
        )
        .then(
            () => (_testRunInProgress = false),
            () => (_testRunInProgress = false)
        );
}
