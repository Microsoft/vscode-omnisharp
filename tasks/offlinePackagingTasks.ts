/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as cp from 'child_process';
import * as del from 'del';
import * as fs from 'fs';
import * as fsextra from 'fs-extra';
import * as gulp from 'gulp';
import * as nbgv from 'nerdbank-gitversioning';
import { Logger } from '../src/logger';
import { PlatformInformation } from '../src/shared/platform';
import { CsharpLoggerObserver } from '../src/shared/observers/csharpLoggerObserver';
import { EventStream } from '../src/eventStream';
import NetworkSettings from '../src/networkSettings';
import { downloadAndInstallPackages } from '../src/packageManager/downloadAndInstallPackages';
import { getRuntimeDependenciesPackages } from '../src/tools/runtimeDependencyPackageUtils';
import { getAbsolutePathPackagesToInstall } from '../src/packageManager/getAbsolutePathPackagesToInstall';
import { commandLineOptions } from '../tasks/commandLineArguments';
import {
    codeExtensionPath,
    packedVsixOutputRoot,
    languageServerDirectory,
    nugetTempPath,
    rootPath,
} from '../tasks/projectPaths';
import { getPackageJSON } from '../tasks/packageJson';
import { createPackageAsync } from '../tasks/vsceTasks';
import { isValidDownload } from '../src/packageManager/isValidDownload';
import path = require('path');
// There are no typings for this library.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const argv = require('yargs').argv;

// Mapping of vsce vsix packaging target to the RID used to build the server executable
export const platformSpecificPackages = [
    { vsceTarget: 'win32-x64', rid: 'win-x64', platformInfo: new PlatformInformation('win32', 'x86_64') },
    { vsceTarget: 'win32-ia32', rid: 'win-x86', platformInfo: new PlatformInformation('win32', 'x86') },
    { vsceTarget: 'win32-arm64', rid: 'win-arm64', platformInfo: new PlatformInformation('win32', 'arm64') },
    { vsceTarget: 'linux-x64', rid: 'linux-x64', platformInfo: new PlatformInformation('linux', 'x86_64') },
    { vsceTarget: 'linux-arm64', rid: 'linux-arm64', platformInfo: new PlatformInformation('linux', 'arm64') },
    { vsceTarget: 'alpine-x64', rid: 'alpine-x64', platformInfo: new PlatformInformation('linux-musl', 'x86_64') },
    { vsceTarget: 'alpine-arm64', rid: 'alpine-arm64', platformInfo: new PlatformInformation('linux-musl', 'arm64') },
    { vsceTarget: 'darwin-x64', rid: 'osx-x64', platformInfo: new PlatformInformation('darwin', 'x86_64') },
    { vsceTarget: 'darwin-arm64', rid: 'osx-arm64', platformInfo: new PlatformInformation('darwin', 'arm64') },
];

gulp.task('vsix:release:package', async () => {
    //if user does not want to clean up the existing vsix packages
    await cleanAsync(/* deleteVsix: */ !commandLineOptions.retainVsix);

    await doPackageOffline();
});

// Downloads dependencies for local development.
gulp.task('installDependencies', async () => {
    await cleanAsync(/* deleteVsix: */ false);

    const packageJSON = getPackageJSON();

    const platform = await PlatformInformation.GetCurrent();

    try {
        await installRoslyn(packageJSON, platform);
        await installDebugger(packageJSON, platform);
        await installRazor(packageJSON, platform);
    } catch (err) {
        const message = (err instanceof Error ? err.stack : err) ?? '<unknown error>';
        // NOTE: Extra `\n---` at the end is because gulp will print this message following by the
        // stack trace of this line. So that seperates the two stack traces.
        throw Error(`Failed to install packages for ${platform}. ${message}\n---`);
    }
});

gulp.task(
    'updateRoslynVersion',
    // Run the fetch of all packages, and then also installDependencies after
    gulp.series(async () => {
        const packageJSON = getPackageJSON();

        // Fetch the neutral package that we don't otherwise have in our platform list
        await acquireRoslyn(packageJSON, undefined, true);

        // And now fetch each platform specific
        for (const p of platformSpecificPackages) {
            await acquireRoslyn(packageJSON, p.platformInfo, true);
        }
    }, 'installDependencies')
);

// Install Tasks
async function installRoslyn(packageJSON: any, platformInfo?: PlatformInformation) {
    const { packagePath, serverPlatform } = await acquireRoslyn(packageJSON, platformInfo, false);

    // Get the directory containing the server executable for the current platform.
    const serverExecutableDirectory = path.join(packagePath, 'content', 'LanguageServer', serverPlatform);
    if (!fs.existsSync(serverExecutableDirectory)) {
        throw new Error(`Failed to find server executable directory at ${serverExecutableDirectory}`);
    }

    console.log(`Extracting Roslyn executables from ${serverExecutableDirectory}`);

    // Copy the files to the language server directory.
    fs.mkdirSync(languageServerDirectory);
    fsextra.copySync(serverExecutableDirectory, languageServerDirectory);
    const languageServerDll = path.join(languageServerDirectory, 'Microsoft.CodeAnalysis.LanguageServer.dll');
    if (!fs.existsSync(languageServerDll)) {
        throw new Error(`Failed to copy server executable`);
    }
}

async function acquireRoslyn(
    packageJSON: any,
    platformInfo: PlatformInformation | undefined,
    interactive: boolean
): Promise<{ packagePath: string; serverPlatform: string }> {
    const roslynVersion = packageJSON.defaults.roslyn;

    // Find the matching server RID for the current platform.
    let serverPlatform: string;
    if (platformInfo === undefined) {
        serverPlatform = 'neutral';
    } else {
        serverPlatform = platformSpecificPackages.find(
            (p) =>
                p.platformInfo.platform === platformInfo.platform &&
                p.platformInfo.architecture === platformInfo.architecture
        )!.rid;
    }

    const packagePath = await acquireNugetPackage(
        `Microsoft.CodeAnalysis.LanguageServer.${serverPlatform}`,
        roslynVersion,
        interactive
    );
    return { packagePath, serverPlatform };
}

async function installRazor(packageJSON: any, platformInfo: PlatformInformation) {
    if (!(await installPackageJsonDependency('Razor', packageJSON, platformInfo))) {
        // Try downloading platform neutral package instead
        const platformNeutral = new PlatformInformation('netural', 'neutral');
        if (!(await installPackageJsonDependency('Razor', packageJSON, platformNeutral))) {
            throw Error('Failed to download package.');
        }
    }
}

async function installDebugger(packageJSON: any, platformInfo: PlatformInformation) {
    if (!(await installPackageJsonDependency('Debugger', packageJSON, platformInfo))) {
        throw Error('Failed to download package.');
    }
}

async function installPackageJsonDependency(
    dependencyName: string,
    packageJSON: any,
    platformInfo: PlatformInformation
): Promise<boolean> {
    const eventStream = new EventStream();
    const logger = new Logger((message) => process.stdout.write(message));
    const stdoutObserver = new CsharpLoggerObserver(logger);
    eventStream.subscribe(stdoutObserver.post);
    const runTimeDependencies = getRuntimeDependenciesPackages(packageJSON).filter(
        (dep) => (dep.isFramework === undefined || !dep.isFramework) && dep.id === dependencyName
    );
    const packagesToInstall = await getAbsolutePathPackagesToInstall(
        runTimeDependencies,
        platformInfo,
        codeExtensionPath
    );
    const provider = () => new NetworkSettings('', true);
    if (!(await downloadAndInstallPackages(packagesToInstall, provider, eventStream, isValidDownload))) {
        return false;
    }

    return true;
}

async function acquireNugetPackage(packageName: string, packageVersion: string, interactive: boolean): Promise<string> {
    packageName = packageName.toLocaleLowerCase();
    const packageOutputPath = path.join(nugetTempPath, packageName, packageVersion);
    if (fs.existsSync(packageOutputPath)) {
        // Package is already downloaded, no need to download again.
        console.log(`Reusing existing download of ${packageName}.${packageVersion}`);
        return packageOutputPath;
    }

    const dotnetArgs = [
        'restore',
        path.join(rootPath, 'server'),
        `/p:PackageName=${packageName}`,
        `/p:PackageVersion=${packageVersion}`,
    ];

    if (interactive) {
        dotnetArgs.push('--interactive');
    }

    const process = cp.spawn('dotnet', dotnetArgs, { stdio: 'inherit' });
    await new Promise((resolve) => {
        process.on('exit', (exitCode, _) => {
            if (exitCode !== 0) {
                throw new Error(`Failed to download nuget package ${packageName}.${packageVersion}`);
            }
            resolve(undefined);
        });
    });

    if (!fs.existsSync(packageOutputPath)) {
        throw new Error(`Failed to find downloaded package at ${packageOutputPath}`);
    }

    return packageOutputPath;
}

async function doPackageOffline() {
    // Set the package.json version based on the value in version.json.
    const versionInfo = await nbgv.getVersion();
    console.log(versionInfo.npmPackageVersion);
    await nbgv.setPackageVersion();

    let prerelease: boolean;
    if (argv.prerelease) {
        console.log('Packaging prerelease version.');
        prerelease = true;
    } else {
        console.log('Packaging release version.');
        prerelease = false;
    }

    try {
        // Now that we've updated the version, get the package.json.
        const packageJSON = getPackageJSON();

        for (const p of platformSpecificPackages) {
            try {
                if (process.platform === 'win32' && !p.rid.startsWith('win')) {
                    console.warn(
                        `Skipping packaging for ${p.rid} on Windows since runtime executables will not be marked executable in *nix packages.`
                    );
                    continue;
                }

                await buildVsix(packageJSON, packedVsixOutputRoot, prerelease, p.vsceTarget, p.platformInfo);
            } catch (err) {
                const message = (err instanceof Error ? err.stack : err) ?? '<unknown error>';
                // NOTE: Extra `\n---` at the end is because gulp will print this message following by the
                // stack trace of this line. So that seperates the two stack traces.
                throw Error(`Failed to create package ${p.vsceTarget}. ${message}\n---`);
            }
        }

        // Also output the platform neutral VSIX using the platform neutral server bits we created before.
        await buildVsix(packageJSON, packedVsixOutputRoot, prerelease);
    } finally {
        // Reset package version to the placeholder value.
        await nbgv.resetPackageVersionPlaceholder();
    }
}

async function cleanAsync(deleteVsix: boolean) {
    await del(['install.*', '.omnisharp*', '.debugger', '.razor', languageServerDirectory]);

    if (deleteVsix) {
        await del('*.vsix');
    }
}

async function buildVsix(
    packageJSON: any,
    outputFolder: string,
    prerelease: boolean,
    vsceTarget?: string,
    platformInfo?: PlatformInformation
) {
    await cleanAsync(false);

    await installRoslyn(packageJSON, platformInfo);

    if (platformInfo != null) {
        await installRazor(packageJSON, platformInfo);
        await installDebugger(packageJSON, platformInfo);
    }

    const packageFileName = getPackageName(packageJSON, vsceTarget);
    await createPackageAsync(outputFolder, prerelease, packageFileName, vsceTarget);
}

function getPackageName(packageJSON: any, vscodePlatformId?: string) {
    const name = packageJSON.name;
    const version = packageJSON.version;

    if (vscodePlatformId) {
        return `${name}-${vscodePlatformId}-${version}.vsix`;
    } else {
        return `${name}-${version}.vsix`;
    }
}
