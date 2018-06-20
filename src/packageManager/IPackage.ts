/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface IPackage {
    description: string;
    url: string;
    fallbackUrl?: string;
    platforms: string[];
    architectures: string[];
    platformId?: string;
    installPath?: string;
    installTestPath?: string;
    binaries: string[];
}