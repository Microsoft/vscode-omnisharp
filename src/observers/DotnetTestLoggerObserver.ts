/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { BaseEvent, DotNetTestRunStart, DotNetTestMessage, ReportDotNetTestResults, DotNetTestDebugStart, DotNetTestDebugWarning, DotNetTestDebugProcessStart, DotNetTestDebugComplete, DotNetTestsInClassDebugStart, DotNetTestsInClassRunStart } from "../omnisharp/loggingEvents";
import { BaseLoggerObserver } from "./BaseLoggerObserver";
import * as protocol from '../omnisharp/protocol';

export default class DotNetTestLoggerObserver extends BaseLoggerObserver {

    public post = (event: BaseEvent) => {
        switch (event.constructor.name) {
            case DotNetTestRunStart.name:
                this.handleDotnetTestRunStart(<DotNetTestRunStart>event);
                break;
            case DotNetTestMessage.name:
                this.logger.appendLine((<DotNetTestMessage>event).message);
                break;
            case ReportDotNetTestResults.name:
                this.handleReportDotnetTestResults(<ReportDotNetTestResults>event);
                break;
            case DotNetTestDebugStart.name:
                this.handleDotnetTestDebugStart(<DotNetTestDebugStart>event);
                break;
            case DotNetTestDebugWarning.name:
                this.handleDotNetTestDebugWarning(<DotNetTestDebugWarning>event);
                break;
            case DotNetTestDebugProcessStart.name:
                this.handleDotNetTestDebugProcessStart(<DotNetTestDebugProcessStart>event);
                break;
            case DotNetTestDebugComplete.name:
                this.logger.appendLine("Debugging complete.\n");
                break;
            case DotNetTestsInClassDebugStart.name:
                this.handleDotnetTestsInClassDebugStart(<DotNetTestsInClassDebugStart>event);
                break;
            case DotNetTestsInClassRunStart.name:
                this.handleDotnetTestsInClassRunStart(<DotNetTestsInClassRunStart>event);
                break;
        }
    }

    private handleDotNetTestDebugWarning(event: DotNetTestDebugWarning) {
        this.logger.appendLine(`Warning: ${event.message}`);
    }

    private handleDotnetTestDebugStart(event: DotNetTestDebugStart) {
        this.logger.appendLine(`----- Debugging test method ${event.testMethod} -----`);
        this.logger.appendLine('');
    }

    private handleDotnetTestRunStart(event: DotNetTestRunStart): any {
        this.logger.appendLine(`----- Running test method "${event.testMethod}" -----`);
        this.logger.appendLine('');
    }

    private handleDotnetTestsInClassDebugStart(event: DotNetTestsInClassDebugStart) {
        this.logger.appendLine(`----- Debugging tests in class ${event.className} -----`);
        this.logger.appendLine('');
    }

    private handleDotnetTestsInClassRunStart(event: DotNetTestsInClassRunStart): any {
        this.logger.appendLine(`----- Running tests in class "${event.className}" -----`);
        this.logger.appendLine('');
    }

    private handleDotNetTestDebugProcessStart(event: DotNetTestDebugProcessStart) {
        this.logger.appendLine(`Started debugging process #${event.targetProcessId}.`);
    }

    private handleReportDotnetTestResults(event: ReportDotNetTestResults) {
        if (event.results) {
            this.logger.appendLine("----- Test Execution Summary -----");
            this.logger.appendLine('');

            // Omnisharp returns null results if there are build failures
            const results = event.results;
            const totalTests = results.length;

            let totalPassed = 0, totalFailed = 0, totalSkipped = 0;
            for (let result of results) {
                this.logTestResult(result);
                switch (result.Outcome) {
                    case protocol.V2.TestOutcomes.Failed:
                        totalFailed += 1;
                        break;
                    case protocol.V2.TestOutcomes.Passed:
                        totalPassed += 1;
                        break;
                    case protocol.V2.TestOutcomes.Skipped:
                        totalSkipped += 1;
                        break;
                }
            }

            this.logger.appendLine(`Total tests: ${totalTests}. Passed: ${totalPassed}. Failed: ${totalFailed}. Skipped: ${totalSkipped}`);
            this.logger.appendLine('');
        }
    }

    private logTestResult(result: protocol.V2.DotNetTestResult) {
        this.logger.appendLine(`${result.MethodName}:`);
        this.logger.increaseIndent();
        this.logger.appendLine(`Outcome: ${processOutcome(result.Outcome)}`);
        if (result.ErrorMessage) {
            this.logger.appendLine(`Error Message:`);
            this.logger.appendLine(result.ErrorMessage);
        }

        if (result.ErrorStackTrace) {
            this.logger.appendLine(`Stack Trace:`);
            this.logger.appendLine(result.ErrorStackTrace);
        }

        if (result.StandardOutput && result.StandardOutput.length > 0) {
            this.logger.appendLine("Standard Output Messages:");
            result.StandardOutput.forEach(message => this.logger.appendLine(message));
        }

        if (result.StandardError && result.StandardError.length > 0) {
            this.logger.appendLine("Standard Error Messages:");
            result.StandardError.forEach(message => this.logger.appendLine(message));
        }

        this.logger.appendLine();
        this.logger.decreaseIndent();
    }
}

export function processOutcome(input: string) {
    return input.charAt(0).toUpperCase() + input.slice(1);
}
