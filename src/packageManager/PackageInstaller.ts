/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as yauzl from 'yauzl';
import * as path from 'path';
import { EventStream } from "../EventStream";
import { InstallationProgress } from "../omnisharp/loggingEvents";
import { NestedError } from './packages';


export async function InstallPackage(fd: number, description: string, installPath: string, binaries: string[], eventStream: EventStream): Promise<void> {
    const installationStage = 'installPackages';

    eventStream.post(new InstallationProgress(installationStage, description));

    return new Promise<void>((resolve, reject) => {
        if (fd == 0) {
            return reject(new NestedError('Downloaded file unavailable'));
        }

        yauzl.fromFd(fd, { lazyEntries: true }, (err, zipFile) => {
            if (err) {
                return reject(new NestedError('Immediate zip file error', err));
            }

            zipFile.readEntry();

            zipFile.on('entry', (entry: yauzl.Entry) => {
                let absoluteEntryPath = path.resolve(installPath, entry.fileName);

                if (entry.fileName.endsWith('/')) {
                    // Directory - create it
                    mkdirp(absoluteEntryPath, { mode: 0o775 }, err => {
                        if (err) {
                            return reject(new NestedError('Error creating directory for zip directory entry:' + err.code || '', err));
                        }

                        zipFile.readEntry();
                    });
                }
                else {
                    // File - extract it
                    zipFile.openReadStream(entry, (err, readStream) => {
                        if (err) {
                            return reject(new NestedError('Error reading zip stream', err));
                        }

                        mkdirp(path.dirname(absoluteEntryPath), { mode: 0o775 }, err => {
                            if (err) {
                                return reject(new NestedError('Error creating directory for zip file entry', err));
                            }

                            // Make sure executable files have correct permissions when extracted
                            let fileMode = binaries && binaries.indexOf(absoluteEntryPath) !== -1
                                ? 0o755
                                : 0o664;

                            readStream.pipe(fs.createWriteStream(absoluteEntryPath, { mode: fileMode }));
                            readStream.on('end', () => zipFile.readEntry());
                        });
                    });
                }
            });

            zipFile.on('end', () => {
                resolve();
            });

            zipFile.on('error', err => {
                reject(new NestedError('Zip File Error:' + err.code || '', err));
            });
        });
    });
}

