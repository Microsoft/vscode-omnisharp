/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as lsp from 'vscode-languageserver-protocol';

export interface WaitForAsyncOperationsParams {
    /**
     * The operations to wait for.
     */
    operations: string[];
}

export namespace WaitForAsyncOperationsRequest {
    export const method = 'workspace/waitForAsyncOperations';
    export const messageDirection: lsp.MessageDirection = lsp.MessageDirection.clientToServer;
    export const type = new lsp.RequestType<
        WaitForAsyncOperationsParams,
        {
            /* empty */
        },
        void
    >(method);
}
