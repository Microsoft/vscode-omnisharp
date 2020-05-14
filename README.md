## C# for Visual Studio Code (powered by OmniSharp)

|                                                                     Master                                                                     |                                                                     Release                                                                      |
| :--------------------------------------------------------------------------------------------------------------------------------------------: | :----------------------------------------------------------------------------------------------------------------------------------------------: |
| [![Master Build Status](https://travis-ci.org/OmniSharp/omnisharp-vscode.svg?branch=master)](https://travis-ci.org/OmniSharp/omnisharp-vscode) | [![Release Build Status](https://travis-ci.org/OmniSharp/omnisharp-vscode.svg?branch=release)](https://travis-ci.org/OmniSharp/omnisharp-vscode) |

[![Wallaby.js](https://img.shields.io/badge/wallaby.js-configured-green.svg)](https://wallabyjs.com)

Welcome to the C# extension for Visual Studio Code! This extension provides the following features inside VS Code:

-   Lightweight development tools for [.NET Core](https://dotnet.github.io).
-   Great C# editing support, including Syntax Highlighting, IntelliSense, Go to Definition, Find All References, etc.
-   Debugging support for .NET Core (CoreCLR). NOTE: Mono debugging is not supported. Desktop CLR debugging has [limited support](https://github.com/OmniSharp/omnisharp-vscode/wiki/Desktop-.NET-Framework).
-   Support for project.json and csproj projects on Windows, macOS and Linux.

The C# extension is powered by [OmniSharp](https://github.com/OmniSharp/omnisharp-roslyn).

### Get Started Writing C# in VS Code

-   [Documentation](https://code.visualstudio.com/docs/languages/csharp)
-   [Video Tutorial compiling with .NET Core](https://channel9.msdn.com/Blogs/dotnet/Get-started-VSCode-Csharp-NET-Core-Windows)

## What's new in 1.21.18
-   Fadeout unused variable names ([#1324](https://github.com/OmniSharp/omnisharp-vscode/issues/1324), PR: [#3733](https://github.com/OmniSharp/omnisharp-vscode/pull/3733))
-   Updated debugger (PR: [#3729](https://github.com/OmniSharp/omnisharp-vscode/pull/3729))
-   Fixed not supported exception when trying to decompile a BCL assembly on Mono. For now we do not try to resolve implementation assembly from a ref assembly (PR: [omnisharp-roslyn/#1767](https://github.com/OmniSharp/omnisharp-roslyn/pull/1767))
-   Added support for generic classes in test runner ([#3722](https://github.com/OmniSharp/omnisharp-vscode/issues/3722), PR: [omnisharp-roslyn/#1768](https://github.com/OmniSharp/omnisharp-roslyn/pull/1768))
-   Improved autocompletion performance (PR: [omnisharp-roslyn/#1761](https://github.com/OmniSharp/omnisharp-roslyn/pull/1761))
-   Move to Roslyn's .editorconfig support ([omnisharp-roslyn/#1657](https://github.com/OmniSharp/omnisharp-roslyn/issues/1657), PR: [omnisharp-roslyn/#1771](https://github.com/OmniSharp/omnisharp-roslyn/pull/1771))
-   Fully update CompilationOptions when project files change (PR: [omnisharp-roslyn/#1774](https://github.com/OmniSharp/omnisharp-roslyn/pull/1774))

## What's new in 1.21.17

-   Updated Razor support (PR:[#3696](https://github.com/OmniSharp/omnisharp-vscode/pull/3696))
  -   Razor support for `<text>` tag completions.
  -   Ability to restart the Razor Language Server to activate changes to the `razor.trace` level.
  -   Bug fixes and performance improvements.
-   Support for `<RunAnalyzers />` and `<RunAnalyzersDuringLiveAnalysis />` (PR: [omnisharp-roslyn/#1739](https://github.com/OmniSharp/omnisharp-roslyn/pull/1739))
-   Add `typeparam` documentation comments to text description ([#3516](https://github.com/OmniSharp/omnisharp-vscode/issues/3516), PR: [omnisharp-roslyn/#1749](https://github.com/OmniSharp/omnisharp-roslyn/pull/1749))
-   Tag `#region` blocks appropriately in the block structure service ([#2621](https://github.com/OmniSharp/omnisharp-vscode/issues/2621), PR: [omnisharp-roslyn/#1748](https://github.com/OmniSharp/omnisharp-roslyn/pull/1748))

## What's new in 1.21.16

-   Support for .NET Core 3.1 in csx files (PR: [omnisharp-roslyn/#1731](https://github.com/OmniSharp/omnisharp-roslyn/pull/1731))
-   Update the minimal MSBuild to better support .NET 5 Previews ([#3653](https://github.com/OmniSharp/omnisharp-vscode/issues/3653), PR: [omnisharp-roslyn/#1746](https://github.com/OmniSharp/omnisharp-roslyn/pull/1746))

## What's new in 1.21.15

-   Fixed freezing and unresponsiveness when opening folder with many nested sub-folders (PR: [#3681](https://github.com/OmniSharp/omnisharp-vscode/pull/3681))
-   Fixed handling of dismiss response to assets prompt (PR: [#3678](https://github.com/OmniSharp/omnisharp-vscode/pull/3678))

### Supported Operating Systems for Debugging

-   Currently, the C# debugger officially supports the following operating systems:

    -   X64 operating systems:
        -   Windows 7 SP1 and newer
        -   macOS 10.12 (Sierra) and newer
        -   Linux: see [.NET Core documentation](https://github.com/dotnet/core/blob/master/release-notes/2.2/2.2-supported-os.md#linux) for the list of supported distributions. Note that other Linux distributions will likely work as well as long as they include glibc and OpenSSL.
    -   ARM operating systems:
        -   Linux is supported as a remote debugging target

### Found a Bug?

To file a new issue to include all the related config information directly from vscode by entering the command pallette with <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>
(<kbd>Cmd</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> on macOS) and running `CSharp: Report an issue` command. This will open a browser window with all the necessary information related to the installed extensions, dotnet version, mono version, etc. Enter all the remaining information and hit submit. More information can be found on the [wiki](https://github.com/OmniSharp/omnisharp-vscode/wiki/Reporting-Issues).

Alternatively you could visit https://github.com/OmniSharp/omnisharp-vscode/issues and file a new one.

### Development

First install:

-   Node.js (8.11.1 or later)
-   Npm (5.6.0 or later)

To **run and develop** do the following:

-   Run `npm i`
-   Run `npm run compile`
-   Open in Visual Studio Code (`code .`)
-   _Optional:_ run `npm run watch`, make code changes
-   Press <kbd>F5</kbd> to debug

To **test** do the following: `npm run test` or <kbd>F5</kbd> in VS Code with the "Launch Tests" debug configuration.

### License

Copyright © .NET Foundation, and contributors.

The Microsoft C# extension is subject to [these license terms](RuntimeLicenses/license.txt).
The source code to this extension is available on [https://github.com/OmniSharp/omnisharp-vscode](https://github.com/OmniSharp/omnisharp-vscode) and licensed under the [MIT license](LICENSE.txt).

## Code of Conduct

This project has adopted the code of conduct defined by the [Contributor Covenant](http://contributor-covenant.org/)
to clarify expected behavior in our community.
For more information see the [.NET Foundation Code of Conduct](http://www.dotnetfoundation.org/code-of-conduct).

## Contribution License Agreement

By signing the [CLA](https://cla.dotnetfoundation.org/OmniSharp/omnisharp-roslyn), the community is free to use your contribution to .NET Foundation projects.

## .NET Foundation

This project is supported by the [.NET Foundation](http://www.dotnetfoundation.org).
