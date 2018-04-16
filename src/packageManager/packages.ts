/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Package {
    description: string;
    url: string;
    fallbackUrl?: string;
    installPath?: string;
    platforms: string[];
    architectures: string[];
    binaries: string[];
    platformId?: string;

    // Path to use to test if the package has already been installed
    installTestPath?: string;
}

export class NestedError extends Error {
    constructor(public message: string, public err: any = null) {
        super(message);
    }
}

export class PackageError extends NestedError {
    // Do not put PII (personally identifiable information) in the 'message' field as it will be logged to telemetry
    constructor(public message: string,
        public pkg: Package = null,
        public innerError: any = null) {
        super(message, innerError);
    }
}


