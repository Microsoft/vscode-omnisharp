/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { CodeAction, CodeActionResolveRequest, LSPAny } from 'vscode-languageserver-protocol';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { URIConverter, createConverter } from 'vscode-languageclient/lib/common/protocolConverter';
import { UriConverter } from './uriConverter';
import { getFixAllResponse } from './fixAllCodeAction';

export function registerNestedCodeActionCommands(
    context: vscode.ExtensionContext,
    languageServer: RoslynLanguageServer,
    outputChannel: vscode.OutputChannel
) {
    context.subscriptions.push(
        vscode.commands.registerCommand(
            'roslyn.client.nestedCodeAction',
            async (request): Promise<void> => registerNestedResolveCodeAction(languageServer, request, outputChannel)
        )
    );
}

async function registerNestedResolveCodeAction(
    languageServer: RoslynLanguageServer,
    codeActionData: any,
    outputChannel: vscode.OutputChannel
): Promise<void> {
    if (codeActionData) {
        const data = <LSPAny>codeActionData;
        const action = data.NestedCodeAction;

        if (action?.nestedActions?.length > 0) {
            const selectedValue = await vscode.window.showQuickPick(
                action.nestedActions?.map((child: { title: string }) => child.title),
                {
                    placeHolder: vscode.l10n.t(action.title),
                    ignoreFocusOut: true,
                }
            );
            if (selectedValue) {
                const selectedAction = action.nestedActions?.find(
                    (child: { title: string }) => child.title === selectedValue
                );

                if (!selectedAction) {
                    return;
                }

                if (selectedAction.data.FixAllFlavors) {
                    await getFixAllResponse(selectedAction.data, languageServer, outputChannel, data.UniqueIdentifier);
                    return;
                }

                await vscode.window.withProgress(
                    {
                        location: vscode.ProgressLocation.Notification,
                        title: vscode.l10n.t('Nested Code Action'),
                        cancellable: true,
                    },
                    async (_, token) => {
                        const nestedCodeActionResolve: CodeAction = {
                            title: data.UniqueIdentifier + '|' + selectedAction.data.UniqueIdentifier,
                            data: selectedAction.data,
                        };

                        const response = await languageServer.sendRequest(
                            CodeActionResolveRequest.type,
                            nestedCodeActionResolve,
                            token
                        );

                        if (!response.edit) {
                            outputChannel.show();
                            outputChannel.appendLine(`Failed to make an edit for completion.`);
                            return;
                        }

                        const uriConverter: URIConverter = (value: string): vscode.Uri =>
                            UriConverter.deserialize(value);
                        const protocolConverter = createConverter(uriConverter, true, true);
                        const fixAllEdit = await protocolConverter.asWorkspaceEdit(response.edit);
                        if (!(await vscode.workspace.applyEdit(fixAllEdit))) {
                            const componentName = '[roslyn.client.nestedCodeAction]';
                            const errorMessage = 'Failed to make am edit for completion.';
                            outputChannel.show();
                            outputChannel.appendLine(`${componentName} ${errorMessage}`);
                            throw new Error('Tried to insert code action edit, but an error occurred.');
                        }
                    }
                );
            }
        }
    }
}
