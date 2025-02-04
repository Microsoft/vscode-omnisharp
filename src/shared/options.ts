/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { DocumentSelector } from 'vscode-languageserver-protocol';
import * as path from 'path';

export interface CommonOptions {
    readonly waitForDebugger: boolean;
    readonly serverPath: string;
    readonly useOmnisharpServer: boolean;
    readonly excludePaths: string[];

    /** The default solution; this has been normalized to a full file path from the workspace folder it was configured in, or the string "disable" if that has been disabled */
    readonly defaultSolution: string;
    readonly unitTestDebuggingOptions: object;
    readonly runSettingsPath: string;
    readonly organizeImportsOnFormat: boolean;
}

export interface OmnisharpServerOptions {
    readonly useModernNet: boolean;
    readonly monoPath: string;
    readonly loggingLevel: string;
    readonly autoStart: boolean;
    readonly projectFilesExcludePattern: string;
    readonly projectLoadTimeout: number;
    readonly maxProjectResults: number;
    readonly useEditorFormattingSettings: boolean;
    readonly enableRoslynAnalyzers: boolean;
    readonly enableEditorConfigSupport: boolean;
    readonly enableDecompilationSupport: boolean;
    readonly enableImportCompletion: boolean;
    readonly enableAsyncCompletion: boolean;
    readonly analyzeOpenDocumentsOnly: boolean;
    readonly disableMSBuildDiagnosticWarning: boolean;
    readonly showOmnisharpLogOnError: boolean;
    readonly minFindSymbolsFilterLength: number;
    readonly maxFindSymbolsItems: number;
    readonly enableMsBuildLoadProjectsOnDemand: boolean;
    readonly sdkPath: string;
    readonly sdkVersion: string;
    readonly sdkIncludePrereleases: boolean;
    readonly dotNetCliPaths: string[];
    readonly useFormatting: boolean;
    readonly showReferencesCodeLens: boolean;
    readonly showTestsCodeLens: boolean;
    readonly filteredSymbolsCodeLens: string[];
    readonly disableCodeActions: boolean;
    readonly useSemanticHighlighting: boolean;
    readonly inlayHintsEnableForParameters: boolean;
    readonly inlayHintsForLiteralParameters: boolean;
    readonly inlayHintsForObjectCreationParameters: boolean;
    readonly inlayHintsForIndexerParameters: boolean;
    readonly inlayHintsForOtherParameters: boolean;
    readonly inlayHintsSuppressForParametersThatDifferOnlyBySuffix: boolean;
    readonly inlayHintsSuppressForParametersThatMatchMethodIntent: boolean;
    readonly inlayHintsSuppressForParametersThatMatchArgumentName: boolean;
    readonly inlayHintsEnableForTypes: boolean;
    readonly inlayHintsForImplicitVariableTypes: boolean;
    readonly inlayHintsForLambdaParameterTypes: boolean;
    readonly inlayHintsForImplicitObjectCreation: boolean;
    readonly maxProjectFileCountForDiagnosticAnalysis: number;
    readonly suppressDotnetRestoreNotification: boolean;
    readonly enableLspDriver?: boolean | null;
    readonly dotnetPath: string;
}

export interface LanguageServerOptions {
    readonly documentSelector: DocumentSelector;
    readonly extensionsPaths: string[] | null;
    readonly preferCSharpExtension: boolean;
    readonly startTimeout: number;
    readonly crashDumpPath: string | undefined;
    readonly analyzerDiagnosticScope: string;
    readonly compilerDiagnosticScope: string;
    readonly componentPaths: { [key: string]: string } | null;
    readonly enableXamlTools: boolean;
    readonly suppressLspErrorToasts: boolean;
    readonly suppressMiscellaneousFilesToasts: boolean;
    readonly useServerGC: boolean;
    readonly reportInformationAsHint: boolean;
}

export interface RazorOptions {
    readonly razorDevMode: boolean;
    readonly razorPluginPath: string;
    readonly razorServerPath: string;
}

class CommonOptionsImpl implements CommonOptions {
    public get waitForDebugger() {
        return readOption<boolean>('dotnet.server.waitForDebugger', false, 'omnisharp.waitForDebugger');
    }
    public get serverPath() {
        return readOption<string>('dotnet.server.path', '', 'omnisharp.path', 'csharp.omnisharp');
    }
    public get useOmnisharpServer() {
        return readOption<boolean>('dotnet.server.useOmnisharp', false);
    }
    public get excludePaths() {
        return getExcludedPaths();
    }

    /** The default solution; this has been normalized to a full file path from the workspace folder it was configured in, or the string "disable" if that has been disabled */
    public get defaultSolution() {
        let defaultSolution = '';
        const defaultSolutionFromWorkspace = readOption<string>(
            'dotnet.defaultSolution',
            '',
            'omnisharp.defaultLaunchSolution'
        );

        // If the workspace has defaultSolution disabled, just be done
        if (defaultSolutionFromWorkspace === 'disable') {
            defaultSolution = 'disable';
        } else {
            if (vscode.workspace.workspaceFolders !== undefined) {
                // If this is multi-folder, then check to see if we have a fully qualified path set directly in the workspace settings; this will let the user directly specify in their
                // workspace settings which one is active in the case of a multi-folder workspace. This has to be absolute because in this case, there's no clear folder to resolve a relative
                // path against.
                if (vscode.workspace.workspaceFolders.length > 1) {
                    if (path.isAbsolute(defaultSolutionFromWorkspace)) {
                        defaultSolution = defaultSolutionFromWorkspace;
                    }
                }

                // If we didn't have an absolute workspace setting, then check each workspace folder and resolve any relative paths against it
                if (defaultSolution == '') {
                    for (const workspaceFolder of vscode.workspace.workspaceFolders) {
                        const workspaceFolderConfig = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);
                        const defaultSolutionFromWorkspaceFolder = readOptionFromConfig<string>(
                            workspaceFolderConfig,
                            'dotnet.defaultSolution',
                            '',
                            'omnisharp.defaultLaunchSolution'
                        );
                        if (
                            defaultSolutionFromWorkspaceFolder !== '' &&
                            defaultSolutionFromWorkspaceFolder !== 'disable'
                        ) {
                            defaultSolution = path.join(workspaceFolder.uri.fsPath, defaultSolutionFromWorkspaceFolder);
                            break;
                        }
                    }
                }
            }
        }

        return defaultSolution;
    }

    public get unitTestDebuggingOptions() {
        return readOption<object>('dotnet.unitTestDebuggingOptions', {}, 'csharp.unitTestDebuggingOptions');
    }
    public get runSettingsPath() {
        return readOption<string>('dotnet.unitTests.runSettingsPath', '', 'omnisharp.testRunSettings');
    }
    public get organizeImportsOnFormat() {
        return readOption<boolean>('dotnet.formatting.organizeImportsOnFormat', false);
    }
}

class OmnisharpOptionsImpl implements OmnisharpServerOptions {
    public get useModernNet() {
        return readOption<boolean>('omnisharp.useModernNet', true);
    }
    public get monoPath() {
        return readOption<string>('omnisharp.monoPath', '');
    }
    public get loggingLevel() {
        let loggingLevel = readOption<string>('omnisharp.loggingLevel', 'information');
        if (loggingLevel && loggingLevel.toLowerCase() === 'verbose') {
            loggingLevel = 'debug';
        }
        return loggingLevel;
    }
    public get autoStart() {
        return readOption<boolean>('omnisharp.autoStart', true);
    }
    public get projectFilesExcludePattern() {
        return readOption<string>(
            'omnisharp.projectFilesExcludePattern',
            '**/node_modules/**,**/.git/**,**/bower_components/**'
        );
    }
    public get projectLoadTimeout() {
        return readOption<number>('omnisharp.projectLoadTimeout', 60);
    }
    public get maxProjectResults() {
        return readOption<number>('omnisharp.maxProjectResults', 250);
    }
    public get useEditorFormattingSettings() {
        return readOption<boolean>('omnisharp.useEditorFormattingSettings', true);
    }
    public get enableRoslynAnalyzers() {
        const enableRoslynAnalyzersLegacyOption = readOption<boolean>('omnisharp.enableRoslynAnalyzers', false);

        const diagnosticAnalysisScope = readOption<string>(
            'dotnet.backgroundAnalysis.analyzerDiagnosticsScope',
            commonOptions.useOmnisharpServer ? 'none' : 'openFiles'
        );
        const enableRoslynAnalyzersNewOption = diagnosticAnalysisScope != 'none';
        return enableRoslynAnalyzersLegacyOption || enableRoslynAnalyzersNewOption;
    }
    public get enableEditorConfigSupport() {
        return readOption<boolean>('omnisharp.enableEditorConfigSupport', true);
    }
    public get enableDecompilationSupport() {
        return readOption<boolean>('omnisharp.enableDecompilationSupport', false);
    }
    public get enableImportCompletion() {
        return readOption<boolean>(
            'dotnet.completion.showCompletionItemsFromUnimportedNamespaces',
            false,
            'omnisharp.enableImportCompletion'
        );
    }
    public get enableAsyncCompletion() {
        return readOption<boolean>('omnisharp.enableAsyncCompletion', false);
    }
    public get analyzeOpenDocumentsOnly() {
        const analyzeOpenDocumentsOnlyLegacyOption = readOption<boolean>('omnisharp.analyzeOpenDocumentsOnly', false);

        const diagnosticAnalysisScope = readOption<string>(
            'dotnet.backgroundAnalysis.analyzerDiagnosticsScope',
            commonOptions.useOmnisharpServer ? 'none' : 'openFiles'
        );
        const analyzeOpenDocumentsOnlyNewOption = diagnosticAnalysisScope == 'openFiles';
        return analyzeOpenDocumentsOnlyLegacyOption || analyzeOpenDocumentsOnlyNewOption;
    }
    public get disableMSBuildDiagnosticWarning() {
        return readOption<boolean>('omnisharp.disableMSBuildDiagnosticWarning', false);
    }
    public get showOmnisharpLogOnError() {
        return readOption<boolean>('csharp.showOmnisharpLogOnError', true);
    }
    public get minFindSymbolsFilterLength() {
        return readOption<number>('omnisharp.minFindSymbolsFilterLength', 0);
    }
    public get maxFindSymbolsItems() {
        return readOption<number>('omnisharp.maxFindSymbolsItems', 1000);
    }
    public get enableMsBuildLoadProjectsOnDemand() {
        return readOption<boolean>('omnisharp.enableMsBuildLoadProjectsOnDemand', false);
    }
    public get sdkPath() {
        return readOption<string>('omnisharp.sdkPath', '');
    }
    public get sdkVersion() {
        return readOption<string>('omnisharp.sdkVersion', '');
    }
    public get sdkIncludePrereleases() {
        return readOption<boolean>('omnisharp.sdkIncludePrereleases', true);
    }
    public get dotNetCliPaths() {
        return readOption<string[]>('omnisharp.dotNetCliPaths', []);
    }
    public get useFormatting() {
        return readOption<boolean>('csharp.format.enable', true);
    }
    public get showReferencesCodeLens() {
        return readOption<boolean>(
            'dotnet.codeLens.enableReferencesCodeLens',
            true,
            'csharp.referencesCodeLens.enabled'
        );
    }
    public get showTestsCodeLens() {
        return readOption<boolean>('dotnet.codeLens.enableTestsCodeLens', true, 'csharp.testsCodeLens.enabled');
    }
    public get filteredSymbolsCodeLens() {
        return readOption<string[]>('csharp.referencesCodeLens.filteredSymbols', []);
    }
    public get disableCodeActions() {
        return readOption<boolean>('csharp.disableCodeActions', false);
    }
    public get useSemanticHighlighting() {
        return readOption<boolean>('csharp.semanticHighlighting.enabled', true);
    }
    public get inlayHintsEnableForParameters() {
        return readOption<boolean>(
            'dotnet.inlayHints.enableInlayHintsForParameters',
            false,
            'csharp.inlayHints.parameters.enabled'
        );
    }
    public get inlayHintsForLiteralParameters() {
        return readOption<boolean>(
            'dotnet.inlayHints.enableInlayHintsForLiteralParameters',
            false,
            'csharp.inlayHints.parameters.forLiteralParameters'
        );
    }
    public get inlayHintsForObjectCreationParameters() {
        return readOption<boolean>(
            'dotnet.inlayHints.enableInlayHintsForObjectCreationParameters',
            false,
            'csharp.inlayHints.parameters.forObjectCreationParameters'
        );
    }
    public get inlayHintsForIndexerParameters() {
        return readOption<boolean>(
            'dotnet.inlayHints.enableInlayHintsForIndexerParameters',
            false,
            'csharp.inlayHints.parameters.forIndexerParameters'
        );
    }
    public get inlayHintsForOtherParameters() {
        return readOption<boolean>(
            'dotnet.inlayHints.enableInlayHintsForOtherParameters',
            false,
            'csharp.inlayHints.parameters.forOtherParameters'
        );
    }
    public get inlayHintsSuppressForParametersThatDifferOnlyBySuffix() {
        return readOption<boolean>(
            'dotnet.inlayHints.suppressInlayHintsForParametersThatDifferOnlyBySuffix',
            false,
            'csharp.inlayHints.parameters.suppressForParametersThatDifferOnlyBySuffix'
        );
    }
    public get inlayHintsSuppressForParametersThatMatchMethodIntent() {
        return readOption<boolean>(
            'dotnet.inlayHints.suppressInlayHintsForParametersThatMatchMethodIntent',
            false,
            'csharp.inlayHints.parameters.suppressForParametersThatMatchMethodIntent'
        );
    }
    public get inlayHintsSuppressForParametersThatMatchArgumentName() {
        return readOption<boolean>(
            'dotnet.inlayHints.suppressInlayHintsForParametersThatMatchArgumentName',
            false,
            'csharp.inlayHints.parameters.suppressForParametersThatMatchArgumentName'
        );
    }
    public get inlayHintsEnableForTypes() {
        return readOption<boolean>(
            'csharp.inlayHints.enableInlayHintsForTypes',
            false,
            'csharp.inlayHints.types.enabled'
        );
    }
    public get inlayHintsForImplicitVariableTypes() {
        return readOption<boolean>(
            'csharp.inlayHints.enableInlayHintsForImplicitVariableTypes',
            false,
            'csharp.inlayHints.types.forImplicitVariableTypes'
        );
    }
    public get inlayHintsForLambdaParameterTypes() {
        return readOption<boolean>(
            'csharp.inlayHints.enableInlayHintsForLambdaParameterTypes',
            false,
            'csharp.inlayHints.types.forLambdaParameterTypes'
        );
    }
    public get inlayHintsForImplicitObjectCreation() {
        return readOption<boolean>(
            'csharp.inlayHints.enableInlayHintsForImplicitObjectCreation',
            false,
            'csharp.inlayHints.types.forImplicitObjectCreation'
        );
    }
    public get maxProjectFileCountForDiagnosticAnalysis() {
        return readOption<number>('csharp.maxProjectFileCountForDiagnosticAnalysis', 1000);
    }
    public get suppressDotnetRestoreNotification() {
        return readOption<boolean>('csharp.suppressDotnetRestoreNotification', false);
    }
    public get enableLspDriver() {
        return readOption<boolean>('omnisharp.enableLspDriver', false);
    }
    public get dotnetPath() {
        return readOption<string>('omnisharp.dotnetPath', '');
    }
}

class LanguageServerOptionsImpl implements LanguageServerOptions {
    public get documentSelector() {
        return readOption<DocumentSelector>('dotnet.server.documentSelector', ['csharp']);
    }
    public get extensionsPaths() {
        return readOption<string[] | null>('dotnet.server.extensionPaths', null);
    }
    public get preferCSharpExtension() {
        return readOption<boolean>('dotnet.preferCSharpExtension', false);
    }
    public get startTimeout() {
        return readOption<number>('dotnet.server.startTimeout', 30000);
    }
    public get crashDumpPath() {
        return readOption<string | undefined>('dotnet.server.crashDumpPath', undefined);
    }
    public get analyzerDiagnosticScope() {
        return readOption<string>('dotnet.backgroundAnalysis.analyzerDiagnosticsScope', 'openFiles');
    }
    public get compilerDiagnosticScope() {
        return readOption<string>('dotnet.backgroundAnalysis.compilerDiagnosticsScope', 'openFiles');
    }
    public get componentPaths() {
        return readOption<{ [key: string]: string }>('dotnet.server.componentPaths', {});
    }
    public get enableXamlTools() {
        return readOption<boolean>('dotnet.enableXamlTools', true);
    }
    public get suppressLspErrorToasts() {
        return readOption<boolean>('dotnet.server.suppressLspErrorToasts', false);
    }
    public get suppressMiscellaneousFilesToasts() {
        return readOption<boolean>('dotnet.server.suppressMiscellaneousFilesToasts', false);
    }
    public get useServerGC() {
        return readOption<boolean>('dotnet.server.useServerGC', true);
    }
    public get reportInformationAsHint() {
        return readOption<boolean>('dotnet.diagnostics.reportInformationAsHint', false);
    }
}

class RazorOptionsImpl implements RazorOptions {
    public get razorDevMode() {
        return readOption<boolean>('razor.devmode', false);
    }
    public get razorPluginPath() {
        return readOption<string>('razor.plugin.path', '');
    }
    public get razorServerPath() {
        return readOption<string>('razor.languageServer.directory', '');
    }
}

export const commonOptions: CommonOptions = new CommonOptionsImpl();
export const omnisharpOptions: OmnisharpServerOptions = new OmnisharpOptionsImpl();
export const languageServerOptions: LanguageServerOptions = new LanguageServerOptionsImpl();
export const razorOptions: RazorOptions = new RazorOptionsImpl();

function getExcludedPaths(): string[] {
    const workspaceConfig = vscode.workspace.getConfiguration();

    const excludePaths = getExcludes(workspaceConfig, 'files.exclude');
    return excludePaths;

    function getExcludes(config: vscode.WorkspaceConfiguration, option: string): string[] {
        const optionValue = config.get<{ [i: string]: boolean }>(option, {});
        return Object.entries(optionValue)
            .filter(([_, value]) => value)
            .map(([key, _]) => key);
    }
}

/**
 * Reads an option from the vscode config with an optional back compat parameter.
 */
function readOptionFromConfig<T>(
    config: vscode.WorkspaceConfiguration,
    option: string,
    defaultValue: T,
    ...backCompatOptionNames: string[]
): T {
    let value = config.get<T>(option);

    if (value === undefined && backCompatOptionNames.length > 0) {
        // Search the back compat options for a defined value.
        value = backCompatOptionNames.map((name) => config.get<T>(name)).find((val) => val);
    }

    return value ?? defaultValue;
}

function readOption<T>(option: string, defaultValue: T, ...backCompatOptionNames: string[]): T {
    return readOptionFromConfig(vscode.workspace.getConfiguration(), option, defaultValue, ...backCompatOptionNames);
}

export const CommonOptionsThatTriggerReload: ReadonlyArray<keyof CommonOptions> = [
    'waitForDebugger',
    'serverPath',
    'useOmnisharpServer',
];

export const OmnisharpOptionsThatTriggerReload: ReadonlyArray<keyof OmnisharpServerOptions> = [
    'dotnetPath',
    'enableMsBuildLoadProjectsOnDemand',
    'loggingLevel',
    'enableEditorConfigSupport',
    'enableDecompilationSupport',
    'enableImportCompletion',
    'enableAsyncCompletion',
    'useModernNet',
    'enableLspDriver',
    'sdkPath',
    'sdkVersion',
    'sdkIncludePrereleases',
    'analyzeOpenDocumentsOnly',
    'enableRoslynAnalyzers',
    'inlayHintsEnableForParameters',
    'inlayHintsForLiteralParameters',
    'inlayHintsForObjectCreationParameters',
    'inlayHintsForIndexerParameters',
    'inlayHintsForOtherParameters',
    'inlayHintsSuppressForParametersThatDifferOnlyBySuffix',
    'inlayHintsSuppressForParametersThatMatchMethodIntent',
    'inlayHintsSuppressForParametersThatMatchArgumentName',
    'inlayHintsEnableForTypes',
    'inlayHintsForImplicitVariableTypes',
    'inlayHintsForLambdaParameterTypes',
    'inlayHintsForImplicitObjectCreation',
];

export const LanguageServerOptionsThatTriggerReload: ReadonlyArray<keyof LanguageServerOptions> = [
    'documentSelector',
    'preferCSharpExtension',
    'componentPaths',
    'enableXamlTools',
    'useServerGC',
];
