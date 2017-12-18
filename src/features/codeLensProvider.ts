/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import * as protocol from '../omnisharp/protocol';
import * as serverUtils from '../omnisharp/utils';
import * as vscode from 'vscode';

import { toLocation, toRange } from '../omnisharp/typeConvertion';

import AbstractProvider from './abstractProvider';
import { OmniSharpServer } from '../omnisharp/server';
import { Options } from '../omnisharp/options';
import TelemetryReporter from 'vscode-extension-telemetry';
import TestManager from './dotnetTest';

class OmniSharpCodeLens extends vscode.CodeLens {

    fileName: string;

    constructor(fileName: string, range: vscode.Range) {
        super(range);
        this.fileName = fileName;
    }
}

export default class OmniSharpCodeLensProvider extends AbstractProvider implements vscode.CodeLensProvider {

    private _options: Options;

    constructor(server: OmniSharpServer, reporter: TelemetryReporter, testManager: TestManager)
    {
        super(server, reporter);

        this._resetCachedOptions();

        let configChangedDisposable = vscode.workspace.onDidChangeConfiguration(this._resetCachedOptions, this);
        this.addDisposables(configChangedDisposable);
    }

    private _resetCachedOptions(): void {
        this._options = Options.Read();
    }

    private static filteredSymbolNames: { [name: string]: boolean } = {
        'Equals': true,
        'Finalize': true,
        'GetHashCode': true,
        'ToString': true
    };

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (!this._options.showReferencesCodeLens && !this._options.showTestsCodeLens)
        {
            return [];
        }

        return serverUtils.currentFileMembersAsTree(this._server, { FileName: document.fileName }, token).then(tree => {
            let ret: vscode.CodeLens[] = [];
            tree.TopLevelTypeDefinitions.forEach(node => this._convertQuickFix(ret, document.fileName, node));
            return ret;
        });
    }

    private _convertQuickFix(bucket: vscode.CodeLens[], fileName: string, node: protocol.Node): void {

        if (node.Kind === 'MethodDeclaration' && OmniSharpCodeLensProvider.filteredSymbolNames[node.Location.Text]) {
            return;
        }

        let lens = new OmniSharpCodeLens(fileName, toRange(node.Location));
        if (this._options.showReferencesCodeLens) {
            bucket.push(lens);
        }

        for (let child of node.ChildNodes) {
            this._convertQuickFix(bucket, fileName, child);
        }

        if (this._options.showTestsCodeLens) {
            this._updateCodeLensForTest(bucket, fileName, node);
        }
    }

    resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken): Thenable<vscode.CodeLens> {
        if (codeLens instanceof OmniSharpCodeLens) {

            let req = <protocol.FindUsagesRequest>{
                FileName: codeLens.fileName,
                Line: codeLens.range.start.line + 1,
                Column: codeLens.range.start.character + 1,
                OnlyThisFile: false,
                ExcludeDefinition: true
            };

            return serverUtils.findUsages(this._server, req, token).then(res => {
                if (!res || !Array.isArray(res.QuickFixes)) {
                    return;
                }

                let len = res.QuickFixes.length;
                codeLens.command = {
                    title: len === 1 ? '1 reference' : `${len} references`,
                    command: 'editor.action.showReferences',
                    arguments: [vscode.Uri.file(req.FileName), codeLens.range.start, res.QuickFixes.map(toLocation)]
                };

                return codeLens;
            });
        }
    }

    private _updateCodeLensForTest(bucket: vscode.CodeLens[], fileName: string, node: protocol.Node) {
        // backward compatible check: Features property doesn't present on older version OmniSharp
        if (node.Features === undefined) {
            return;
        }

        let testFeature = node.Features.find(value => (value.Name == 'XunitTestMethod' || value.Name == 'NUnitTestMethod' || value.Name == 'MSTestMethod'));
        if (testFeature) {
            // this test method has a test feature
            let testFrameworkName = 'xunit';
            if (testFeature.Name == 'NUnitTestMethod') {
                testFrameworkName = 'nunit';
            }
            else if (testFeature.Name == 'MSTestMethod') {
                testFrameworkName = 'mstest';
            }

            bucket.push(new vscode.CodeLens(
                toRange(node.Location),
                { title: "run test", command: 'dotnet.test.run', arguments: [testFeature.Data, fileName, testFrameworkName] }));

            bucket.push(new vscode.CodeLens(
                toRange(node.Location),
                { title: "debug test", command: 'dotnet.test.debug', arguments: [testFeature.Data, fileName, testFrameworkName] }));
        }
    }
}
