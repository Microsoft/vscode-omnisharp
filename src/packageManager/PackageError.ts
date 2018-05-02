/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { NestedError } from '../NestedError';
import { PackageJSONPackage } from './PackageJSONPackage';

export class PackageError extends NestedError {
    // Do not put PII (personally identifiable information) in the 'message' field as it will be logged to telemetry
    constructor(public message: string,
        public pkg: PackageJSONPackage = null,
        public innerError: any = null) {
        super(message, innerError);
    }
}