/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';
import * as util from './common';

const unknown = 'unknown';

/**
 * There is no standard way on Linux to find the distribution name and version.
 * Recently, systemd has pushed to standardize the os-release file. This has
 * seen adoption in "recent" versions of all major distributions.
 * https://www.freedesktop.org/software/systemd/man/os-release.html
 */
export class LinuxDistribution {
    constructor(
        public name: string,
        public version: string) { }

    public static GetCurrent(): Promise<LinuxDistribution> {
        // Try /etc/os-release and fallback to /usr/lib/os-release per the synopsis
        // at https://www.freedesktop.org/software/systemd/man/os-release.html.
        return LinuxDistribution.FromFilePath('/etc/os-release')
            .catch(() => LinuxDistribution.FromFilePath('/usr/lib/os-release'))
            .catch(() => Promise.resolve(new LinuxDistribution(unknown, unknown)));
    }

    private static FromFilePath(filePath: string): Promise<LinuxDistribution> {
        return new Promise<LinuxDistribution>((resolve, reject) => {
            fs.readFile(filePath, 'utf8', (error, data) => {
                if (error) {
                    reject(error);
                }
                else {
                    resolve(LinuxDistribution.FromReleaseInfo(data));
                }
            });
        });
    }

    public static FromReleaseInfo(releaseInfo: string, eol: string = os.EOL): LinuxDistribution {
        let name = unknown;
        let version = unknown;

        const lines = releaseInfo.split(eol);
        for (let line of lines) {
            line = line.trim();

            let equalsIndex = line.indexOf('=');
            if (equalsIndex >= 0) {
                let key = line.substring(0, equalsIndex);
                let value = line.substring(equalsIndex + 1);

                // Strip double quotes if necessary
                if (value.length > 1 && value.startsWith('"') && value.endsWith('"')) {
                    value = value.substring(1, value.length - 1);
                }

                if (key === 'ID') {
                    name = value;
                }
                else if (key === 'VERSION_ID') {
                    version = value;
                }

                if (name !== unknown && version !== unknown) {
                    break;
                }
            }
        }

        return new LinuxDistribution(name, version);
    }
}

export enum OperatingSystem {
    Windows,
    MacOS,
    Linux
}

export class PlatformInformation {
    public operatingSystem: OperatingSystem;

    public constructor(
        public platform: string,
        public architecture: string,
        public distribution: LinuxDistribution)
    {
        switch (platform) {
            case 'win32':
                this.operatingSystem = OperatingSystem.Windows;
                break;

            case 'darwin':
                this.operatingSystem = OperatingSystem.MacOS;
                break;

            case 'linux':
                this.operatingSystem = OperatingSystem.Linux;
                break;
        }
    }

    public static GetCurrent(): Promise<PlatformInformation> {
        let platform = os.platform();
        let architecturePromise: Promise<string>;
        let distributionPromise: Promise<LinuxDistribution>;

        switch (platform) {
            case 'win32':
                architecturePromise = PlatformInformation.GetWindowsArchitecture();
                distributionPromise = Promise.resolve(null);
                break;

            case 'darwin':
                architecturePromise = PlatformInformation.GetUnixArchitecture();
                distributionPromise = Promise.resolve(null);
                break;

            case 'linux':
                architecturePromise = PlatformInformation.GetUnixArchitecture();
                distributionPromise = LinuxDistribution.GetCurrent();
                break;

            default:
                throw new Error(`Unsupported platform: ${platform}`);
        }

        return Promise.all([architecturePromise, distributionPromise])
            .then(([arch, distro]) => {
                return new PlatformInformation(platform, arch, distro)
            });
    }

    private static GetWindowsArchitecture(): Promise<string> {
        return util.execChildProcess('wmic os get osarchitecture')
            .then(architecture => {
                if (architecture) {
                    let archArray: string[] = architecture.split(os.EOL);
                    if (archArray.length >= 2) {
                        return archArray[1].trim();
                    }
                }

                return unknown;
            }).catch((error) => {
                return unknown;
            });
    }

    private static GetUnixArchitecture(): Promise<string> {
        return util.execChildProcess('uname -m')
            .then(architecture => {
                if (architecture) {
                    return architecture.trim();
                }

                return null;
            });
    }

    /**
     * Returns a supported .NET Core Runtime ID (RID) for the current platform. The list of Runtime IDs
     * is available at https://github.com/dotnet/corefx/tree/master/pkg/Microsoft.NETCore.Platforms.
     */
    public toRuntimeId(): string {
        switch (this.operatingSystem) {
            case OperatingSystem.Windows:
                switch (this.architecture) {
                    case '32-bit': return 'win7-x86';
                    case '64-bit': return 'win7-x64';
                }

                break;

            case OperatingSystem.MacOS:
                // Note: We assume 64-bit for OSX and return the El Capitan RID on Sierra.
                return 'osx.10.11-x64';

            case OperatingSystem.Linux:
                const centos_7 = 'centos.7-x64';
                const debian_8 = 'debian.8-x64';
                const fedora_23 = 'fedora.23-x64';
                const opensuse_13_2 = 'opensuse.13.2-x64';
                const rhel_7 = 'rhel.7-x64';
                const ubuntu_14_04 = 'ubuntu.14.04-x64';
                const ubuntu_16_04 = 'ubuntu.16.04-x64';

                const distro = this.distribution;
                switch (distro.name) {
                    case 'ubuntu':
                        if (distro.version.startsWith("14")) {
                            // This also works for Linux Mint
                            return ubuntu_14_04;
                        }
                        else if (distro.version.startsWith("16")) {
                            return ubuntu_16_04;
                        }

                        break;
                    case 'elementary':
                    case 'elementary OS':
                        if (distro.version.startsWith("0.3")) {
                            // Elementary OS 0.3 Freya is binary compatible with Ubuntu 14.04
                            return ubuntu_14_04;
                        }
                        else if (distro.version.startsWith("0.4")) {
                            // Elementary OS 0.4 Loki is binary compatible with Ubuntu 16.04
                            return ubuntu_16_04;
                        }

                        break;
                    case 'linuxmint':
                        if (distro.version.startsWith("18")) {
                            // Linux Mint 18 is binary compatible with Ubuntu 16.04
                            return ubuntu_16_04;
                        }

                        break;
                    case 'centos':
                    case 'ol':
                        // Oracle Linux is binary compatible with CentOS
                       return centos_7;
                    case 'fedora':
                        return fedora_23;
                    case 'opensuse':
                        return opensuse_13_2;
                    case 'rhel':
                        return rhel_7;
                    case 'debian':
                        return debian_8;
                }

                // If we got here, this is not a Linux distro that we currently support.
                throw new Error(`Unsupported linux platform: ${distro.name}, ${distro.version}`);
        }

        // If we got here, we've ended up with a platform we don't support  like 'freebsd' or 'sunos'.
        // Chances are, VS Code doesn't support these platforms either.
        throw Error('Unsupported platform ' + this.platform);
    }
}
