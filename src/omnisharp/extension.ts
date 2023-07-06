/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as utils from './utils';
import * as vscode from 'vscode';
import { addAssetsIfNecessary } from '../shared/assets';
import { safeLength, sum } from '../common';
import { DotnetWorkspaceConfigurationProvider } from '../shared/workspaceConfigurationProvider';
import { OmniSharpServer } from './server';
import TestManager from '../features/dotnetTest';
import registerCommands from '../features/commands';
import { PlatformInformation } from '../shared/platform';
import { ProjectJsonDeprecatedWarning, OmnisharpStart, RazorDevModeActive } from './loggingEvents';
import { EventStream } from '../eventStream';
import { NetworkSettingsProvider } from '../networkSettings';
import CompositeDisposable from '../compositeDisposable';
import Disposable from '../disposable';
import OptionProvider from '../shared/observers/optionProvider';
import { OmniSharpMonoResolver } from './omniSharpMonoResolver';
import { getMonoVersion } from '../utils/getMonoVersion';
import { LanguageMiddlewareFeature } from './languageMiddlewareFeature';
import { getDecompilationAuthorization } from './decompilationPrompt';
import { DotnetResolver } from './dotnetResolver';
import { Advisor } from '../features/diagnosticsProvider';
import { OmnisharpWorkspaceDebugInformationProvider } from '../omnisharpWorkspaceDebugInformationProvider';

export interface ActivationResult {
    readonly server: OmniSharpServer;
    readonly advisor: Advisor;
    readonly testManager: TestManager;
}

export async function activate(
    context: vscode.ExtensionContext,
    packageJSON: any,
    platformInfo: PlatformInformation,
    provider: NetworkSettingsProvider,
    eventStream: EventStream,
    optionProvider: OptionProvider,
    extensionPath: string,
    outputChannel: vscode.OutputChannel
) {
    console.log('Beginning O# activation');
    const disposables = new CompositeDisposable();

    const options = optionProvider.GetLatestOptions();
    const omnisharpMonoResolver = new OmniSharpMonoResolver(getMonoVersion);
    const omnisharpDotnetResolver = new DotnetResolver(platformInfo);

    const languageMiddlewareFeature = new LanguageMiddlewareFeature();
    languageMiddlewareFeature.register();
    disposables.add(languageMiddlewareFeature);

    const decompilationAuthorized = await getDecompilationAuthorization(context, optionProvider);

    console.log('Constructing server');
    const server = new OmniSharpServer(
        vscode,
        provider,
        packageJSON,
        platformInfo,
        eventStream,
        optionProvider,
        extensionPath,
        omnisharpMonoResolver,
        omnisharpDotnetResolver,
        decompilationAuthorized,
        context,
        outputChannel,
        languageMiddlewareFeature
    );
    console.log('Constructing advisor and test manager');
    const advisor = new Advisor(server, optionProvider); // create before server is started
    const testManager = new TestManager(optionProvider, server, eventStream, languageMiddlewareFeature);
    const workspaceInformationProvider = new OmnisharpWorkspaceDebugInformationProvider(server);

    let registrations: Disposable | undefined;
    disposables.add(
        server.onServerStart(async () => {
            registrations = await server.registerProviders(eventStream, advisor, testManager);
        })
    );

    disposables.add(
        server.onServerStop(() => {
            // remove language feature providers on stop
            registrations?.dispose();
            registrations = undefined;
        })
    );

    console.log('Registering commands');
    disposables.add(
        registerCommands(
            context,
            server,
            platformInfo,
            eventStream,
            optionProvider,
            omnisharpMonoResolver,
            omnisharpDotnetResolver,
            workspaceInformationProvider
        )
    );

    disposables.add(
        server.onServerStart(async () => {
            // Update or add tasks.json and launch.json
            await addAssetsIfNecessary(context, workspaceInformationProvider);
        })
    );

    // After server is started (and projects are loaded), check to see if there are
    // any project.json projects if the suppress option is not set. If so, notify the user about migration.
    const csharpConfig = vscode.workspace.getConfiguration('csharp');
    if (!csharpConfig.get<boolean>('suppressProjectJsonWarning')) {
        disposables.add(
            server.onServerStart(() => {
                utils.requestWorkspaceInformation(server).then((workspaceInfo) => {
                    if (workspaceInfo.DotNet && workspaceInfo.DotNet.Projects.length > 0) {
                        const shortMessage =
                            'project.json is no longer a supported project format for .NET Core applications.';
                        const moreDetailItem: vscode.MessageItem = { title: 'More Detail' };
                        vscode.window.showWarningMessage(shortMessage, moreDetailItem).then((_) => {
                            eventStream.post(new ProjectJsonDeprecatedWarning());
                        });
                    }
                });
            })
        );
    }

    // Send telemetry about the sorts of projects the server was started on.
    disposables.add(
        server.onServerStart(() => {
            const measures: { [key: string]: number } = {};

            utils.requestWorkspaceInformation(server).then((workspaceInfo) => {
                if (workspaceInfo.DotNet && workspaceInfo.DotNet.Projects.length > 0) {
                    measures['projectjson.projectcount'] = workspaceInfo.DotNet.Projects.length;
                    measures['projectjson.filecount'] = sum(workspaceInfo.DotNet.Projects, (p) =>
                        safeLength(p.SourceFiles)
                    );
                }

                if (workspaceInfo.MsBuild && workspaceInfo.MsBuild.Projects.length > 0) {
                    measures['msbuild.projectcount'] = workspaceInfo.MsBuild.Projects.length;
                    measures['msbuild.filecount'] = sum(workspaceInfo.MsBuild.Projects, (p) =>
                        safeLength(p.SourceFiles)
                    );
                    measures['msbuild.unityprojectcount'] = sum(workspaceInfo.MsBuild.Projects, (p) =>
                        p.IsUnityProject ? 1 : 0
                    );
                    measures['msbuild.netcoreprojectcount'] = sum(workspaceInfo.MsBuild.Projects, (p) =>
                        utils.isNetCoreProject(p) ? 1 : 0
                    );
                }

                // TODO: Add measurements for script.

                eventStream.post(new OmnisharpStart('OmniSharp.Start', measures));
            });
        })
    );

    disposables.add(
        server.onBeforeServerStart((path) => {
            if (options.razorOptions.razorDevMode) {
                eventStream.post(new RazorDevModeActive());
            }

            // read and store last solution or folder path
            context.workspaceState.update('lastSolutionPathOrFolder', path);
        })
    );

    console.log('Calling autostart');
    if (options.omnisharpOptions.autoStart) {
        server.autoStart(context.workspaceState.get<string>('lastSolutionPathOrFolder', ''));
    }
    console.log('done autostart');

    // stop server on deactivate
    disposables.add(
        new Disposable(() => {
            testManager.dispose();
            advisor.dispose();
            server.stop();
        })
    );

    // Register ConfigurationProvider
    disposables.add(
        vscode.debug.registerDebugConfigurationProvider(
            'coreclr',
            new DotnetWorkspaceConfigurationProvider(
                workspaceInformationProvider,
                platformInfo,
                optionProvider,
                outputChannel
            )
        )
    );

    console.log('Pushing disposables');
    context.subscriptions.push(disposables);

    console.log('Returning a promise');
    return new Promise<ActivationResult>((resolve) =>
    {
        console.log('calling OnServerStart');

        return server.onServerStart((_) => {
            console.log('Calling resolve');

                return resolve({ server, advisor, testManager });
            });
        }
    );
}
