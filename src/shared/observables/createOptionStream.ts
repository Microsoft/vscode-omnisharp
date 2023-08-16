/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Options } from '../options';
import { vscode } from '../../vscodeAdapter';
import { Observable, Observer } from 'rxjs';
import { publishBehavior } from 'rxjs/operators';
import { csharpDevkitExtensionId } from '../../utils/getCSharpDevKit';

export default function createOptionStream(vscode: vscode): Observable<Options> {
    return Observable.create((observer: Observer<Options>) => {
        const disposable = vscode.workspace.onDidChangeConfiguration((e) => {
            //if the omnisharp or csharp configuration are affected only then read the options
            if (
                e.affectsConfiguration('dotnet') ||
                (e.affectsConfiguration('omnisharp') && !vscode.extensions.getExtension(csharpDevkitExtensionId)) ||
                e.affectsConfiguration('csharp')
            ) {
                observer.next(Options.Read(vscode));
            }
        });

        return () => disposable.dispose();
    })
        .pipe(publishBehavior(Options.Read(vscode)))
        .refCount();
}
