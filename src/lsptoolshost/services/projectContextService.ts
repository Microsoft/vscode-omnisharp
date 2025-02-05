/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { RoslynLanguageServer } from '../roslynLanguageServer';
import { VSGetProjectContextsRequest, VSProjectContext, VSProjectContextList } from '../roslynProtocol';
import { TextDocumentIdentifier } from 'vscode-languageserver-protocol';
import { UriConverter } from '../uriConverter';
import { LanguageServerEvents } from '../languageServerEvents';
import { ServerState } from '../serverStateChange';
import { CancellationToken } from 'vscode-languageclient/node';

export interface ProjectContextChangeEvent {
    languageId: string;
    uri: vscode.Uri;
    context: VSProjectContext;
    isVerified: boolean;
    hasAdditionalContexts: boolean;
}

const VerificationDelay = 2 * 1000;

let _verifyTimeout: NodeJS.Timeout | undefined;
let _documentUriToVerify: vscode.Uri | undefined;

export class ProjectContextService {
    private readonly _projectContextMap: Map<string, VSProjectContext> = new Map();
    private readonly _contextChangeEmitter = new vscode.EventEmitter<ProjectContextChangeEvent>();
    private _source = new vscode.CancellationTokenSource();
    private readonly _emptyProjectContext: VSProjectContext = {
        _vs_id: '',
        _vs_kind: '',
        _vs_label: '',
        _vs_is_miscellaneous: false,
    };

    constructor(private _languageServer: RoslynLanguageServer, _languageServerEvents: LanguageServerEvents) {
        _languageServerEvents.onServerStateChange(async (e) => {
            // When the project initialization is complete, open files
            // could move from the miscellaneous workspace context into
            // an open project.
            if (e.state === ServerState.Stopped || e.state === ServerState.ProjectInitializationComplete) {
                await this.refresh();
            }
        });

        vscode.window.onDidChangeActiveTextEditor(async (_) => this.refresh());
    }

    public get onActiveFileContextChanged(): vscode.Event<ProjectContextChangeEvent> {
        return this._contextChangeEmitter.event;
    }

    public async getDocumentContext(uri: string | vscode.Uri): Promise<VSProjectContext | undefined>;
    public async getDocumentContext(
        uri: string | vscode.Uri,
        contextList?: VSProjectContextList | undefined
    ): Promise<VSProjectContext>;
    public async getDocumentContext(
        uri: string | vscode.Uri,
        contextList?: VSProjectContextList | undefined
    ): Promise<VSProjectContext | undefined> {
        // To find the current context for the specified document we need to know the list
        // of contexts that it is a part of.
        contextList ??= await this.getProjectContexts(uri, CancellationToken.None);
        if (contextList === undefined) {
            return undefined;
        }

        const key = this.getContextKey(contextList);

        // If this list of contexts hasn't been queried before that set the context to the default.
        if (!this._projectContextMap.has(key)) {
            this._projectContextMap.set(key, contextList._vs_projectContexts[contextList._vs_defaultIndex]);
        }

        return this._projectContextMap.get(key);
    }

    private getContextKey(contextList: VSProjectContextList): string {
        return contextList._vs_projectContexts
            .map((context) => context._vs_label)
            .sort()
            .join(';');
    }

    public setActiveFileContext(contextList: VSProjectContextList, context: VSProjectContext): void {
        const textEditor = vscode.window.activeTextEditor;
        const uri = textEditor?.document?.uri;
        const languageId = textEditor?.document?.languageId;
        if (!uri || languageId !== 'csharp') {
            return;
        }

        const key = this.getContextKey(contextList);
        this._projectContextMap.set(key, context);

        this._contextChangeEmitter.fire({ languageId, uri, context, isVerified: true, hasAdditionalContexts: true });
    }

    public async refresh() {
        const textEditor = vscode.window.activeTextEditor;
        const languageId = textEditor?.document?.languageId;
        if (languageId !== 'csharp') {
            return;
        }

        // If we have an open request, cancel it.
        this._source.cancel();
        this._source = new vscode.CancellationTokenSource();

        const uri = textEditor!.document.uri;

        // Whether we have refreshed the active document's project context.
        let isVerifyPass = false;

        if (_verifyTimeout) {
            // If we have changed active document then do not verify the previous one.
            clearTimeout(_verifyTimeout);
            _verifyTimeout = undefined;
        }

        if (_documentUriToVerify) {
            if (uri.toString() === _documentUriToVerify.toString()) {
                // We have rerequested project contexts for the active document
                // and we can now notify if the document isn't part of the workspace.
                isVerifyPass = true;
            }

            _documentUriToVerify = undefined;
        }

        if (!this._languageServer.isRunning()) {
            this._contextChangeEmitter.fire({
                languageId,
                uri,
                context: this._emptyProjectContext,
                isVerified: false,
                hasAdditionalContexts: false,
            });
            return;
        }

        const contextList = await this.getProjectContexts(uri, this._source.token);
        if (!contextList) {
            this._contextChangeEmitter.fire({
                languageId,
                uri,
                context: this._emptyProjectContext,
                isVerified: false,
                hasAdditionalContexts: false,
            });
            return;
        }

        const context = await this.getDocumentContext(uri, contextList);
        const isVerified = !context._vs_is_miscellaneous || isVerifyPass;
        const hasAdditionalContexts = contextList._vs_projectContexts.length > 1;
        this._contextChangeEmitter.fire({ languageId, uri, context, isVerified, hasAdditionalContexts });

        if (context._vs_is_miscellaneous && !isVerifyPass) {
            // Request the active project context be refreshed but delay the request to give
            // time for the project system to update with new files.
            _verifyTimeout = setTimeout(() => {
                _verifyTimeout = undefined;
                _documentUriToVerify = uri;

                // Trigger a refresh, but don't block on refresh completing.
                this.refresh().catch((e) => {
                    throw new Error(`Error refreshing project context status ${e}`);
                });
            }, VerificationDelay);

            return;
        }
    }

    public async getProjectContexts(
        uri: string | vscode.Uri,
        token: vscode.CancellationToken
    ): Promise<VSProjectContextList | undefined> {
        const uriString = uri instanceof vscode.Uri ? UriConverter.serialize(uri) : uri;
        const textDocument = TextDocumentIdentifier.create(uriString);

        try {
            return await this._languageServer.sendRequest(
                VSGetProjectContextsRequest.type,
                { _vs_textDocument: textDocument },
                token
            );
        } catch (error) {
            if (error instanceof vscode.CancellationError) {
                return undefined;
            }

            throw error;
        }
    }
}
