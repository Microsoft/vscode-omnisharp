/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { ActionOption, showWarningMessage } from '../shared/observers/utils/showMessage';
import { ServerState } from './serverStateChange';
import { languageServerOptions } from '../shared/options';

const SuppressMiscellaneousFilesToastsOption = 'dotnet.server.suppressMiscellaneousFilesToasts';
const NotifiedDocuments = new Set<string>();

export const LearnMoreAboutMiscellaneousFilesCommand = {
    command: 'vscode.open',
    title: vscode.l10n.t('Learn more'),
    arguments: [
        vscode.Uri.parse(
            'https://learn.microsoft.com/en-us/visualstudio/ide/reference/miscellaneous-files?view=vs-2022'
        ),
    ],
};

export function registerMiscellaneousFileNotifier(
    context: vscode.ExtensionContext,
    languageServer: RoslynLanguageServer
) {
    languageServer._projectContextService.onActiveFileContextChanged((e) => {
        // Only warn for C# miscellaneous files when the workspace is fully initialized.
        if (
            e.languageId !== 'csharp' ||
            !e.isVerified ||
            !e.context._vs_is_miscellaneous ||
            languageServer.state !== ServerState.ProjectInitializationComplete
        ) {
            return;
        }

        // Check settings and workspaceState to see if we should suppress the toast.
        if (
            languageServerOptions.suppressMiscellaneousFilesToasts ||
            context.workspaceState.get<boolean>(SuppressMiscellaneousFilesToastsOption, false)
        ) {
            return;
        }

        // Check to see if we have already notified the user about this document.
        const hash = createHash(e.uri.toString(/*skipEncoding:*/ true));
        if (NotifiedDocuments.has(hash)) {
            return;
        }

        NotifiedDocuments.add(hash);

        const message = vscode.l10n.t(
            'The active document is not part of the open workspace. Not all language features will be available.'
        );
        const dismissItem = vscode.l10n.t('Dismiss');
        // Provide the user a way to easily disable the toast without changing settings.
        const disableWorkspace: ActionOption = {
            title: vscode.l10n.t('Do not show for this workspace'),
            action: async () => {
                context.workspaceState.update(SuppressMiscellaneousFilesToastsOption, true);
            },
        };
        showWarningMessage(vscode, message, dismissItem, disableWorkspace, LearnMoreAboutMiscellaneousFilesCommand);
    });
}

function createHash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
}
