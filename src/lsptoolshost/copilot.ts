/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { CodeSnippet, ContextProviderApiV1 } from '@github/copilot-language-server';
import * as vscode from 'vscode';
import { CSharpExtensionId } from '../constants/csharpExtensionId';
import { CopilotRelatedDocumentsReport, CopilotRelatedDocumentsRequest } from './roslynProtocol';
import { RoslynLanguageServer } from './roslynLanguageServer';
import { UriConverter } from './uriConverter';
import { TextDocumentIdentifier } from 'vscode-languageserver-protocol';
import { getCSharpDevKit } from '../utils/getCSharpDevKit';

interface CopilotTrait {
    name: string;
    value: string;
    includeInPrompt?: boolean;
    promptTextOverride?: string;
}

interface CopilotAPIs {
    registerRelatedFilesProvider(
        providerId: { extensionId: string; languageId: string },
        callback: (
            uri: vscode.Uri,
            context: { flags: Record<string, unknown> },
            cancellationToken?: vscode.CancellationToken
        ) => Promise<{ entries: vscode.Uri[]; traits?: CopilotTrait[] }>
    ): vscode.Disposable;
    getContextProviderAPI(version: string): Promise<ContextProviderApiV1 | undefined>;
}

async function getCopilotAPIsAsync(): Promise<CopilotAPIs | undefined> {
    const ext = vscode.extensions.getExtension('github.copilot');
    if (!ext) {
        return undefined;
    }

    if (!ext.isActive) {
        try {
            return await ext.activate();
        } catch {
            return undefined;
        }
    } else {
        return ext.exports as CopilotAPIs | undefined;
    }
}

function registerCopilotRelatedFilesProvider(
    languageServer: RoslynLanguageServer,
    copilotAPIs: CopilotAPIs,
    channel: vscode.LogOutputChannel
): CopilotAPIs {
    const id = {
        extensionId: CSharpExtensionId,
        languageId: 'csharp',
    };

    copilotAPIs.registerRelatedFilesProvider(id, async (uri, _, token) => {
        const buildResult = (
            activeDocumentUri: vscode.Uri,
            reports: CopilotRelatedDocumentsReport[],
            builder: vscode.Uri[]
        ) => {
            if (reports) {
                for (const report of reports) {
                    if (report._vs_file_paths) {
                        for (const filePath of report._vs_file_paths) {
                            // The Roslyn related document service would return the active document as related file to itself
                            // if the code contains reference to the types defined in the same document. Skip it so the active file
                            // won't be used as additonal context.
                            const relatedUri = vscode.Uri.file(filePath);
                            if (relatedUri.fsPath !== activeDocumentUri.fsPath) {
                                builder.push(relatedUri);
                            }
                        }
                    }
                }
            }
        };
        const relatedFiles: vscode.Uri[] = [];
        const uriString = UriConverter.serialize(uri);
        const textDocument = TextDocumentIdentifier.create(uriString);
        try {
            await languageServer.sendRequestWithProgress(
                CopilotRelatedDocumentsRequest.type,
                {
                    _vs_textDocument: textDocument,
                    position: {
                        line: 0,
                        character: 0,
                    },
                },
                async (r) => buildResult(uri, r, relatedFiles),
                token
            );
        } catch (e) {
            if (e instanceof Error) {
                channel.appendLine(e.message);
            }
        }
        return { entries: relatedFiles };
    });

    channel.debug('registration of C# related files provider for GitHub Copilot extension succeeded.');
    return copilotAPIs;
}

async function registerCopilotContextProvider(
    languageServer: RoslynLanguageServer,
    copilotAPIs: CopilotAPIs,
    channel: vscode.LogOutputChannel
) {
    // Only register the context provider if the C# DevKit extension is available.
    const csharpDevkitExtension = getCSharpDevKit();
    if (!csharpDevkitExtension) {
        return;
    }

    const contextAPI = await copilotAPIs.getContextProviderAPI('v1');
    if (!contextAPI) {
        channel.debug('Failed to get context provider API from GitHub Copilot extension.');
        return;
    }

    contextAPI.registerContextProvider<CodeSnippet>({
        id: 'csharpContextProvider',
        selector: [{ language: 'csharp' }],
        resolver: {
            resolve: async (request, token) => {
                return [{ uri: 'testUri', value: 'testValue', additionalUris: [] }];
            },
        },
    });

    channel.debug('registration of C# context provider for GitHub Copilot extension succeeded.');
}

export function registerCopilotExtension(languageServer: RoslynLanguageServer, channel: vscode.LogOutputChannel) {
    getCopilotAPIsAsync()
        .then(async (copilotAPIs) => {
            if (!copilotAPIs) {
                channel.debug(
                    'Failed activating GitHub Copilot extension. Skip registeration of C# Copilot providers.'
                );
                return;
            }
            registerCopilotRelatedFilesProvider(languageServer, copilotAPIs, channel);
            await registerCopilotContextProvider(languageServer, copilotAPIs, channel);
        })
        .catch((error) => {
            channel.debug('Failed registering C# Copilot providers. Error: ' + error);
        });
}
