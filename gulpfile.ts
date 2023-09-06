/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as gulp from 'gulp';
import * as optionsSchemaGenerator from './src/tools/generateOptionsSchema';
import * as packageDependencyUpdater from './src/tools/updatePackageDependencies';

require('./tasks/testTasks');
require('./tasks/offlinePackagingTasks');
require('./tasks/backcompatTasks');
require('./tasks/localizationTasks');
require('./tasks/createTagsTasks');

// Disable warning about wanting an async function
// tslint:disable-next-line
gulp.task('generateOptionsSchema', async (): Promise<void> => {
    optionsSchemaGenerator.GenerateOptionsSchema();
    return Promise.resolve();
});

// Disable warning about wanting an async function
// tslint:disable-next-line
gulp.task('updatePackageDependencies', async (): Promise<void> => {
    return packageDependencyUpdater.updatePackageDependencies();
});
