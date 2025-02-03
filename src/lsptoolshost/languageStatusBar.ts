/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { RoslynLanguageServerEvents } from './languageServerEvents';
import { languageServerOptions } from '../shared/options';
import { ServerState } from './serverStateChange';
import { getCSharpDevKit } from '../utils/getCSharpDevKit';
import { RazorLanguage } from '../razor/src/razorLanguage';
import { LearnMoreAboutMiscellaneousFilesCommand } from './miscellaneousFileNotifier';

export function registerLanguageStatusItems(
    context: vscode.ExtensionContext,
    languageServer: RoslynLanguageServer,
    languageServerEvents: RoslynLanguageServerEvents
) {
    // DevKit will provide an equivalent workspace status item.
    if (!getCSharpDevKit()) {
        WorkspaceStatus.createStatusItem(context, languageServerEvents);
    }
    ProjectContextStatus.createStatusItem(context, languageServer);
}

function combineDocumentSelectors(...selectors: vscode.DocumentSelector[]): vscode.DocumentSelector {
    return selectors.reduce<(string | vscode.DocumentFilter)[]>((acc, selector) => acc.concat(selector), []);
}

class WorkspaceStatus {
    static createStatusItem(context: vscode.ExtensionContext, languageServerEvents: RoslynLanguageServerEvents) {
        const documentSelector = combineDocumentSelectors(languageServerOptions.documentSelector);
        const openSolutionCommand = {
            command: 'dotnet.openSolution',
            title: vscode.l10n.t('Open solution'),
        };
        const restartServerCommand = {
            command: 'dotnet.restartServer',
            title: vscode.l10n.t('Restart server'),
        };

        const item = vscode.languages.createLanguageStatusItem('csharp.workspaceStatus', documentSelector);
        item.name = vscode.l10n.t('C# Workspace Status');
        item.severity = vscode.LanguageStatusSeverity.Error;
        item.command = openSolutionCommand;
        context.subscriptions.push(item);

        languageServerEvents.onServerStateChange((e) => {
            item.text = e.workspaceLabel;
            item.busy = e.state === ServerState.ProjectInitializationStarted;
            item.severity =
                e.state === ServerState.Stopped
                    ? vscode.LanguageStatusSeverity.Error
                    : vscode.LanguageStatusSeverity.Information;
            item.command = e.state === ServerState.Stopped ? restartServerCommand : openSolutionCommand;
        });
    }
}

class ProjectContextStatus {
    static createStatusItem(context: vscode.ExtensionContext, languageServer: RoslynLanguageServer) {
        const documentSelector = combineDocumentSelectors(
            languageServerOptions.documentSelector,
            RazorLanguage.documentSelector
        );
        const projectContextService = languageServer._projectContextService;

        const item = vscode.languages.createLanguageStatusItem('csharp.projectContextStatus', documentSelector);
        item.name = vscode.l10n.t('C# Project Context Status');
        item.detail = vscode.l10n.t('Active File Context');
        context.subscriptions.push(item);

        projectContextService.onActiveFileContextChanged((e) => {
            item.text = e.context._vs_label;

            // Show a warning when the active file is part of the Miscellaneous File workspace and
            // project initialization is complete.
            if (languageServer.state === ServerState.ProjectInitializationComplete) {
                item.severity =
                    e.context._vs_is_miscellaneous && e.isVerified
                        ? vscode.LanguageStatusSeverity.Warning
                        : vscode.LanguageStatusSeverity.Information;
            } else {
                item.severity = vscode.LanguageStatusSeverity.Information;
            }

            item.detail = e.context._vs_is_miscellaneous
                ? vscode.l10n.t(
                      'The active document is not part of the open workspace. Not all language features will be available.'
                  )
                : vscode.l10n.t('Active File Context');
            item.command = e.context._vs_is_miscellaneous ? LearnMoreAboutMiscellaneousFilesCommand : undefined;
        });

        // Trigger a refresh, but don't block creation on the refresh completing.
        projectContextService.refresh().catch((e) => {
            throw new Error(`Error refreshing project context status ${e}`);
        });
    }
}
