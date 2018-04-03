/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { OmnisharpServerOnServerError, BaseEvent, OmnisharpOnBeforeServerInstall, OmnisharpOnBeforeServerStart, OmnisharpServerOnStop, OmnisharpServerOnStart } from "../omnisharp/loggingEvents";
import { BaseStatusBarItemObserver } from './BaseStatusBarItemObserver';

export class OmnisharpStatusBarObserver extends BaseStatusBarItemObserver {
    public post = (event: BaseEvent) => {
        switch (event.constructor.name) {
            case OmnisharpServerOnServerError.name:
                this.SetAndShowStatusBar('$(flame) Error starting OmniSharp', 'o.showOutput', '');
                break;
            case OmnisharpOnBeforeServerInstall.name:
                this.SetAndShowStatusBar('$(flame) Installing OmniSharp...', 'o.showOutput', '');
                break;
            case OmnisharpOnBeforeServerStart.name:
                this.SetAndShowStatusBar('$(flame) Starting...', 'o.showOutput', '');
                break;
            case OmnisharpServerOnStop.name:
                this.ResetAndHideStatusBar();
                break;
            case OmnisharpServerOnStart.name:
                this.SetAndShowStatusBar('$(flame) Running', 'o.showOutput', '');
                break;
        }
    }
}

