/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as os from 'os';

function AppendFieldsToObject(reference: any, obj: any) {

    // Make sure it is an object type
    if (typeof obj == 'object') {
        for (let referenceKey in reference) {
            // If key exists in original object and is an object.
            if (obj.hasOwnProperty(referenceKey)) {
                obj[referenceKey] = AppendFieldsToObject(reference[referenceKey], obj[referenceKey]);
            } else {
                // Does not exist in current object context
                obj[referenceKey] = reference[referenceKey];
            }
        }
    }

    return obj;
}

// Combines two object's fields, giving the parentDefault a higher precedence.
function MergeDefaults(parentDefault: any, childDefault: any) {
    let newDefault: any = {};

    for (let attrname in childDefault) {
        newDefault[attrname] = childDefault[attrname];
    }

    for (let attrname in parentDefault) {
        newDefault[attrname] = parentDefault[attrname];
    }

    return newDefault;
}

function UpdateDefaults(object: any, defaults: any) {
    if (defaults != null) {
        for (let key in object) {
            if (object[key].hasOwnProperty('type') && object[key].type === 'object' && object[key].properties !== null) {
                object[key].properties = UpdateDefaults(object[key].properties, MergeDefaults(defaults, object[key].default));
            } else if (key in defaults) {
                object[key].default = defaults[key];
            }
        }
    }

    return object;
}

function ReplaceReferences(definitions: any, objects: any) {
    for (let key in objects) {
        if (objects[key].hasOwnProperty('$ref')) {
            // $ref is formatted as "#/definitions/ObjectName"
            let referenceStringArray: string[] = objects[key]['$ref'].split('/');

            // Getting "ObjectName"
            let referenceName: string = referenceStringArray[referenceStringArray.length - 1];

            // Make sure reference has replaced its own $ref fields and hope there are no recursive references.
            definitions[referenceName] = ReplaceReferences(definitions, definitions[referenceName]);

            // Retrieve ObjectName from definitions. (TODO: Does not retrieve inner objects)
            // Need to deep copy, there are no functions in these objects.
            let reference: any = JSON.parse(JSON.stringify(definitions[referenceName]));

            objects[key] = AppendFieldsToObject(reference, objects[key]);

            // Remove $ref field
            delete objects[key]['$ref'];
        }

        // Recursively replace references if this object has properties.
        if (objects[key].hasOwnProperty('type') && objects[key].type === 'object' && objects[key].properties !== null) {
            objects[key].properties = ReplaceReferences(definitions, objects[key].properties);
            objects[key].properties = UpdateDefaults(objects[key].properties, objects[key].default);
        }
    }

    return objects;
}

function mergeReferences(baseDefinitions: any, additionalDefinitions: any): void {
    for (let key in additionalDefinitions) {
        if (baseDefinitions[key]) {
            throw `Error: '${key}' defined in multiple schema files.`;
        }
        baseDefinitions[key] = additionalDefinitions[key];
    }
}

export function GenerateOptionsSchema() {
    let packageJSON: any = JSON.parse(fs.readFileSync('package.json').toString());
    let schemaJSON: any = JSON.parse(fs.readFileSync('src/tools/OptionsSchema.json').toString());
    let symbolSettingsJSON: any = JSON.parse(fs.readFileSync('src/tools/VSSymbolSettings.json').toString());
    mergeReferences(schemaJSON.definitions, symbolSettingsJSON.definitions);

    schemaJSON.definitions = ReplaceReferences(schemaJSON.definitions, schemaJSON.definitions);

    // Hard Code adding in configurationAttributes launch and attach.
    // .NET Core
    packageJSON.contributes.debuggers[0].configurationAttributes.launch = schemaJSON.definitions.LaunchOptions;
    packageJSON.contributes.debuggers[0].configurationAttributes.attach = schemaJSON.definitions.AttachOptions;

    // Full .NET Framework
    packageJSON.contributes.debuggers[1].configurationAttributes.launch = schemaJSON.definitions.LaunchOptions;
    packageJSON.contributes.debuggers[1].configurationAttributes.attach = schemaJSON.definitions.AttachOptions;

    // Make a copy of the options for unit test debugging
    let unitTestDebuggingOptions = JSON.parse(JSON.stringify(schemaJSON.definitions.AttachOptions.properties));
    // Remove the options we don't want
    delete unitTestDebuggingOptions.processName;
    delete unitTestDebuggingOptions.processId;
    delete unitTestDebuggingOptions.pipeTransport;
    delete unitTestDebuggingOptions.processCommand;
    // Add the additional options we do want
    unitTestDebuggingOptions["type"] = {
        "type": "string",
        "enum": [
            "coreclr",
            "clr"
        ],
        "description": "Type type of code to debug. Can be either 'coreclr' for .NET Core debugging, or 'clr' for Desktop .NET Framework. 'clr' only works on Windows as the Desktop framework is Windows-only.",
        "default": "coreclr"
    };
    unitTestDebuggingOptions["debugServer"] = {
        "type": "number",
        "description": "For debug extension development only: if a port is specified VS Code tries to connect to a debug adapter running in server mode",
        "default": 4711
    };
    packageJSON.contributes.configuration.properties["csharp.unitTestDebuggingOptions"].properties = unitTestDebuggingOptions;

    let content = JSON.stringify(packageJSON, null, 2);
    if (os.platform() === 'win32') {
        content = content.replace(/\n/gm, "\r\n");
    }

    // We use '\u200b' (unicode zero-length space character) to break VS Code's URL detection regex for URLs that are examples. This process will
    // convert that from the readable espace sequence, to just an invisible character. Convert it back to the visible espace sequence.
    content = content.replace(/\u200b/gm, "\\u200b");

    fs.writeFileSync('package.json', content);
}
