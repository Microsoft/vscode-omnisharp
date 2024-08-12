/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import {
    CompletionItem,
    CompletionList,
    CompletionParams,
    CompletionTriggerKind,
    InsertReplaceEdit,
    InsertTextFormat,
    InsertTextMode,
    MarkupContent,
    Position,
    Range,
    RequestType,
    TextEdit,
} from 'vscode-languageclient';
import { provideCompletionsCommand, resolveCompletionsCommand } from '../../../lsptoolshost/razorCommands';
import { RazorDocumentManager } from '../document/razorDocumentManager';
import { RazorDocumentSynchronizer } from '../document/razorDocumentSynchronizer';
import { RazorLanguageServerClient } from '../razorLanguageServerClient';
import { RazorLogger } from '../razorLogger';
import { SerializableDelegatedCompletionParams } from './serializableDelegatedCompletionParams';
import { SerializableDelegatedCompletionItemResolveParams } from './serializableDelegatedCompletionItemResolveParams';
import { LanguageKind } from '../rpc/languageKind';
import { UriConverter } from '../../../lsptoolshost/uriConverter';
import { SerializableTextEdit } from '../rpc/serializableTextEdit';
import { CSharpProjectedDocument } from '../csharp/csharpProjectedDocument';
import { IProjectedDocument } from '../projection/IProjectedDocument';
import { CSharpProjectedDocumentContentProvider } from '../csharp/csharpProjectedDocumentContentProvider';

export class CompletionHandler {
    private static readonly completionEndpoint = 'razor/completion';
    private static readonly completionResolveEndpoint = 'razor/completionItem/resolve';
    private completionRequestType: RequestType<SerializableDelegatedCompletionParams, CompletionList, any> =
        new RequestType(CompletionHandler.completionEndpoint);
    private completionResolveRequestType: RequestType<
        SerializableDelegatedCompletionItemResolveParams,
        CompletionItem,
        any
    > = new RequestType(CompletionHandler.completionResolveEndpoint);
    private static readonly emptyCompletionList: CompletionList = <CompletionList>{
        items: new Array(0),
    };
    private static readonly emptyCompletionItem: CompletionItem = <CompletionItem>{};

    constructor(
        private readonly documentManager: RazorDocumentManager,
        private readonly documentSynchronizer: RazorDocumentSynchronizer,
        private readonly serverClient: RazorLanguageServerClient,
        private readonly projectedCSharpProvider: CSharpProjectedDocumentContentProvider,
        private readonly logger: RazorLogger
    ) {}

    public async register() {
        await this.serverClient.onRequestWithParams<SerializableDelegatedCompletionParams, CompletionList, any>(
            this.completionRequestType,
            async (request: SerializableDelegatedCompletionParams, token: vscode.CancellationToken) =>
                this.provideCompletions(request, token)
        );

        await this.serverClient.onRequestWithParams<
            SerializableDelegatedCompletionItemResolveParams,
            CompletionItem,
            any
        >(
            this.completionResolveRequestType,
            async (request: SerializableDelegatedCompletionItemResolveParams, token: vscode.CancellationToken) =>
                this.provideResolvedCompletionItem(request, token)
        );
    }

    private async provideCompletions(
        delegatedCompletionParams: SerializableDelegatedCompletionParams,
        token: vscode.CancellationToken
    ) {
        try {
            const razorDocumentUri = vscode.Uri.parse(
                delegatedCompletionParams.identifier.textDocumentIdentifier.uri,
                true
            );
            const razorDocument = await this.documentManager.getDocument(razorDocumentUri);
            if (razorDocument === undefined) {
                return CompletionHandler.emptyCompletionList;
            }

            const textDocument = await vscode.workspace.openTextDocument(razorDocumentUri);

            let virtualDocument: any;
            if (delegatedCompletionParams.projectedKind === LanguageKind.Html) {
                virtualDocument = razorDocument.htmlDocument;
            } else if (delegatedCompletionParams.projectedKind === LanguageKind.CSharp) {
                virtualDocument = razorDocument.csharpDocument;
            } else {
                this.logger.logWarning(`Unknown language kind value ${delegatedCompletionParams.projectedKind}`);
                return CompletionHandler.emptyCompletionList;
            }

            if (!virtualDocument) {
                this.logger.logWarning(`Null or undefined virtual document: ${virtualDocument}`);
                return CompletionHandler.emptyCompletionList;
            }

            const synchronized = await this.documentSynchronizer.trySynchronizeProjectedDocument(
                textDocument,
                virtualDocument,
                delegatedCompletionParams.identifier.version,
                token
            );
            if (!synchronized) {
                return CompletionHandler.emptyCompletionList;
            }

            // "@" is not a valid trigger character for C# / HTML and therefore we need to translate
            // it into a non-trigger invocation.
            const modifiedTriggerCharacter =
                delegatedCompletionParams.context.triggerCharacter === '@'
                    ? undefined
                    : delegatedCompletionParams.context.triggerCharacter;
            const triggerKind =
                delegatedCompletionParams.context.triggerCharacter === '@'
                    ? CompletionTriggerKind.Invoked
                    : delegatedCompletionParams.context.triggerKind;

            // Roslyn/C# completion
            if (delegatedCompletionParams.projectedKind === LanguageKind.CSharp) {
                return this.provideCSharpCompletions(
                    triggerKind,
                    modifiedTriggerCharacter,
                    virtualDocument as CSharpProjectedDocument,
                    delegatedCompletionParams.projectedPosition,
                    delegatedCompletionParams.provisionalTextEdit
                );
            }

            // HTML completion - provided via vscode command
            return this.provideVscodeCompletions(
                virtualDocument.uri,
                delegatedCompletionParams.projectedPosition,
                modifiedTriggerCharacter
            );
        } catch (error) {
            this.logger.logWarning(`${CompletionHandler.completionEndpoint} failed with ${error}`);
        }

        return CompletionHandler.emptyCompletionList;
    }

    private async provideResolvedCompletionItem(
        delegatedCompletionItemResolveParams: SerializableDelegatedCompletionItemResolveParams,
        _cancellationToken: vscode.CancellationToken
    ) {
        // TODO: Snippet support

        try {
            if (
                delegatedCompletionItemResolveParams.originatingKind != LanguageKind.CSharp ||
                delegatedCompletionItemResolveParams.completionItem.data.TextDocument == null
            ) {
                return delegatedCompletionItemResolveParams.completionItem;
            } else {
                const newItem = await vscode.commands.executeCommand<CompletionItem>(
                    resolveCompletionsCommand,
                    delegatedCompletionItemResolveParams.completionItem
                );

                if (!newItem) {
                    return delegatedCompletionItemResolveParams.completionItem;
                }

                return newItem;
            }
        } catch (error) {
            this.logger.logWarning(`${CompletionHandler.completionResolveEndpoint} failed with ${error}`);
        }

        return CompletionHandler.emptyCompletionItem;
    }

    private async provideCSharpCompletions(
        triggerKind: CompletionTriggerKind,
        triggerCharacter: string | undefined,
        virtualDocument: CSharpProjectedDocument,
        projectedPosition: Position,
        provisionalTextEdit?: SerializableTextEdit
    ) {
        try {
            if (provisionalTextEdit) {
                // provisional C# completion
                // add '.' to projected C# document to ensure correct completions are provided
                // This is because when a user types '.' after an object, it is initially in
                // html document and not generated C# document.
                const absoluteIndex = CompletionHandler.getIndexOfPosition(virtualDocument, projectedPosition);
                if (absoluteIndex === -1) {
                    return CompletionHandler.emptyCompletionList;
                }
                virtualDocument.addProvisionalDotAt(absoluteIndex);
                await this.ensureProvisionalDotAddedAtCSharpDocument(virtualDocument.uri, absoluteIndex);
            }

            const virtualDocumentUri = UriConverter.serialize(virtualDocument.uri);
            const params: CompletionParams = {
                context: {
                    triggerKind: triggerKind,
                    triggerCharacter: triggerCharacter,
                },
                textDocument: {
                    uri: virtualDocumentUri,
                },
                position: projectedPosition,
            };

            const csharpCompletions = await vscode.commands.executeCommand<CompletionList>(
                provideCompletionsCommand,
                params
            );
            if (!csharpCompletions) {
                return CompletionHandler.emptyCompletionList;
            }
            CompletionHandler.adjustCSharpCompletionList(csharpCompletions, triggerCharacter);
            return csharpCompletions;
        } catch (error) {
            this.logger.logWarning(`${CompletionHandler.completionEndpoint} failed with ${error}`);
        }

        return CompletionHandler.emptyCompletionList;
    }

    private async delay(ms: number) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    private async ensureProvisionalDotAddedAtCSharpDocument(virtualDocumentUri: vscode.Uri, absoluteIndex: number) {
        // notifies the C# document content provider that the document content has changed
        this.projectedCSharpProvider.ensureDocumentContent(virtualDocumentUri);
        // Wait for the document to be updated before continuing
        const startTime = Date.now();
        const timeout = 5000;
        const newDocument = await vscode.workspace.openTextDocument(virtualDocumentUri);

        while (newDocument.getText()[absoluteIndex] !== '.') {
            if (Date.now() - startTime > timeout) {
                throw new Error('Timeout waiting for document update');
            }
            await this.delay(100);
        }
        await newDocument.save();
    }

    // Adjust Roslyn completion command results to make it more palatable to VSCode
    private static adjustCSharpCompletionList(completionList: CompletionList, triggerCharacter: string | undefined) {
        const data = completionList.itemDefaults?.data;
        for (const completionItem of completionList.items) {
            // textEdit is deprecated in favor of .range. Clear out its value to avoid any unexpected behavior.
            completionItem.textEdit = undefined;

            if (triggerCharacter === '@' && completionItem.commitCharacters) {
                // We remove `{`, '(', and '*' from the commit characters to prevent auto-completing the first
                // completion item with a curly brace when a user intended to type `@{}` or `@()`.
                completionItem.commitCharacters = completionItem.commitCharacters.filter(
                    (commitChar) => commitChar !== '{' && commitChar !== '(' && commitChar !== '*'
                );
            }

            // for intellicode items, manually set the insertText to avoid including stars in the commit
            if (completionItem.label.toString().includes('\u2605')) {
                if (completionItem.textEditText) {
                    completionItem.insertText = completionItem.textEditText;
                }
            }

            // copy default item data to each item or else completion item resolve will fail later
            if (!completionItem.data) {
                completionItem.data = data;
            }
        }
    }

    // Convert (line, character) Position to absolute index number
    private static getIndexOfPosition(document: IProjectedDocument, position: Position): number {
        const content: string = document.getContent();
        let lineNumber = 0;
        let index = 0;
        while (lineNumber < position.line && index < content.length) {
            const ch = content[index];
            if (ch === '\r') {
                lineNumber++;
                if (index + 1 < content.length && content[index + 1] === '\n') {
                    index++;
                }
            } else if (ch === '\n') {
                lineNumber++;
            }

            index++;
        }

        if (lineNumber !== position.line) {
            return -1;
        }

        const positionIndex = index + position.character - 1;

        return positionIndex;
    }

    // Provide completions using standard vscode executeCompletionItemProvider command
    // Used in HTML context
    private async provideVscodeCompletions(
        virtualDocumentUri: vscode.Uri,
        projectedPosition: Position,
        triggerCharacter: string | undefined
    ) {
        const completions = await vscode.commands.executeCommand<vscode.CompletionList | vscode.CompletionItem[]>(
            'vscode.executeCompletionItemProvider',
            virtualDocumentUri,
            projectedPosition,
            triggerCharacter
        );

        const completionItems =
            completions instanceof Array
                ? completions // was vscode.CompletionItem[]
                : completions
                ? completions.items // was vscode.CompletionList
                : [];

        const convertedCompletionItems: CompletionItem[] = new Array(completionItems.length);
        for (let i = 0; i < completionItems.length; i++) {
            const completionItem = completionItems[i];
            const convertedCompletionItem = <CompletionItem>{
                command: completionItem.command, // no conversion needed as fields match
                commitCharacters: completionItem.commitCharacters,
                detail: completionItem.detail,
                documentation: CompletionHandler.toMarkupContent(completionItem.documentation),
                filterText: completionItem.filterText,
                insertText: CompletionHandler.toLspInsertText(completionItem.insertText),
                insertTextFormat: CompletionHandler.toLspInsertTextFormat(completionItem.insertText),
                insertTextMode: CompletionHandler.toInsertTextMode(completionItem.keepWhitespace),
                kind: completionItem.kind ? completionItem.kind + 1 : completionItem.kind, // VSCode and LSP are off by one
                label: CompletionHandler.toLspCompletionItemLabel(completionItem.label),
                preselect: completionItem.preselect,
                sortText: completionItem.sortText,
                textEdit: CompletionHandler.toLspTextEdit(
                    CompletionHandler.toLspInsertText(completionItem.insertText),
                    completionItem.range
                ),
            };
            convertedCompletionItems[i] = convertedCompletionItem;
        }

        const isIncomplete = completions instanceof Array ? false : completions ? completions.isIncomplete : false;
        const completionList = <CompletionList>{
            isIncomplete: isIncomplete,
            items: convertedCompletionItems,
        };

        return completionList;
    }

    // converts completion item documentation from vscode format to LSP format
    private static toMarkupContent(documentation?: string | vscode.MarkdownString): string | MarkupContent | undefined {
        const markdownString = documentation as vscode.MarkdownString;
        if (!markdownString?.value) {
            return <string | undefined>documentation;
        }
        const markupContent: MarkupContent = {
            value: markdownString.value,
            kind: 'markdown',
        };

        return markupContent;
    }

    private static toLspCompletionItemLabel(label: string | vscode.CompletionItemLabel): string {
        const completionItemLabel = label as vscode.CompletionItemLabel;
        return completionItemLabel?.label ?? <string>label;
    }

    private static toLspInsertText(insertText?: string | vscode.SnippetString): string | undefined {
        const snippetString = insertText as vscode.SnippetString;
        return snippetString?.value ?? <string | undefined>insertText;
    }

    private static toLspInsertTextFormat(insertText?: string | vscode.SnippetString): InsertTextFormat {
        return insertText instanceof vscode.SnippetString ? InsertTextFormat.Snippet : InsertTextFormat.PlainText;
    }

    private static toInsertTextMode(keepWhitespace?: boolean): InsertTextMode | undefined {
        if (keepWhitespace === undefined) {
            return undefined;
        }

        const insertTextMode: InsertTextMode = keepWhitespace ? InsertTextMode.asIs : InsertTextMode.adjustIndentation;
        return insertTextMode;
    }

    private static toLspTextEdit(
        newText?: string,
        range?: vscode.Range | { inserting: vscode.Range; replacing: vscode.Range }
    ): TextEdit | InsertReplaceEdit | undefined {
        if (!range) {
            return undefined;
        }
        if (!newText) {
            newText = '';
        }
        const insertingRange = (range as any).inserting;
        if (insertingRange) {
            // do something
        }
        const replacingRange = (range as any).replacing;
        if (replacingRange) {
            // Do something else
        }

        if (!(insertingRange || replacingRange)) {
            const textEdit: TextEdit = {
                newText: newText,
                range: this.toLspRange(<vscode.Range>range),
            };

            return textEdit;
        }

        if (!insertingRange || !replacingRange) {
            // We need both inserting and replacing ranges to convert to InsertReplaceEdit
            return undefined;
        }
        const insertReplaceEdit: InsertReplaceEdit = {
            newText: newText,
            insert: CompletionHandler.toLspRange(insertingRange),
            replace: CompletionHandler.toLspRange(replacingRange),
        };

        return insertReplaceEdit;
    }

    private static toLspRange(range: vscode.Range): Range {
        const lspRange: Range = {
            start: CompletionHandler.toLspPosition(range.start),
            end: CompletionHandler.toLspPosition(range.end),
        };

        return lspRange;
    }

    private static toLspPosition(position: vscode.Position): Position {
        const lspPosition: Position = {
            line: position.line,
            character: position.character,
        };

        return lspPosition;
    }
}
