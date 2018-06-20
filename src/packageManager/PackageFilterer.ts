/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { PlatformInformation } from "../platform";
import * as util from '../common';
import { PackageError } from "./PackageError";
import { InstallablePackage } from "./InstallablePackage";

const { filterAsync } = require('node-filter-async');

export async function getPlatformSpecificNotInstalledPackages(packages: InstallablePackage[], platformInfo: PlatformInformation): Promise<InstallablePackage[]> {
    let platformPackages = getPlatformSpecificPackages(packages, platformInfo);
    return getNotInstalledPackages(platformPackages);
}

function getPlatformSpecificPackages(packages: InstallablePackage[], platformInfo: PlatformInformation) {
    if (packages) {
        return packages.filter(pkg => {
            if (pkg.architectures && pkg.architectures.indexOf(platformInfo.architecture) === -1) {
                return false;
            }

            if (pkg.platforms && pkg.platforms.indexOf(platformInfo.platform) === -1) {
                return false;
            }

            return true;
        });
    }
    else {
        throw new PackageError("Package manifest does not exist.");
    }
}

async function getNotInstalledPackages(packages: InstallablePackage[]): Promise<InstallablePackage[]> {
    return filterAsync(packages, async (pkg: InstallablePackage) => {
        //If the file is present at the install test path then filter it
        if (!pkg.installTestPath) {
            //if there is no testPath specified then we will not filter it
            return true;
        }

        return !(await util.fileExists(pkg.installTestPath));
      });
}