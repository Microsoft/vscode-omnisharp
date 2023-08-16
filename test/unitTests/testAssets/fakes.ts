/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from '../../../src/vscodeAdapter';
import * as protocol from '../../../src/omnisharp/protocol';
import {
    DocumentSelector,
    MessageItem,
    TextDocument,
    Uri,
    GlobPattern,
    ConfigurationChangeEvent,
    Disposable,
} from '../../../src/vscodeAdapter';
import { ITelemetryReporter } from '../../../src/observers/telemetryObserver';
import { MSBuildDiagnosticsMessage } from '../../../src/omnisharp/protocol';
import {
    OmnisharpServerMsBuildProjectDiagnostics,
    OmnisharpServerOnError,
    OmnisharpServerUnresolvedDependencies,
    WorkspaceInformationUpdated,
} from '../../../src/omnisharp/loggingEvents';

export const getNullChannel = (): vscode.OutputChannel => {
    const returnChannel: vscode.OutputChannel = {
        name: '',
        append: (_value: string) => {
            /** empty */
        },
        appendLine: (_value: string) => {
            /** empty */
        },
        clear: () => {
            /** empty */
        },
        show: (_preserveFocusOrColumn?: boolean | vscode.ViewColumn, _preserveFocus?: boolean) => {
            /** empty */
        },
        hide: () => {
            /** empty */
        },
        dispose: () => {
            /** empty */
        },
    };
    return returnChannel;
};

export const getNullTelemetryReporter = (): ITelemetryReporter => {
    const reporter: ITelemetryReporter = {
        sendTelemetryEvent: (
            _eventName: string,
            _properties?: { [key: string]: string },
            _measures?: { [key: string]: number }
        ) => {
            /** empty */
        },
        sendTelemetryErrorEvent: (
            _eventName: string,
            _properties?: { [key: string]: string },
            _measures?: { [key: string]: number },
            _errorProps?: string[]
        ) => {
            /** empty */
        },
    };

    return reporter;
};

export const getWorkspaceConfiguration = (): vscode.WorkspaceConfiguration => {
    const values: { [key: string]: any } = {};

    const configuration: vscode.WorkspaceConfiguration = {
        get<T>(section: string, defaultValue?: T): T | undefined {
            const result = <T>values[section];
            return result ?? defaultValue;
        },
        has: (section: string) => {
            return values[section] !== undefined;
        },
        inspect: () => {
            throw new Error('Not Implemented');
        },
        update: async (section: string, value: any, _configurationTarget?: vscode.ConfigurationTarget | boolean) => {
            values[section] = value;
            return Promise.resolve();
        },
    };

    return configuration;
};

export function getOmnisharpMSBuildProjectDiagnosticsEvent(
    fileName: string,
    warnings: MSBuildDiagnosticsMessage[],
    errors: MSBuildDiagnosticsMessage[]
): OmnisharpServerMsBuildProjectDiagnostics {
    return new OmnisharpServerMsBuildProjectDiagnostics({
        FileName: fileName,
        Warnings: warnings,
        Errors: errors,
    });
}

export function getMSBuildDiagnosticsMessage(
    logLevel: string,
    fileName: string,
    text: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
): MSBuildDiagnosticsMessage {
    return {
        LogLevel: logLevel,
        FileName: fileName,
        Text: text,
        StartLine: startLine,
        StartColumn: startColumn,
        EndLine: endLine,
        EndColumn: endColumn,
    };
}

export function getOmnisharpServerOnErrorEvent(
    text: string,
    fileName: string,
    line: number,
    column: number
): OmnisharpServerOnError {
    return new OmnisharpServerOnError({
        Text: text,
        FileName: fileName,
        Line: line,
        Column: column,
    });
}

export function getUnresolvedDependenices(fileName: string): OmnisharpServerUnresolvedDependencies {
    return new OmnisharpServerUnresolvedDependencies({
        UnresolvedDependencies: [],
        FileName: fileName,
    });
}

export function getFakeVsCode(): vscode.vscode {
    return {
        commands: {
            executeCommand: <_T>(_command: string, ..._rest: any[]) => {
                throw new Error('Not Implemented');
            },
        },
        languages: {
            match: (_selector: DocumentSelector, _document: TextDocument) => {
                throw new Error('Not Implemented');
            },
        },
        window: {
            activeTextEditor: undefined,
            showInformationMessage: <T extends MessageItem>(_message: string, ..._items: T[]) => {
                throw new Error('Not Implemented');
            },
            showWarningMessage: <T extends MessageItem>(_message: string, ..._items: T[]) => {
                throw new Error('Not Implemented');
            },
            showErrorMessage: (_message: string, ..._items: string[]) => {
                throw new Error('Not Implemented');
            },
        },
        workspace: {
            workspaceFolders: undefined,
            getConfiguration: (_section?: string, _resource?: Uri) => {
                throw new Error('Not Implemented');
            },
            asRelativePath: (_pathOrUri: string | Uri, _includeWorkspaceFolder?: boolean) => {
                throw new Error('Not Implemented');
            },
            createFileSystemWatcher: (
                _globPattern: GlobPattern,
                _ignoreCreateEvents?: boolean,
                _ignoreChangeEvents?: boolean,
                _ignoreDeleteEvents?: boolean
            ) => {
                throw new Error('Not Implemented');
            },
            onDidChangeConfiguration: (
                _listener: (e: ConfigurationChangeEvent) => any,
                _thisArgs?: any,
                _disposables?: Disposable[]
            ): Disposable => {
                throw new Error('Not Implemented');
            },
        },
        extensions: {
            all: [],
            getExtension: () => {
                throw new Error('Not Implemented');
            },
        },
        Uri: {
            parse: () => {
                throw new Error('Not Implemented');
            },
        },
        version: '',
        env: {
            appName: '',
            appRoot: '',
            language: '',
            clipboard: {
                writeText: () => {
                    throw new Error('Not Implemented');
                },
                readText: () => {
                    throw new Error('Not Implemented');
                },
            },
            machineId: '',
            sessionId: '',
            openExternal: () => {
                throw new Error('Not Implemented');
            },
        },
    };
}

export function getMSBuildWorkspaceInformation(
    msBuildSolutionPath: string,
    msBuildProjects: protocol.MSBuildProject[]
): protocol.MsBuildWorkspaceInformation {
    return {
        SolutionPath: msBuildSolutionPath,
        Projects: msBuildProjects,
    };
}

export function getWorkspaceInformationUpdated(
    MsBuild: protocol.MsBuildWorkspaceInformation | undefined
): WorkspaceInformationUpdated {
    return new WorkspaceInformationUpdated({
        MsBuild,
    });
}

export function getVSCodeWithConfig() {
    const vscode = getFakeVsCode();

    const _vscodeConfig = getWorkspaceConfiguration();

    vscode.workspace.getConfiguration = (_section, _resource) => {
        return _vscodeConfig;
    };

    return vscode;
}

export function updateConfig(vscode: vscode.vscode, section: string | undefined, config: string, value: any) {
    const workspaceConfig = vscode.workspace.getConfiguration(section);
    const configEntry = section ? `${section}.${config}` : config;
    workspaceConfig.update(configEntry, value);
}
