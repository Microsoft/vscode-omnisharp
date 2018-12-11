# Validating C# Extension for VS Code

#### Opening projects
When you open a directory in VS Code, the C# extension should look for a .csproj or .sln file in that directory and use "OmniSharp" to load it. If a .cs file is present and no .csproj or .sln file are present, Omnisharp should start but the intellisense should only appear when a change is made to the file.
If you look in "Output > Omnisharp Log" a bunch of information should be printed about what copy of MSBuild was used and what projects were load

Project types to test:
* Standalone csproj 
* Directory containing .sln file that references csprojs--projects should be loaded 
* .NET Core/.NET Standard csproj
* (Windows) Desktop .NET projects
* Unity projects
* A directory containing a .cs file without a csproj/sln. As stated above, intellisense should appear only when a change is made to the file. 

The easist way to verify that a project was successfully loaded is to open a .cs file within it and verify that the references codelens indicator appears.

#### Specific projects to test opening (on all OSes):
* `dotnet new console` in a directory
* A more complex dotnet solution, eg. [1] 
* A console app solution created in Visual Studio

#### Unity
* Follow the directions at https://code.visualstudio.com/docs/other/unity to configure VS Code with unity
* Try editing a project like https://github.com/staceyhaffner/SuperSpaceShooter

#### Intellisense 
* The completion list in a file contains symbols defined in references and in the file
* If you write a documentation comment on a symbol, the completion list displays it

#### Signature Help 
* Signature Help shows up in a method call after typing `(`
* Signature help shows documentation for methods and for parameters
* Parameter documentation is only shown for the currently active parameter

#### Quick Info
* Hovering over an identifier shows info and documentation

#### Formatting
* The "Format Document" command works
* Pressing enter inside a method body automatically indents the new line

#### Go To Definition
* F12 from callsites to definition
* Ctrl-Click
* Can go to metadata for symbols defined in metadata

#### Go To Implementation
* Ctrl-F12 on virtual member shows implementations

#### Find All References
* Shift-F12 on a symbol shows a reference list

### Reference highlighting
* Clicking on a symbol name should highlight other references to it in the same file

#### Colorization
* Appropriate colorization of keywords, literals, identifiers

#### Error squiggles
* Introducing an error should show a squiggle in the editor and an error message in the "problems" window
* Messages in the "problems" window should appear only once per unique error (see https://github.com/OmniSharp/omnisharp-vscode/issues/1830)

#### Quick Fixes
* Add using should be availble (does not currently suppport adding references)
* Generate variable/generate method should show up for missing members
* Remove unncessary usings should show up
* (this is not an exhaustive list)

#### Refactorings
* `Use expression body for methods` should be available
* `Rename file to match type` should correctly rename the file. The renamed file should be open after the refactoring
* (this is not an exhaustive list)

#### Code Lens - References
* References codelens appears on symbols and shows correct Find All References results

#### Code Lens - Unit Tests
* In unit tests projects, the "run test" and "debug test" codelens appears on test methods
  * Clicking runs or debugs the test and prints results to the console
  * Breakpoints in a unit test are hit if you "debug test"
* "Run All Tests" and "Debug All Tests" code lens buttons will appear on test classes
  * Click Run All or Debug All should run/debug all the tests in the class and print a summary
  * If you set breakpoints within multiple tests, you should hit each breakpoint as the tests are run

#### Symbol Finder
* Ctrl-T can find symbols by name when you type them
  * Symbols have appropriate glyphs

#### Rename
* Rename can rename symbols

#### File Watching
* In a project that uses globbing (.NET Core), use the VS Code file explorer to add a new file next to the csproj. Intellisense/sighelp/etc should be available in the new file
* Add a new file and reference a type in it from a different file. Deleting from disk the file containing the referenced type  should produce error messages

#### ASP.NET Core Razor
The Razor experience is available when you open a .cshtml file in a valid OmniSharp project. To setup a test project to verify on you can do:  
1. `dotnet new razor`
2. Open `Pages/Index.cshtml`

##### C# Completion
* Typing `@DateTime.Now` and `@(DateTime.Now)` provides completions throughout typing.
* Completion is available for types that exist in the project (i.e. `Program`)
* Typing `@model DateTime` prompts for completion for the `model` symbol and the `DateTime` symbol.

##### C# Signature Help
* Typing `@Html.Raw()` prompts for signature help inside of the `()`.

##### C# Diagnostics
* Typing `@ThisDoesNotExist` results in an error being created and squiggled in the .cshtml file. NOTE: This error squiggly will be misaligned due to known issues.

##### Known issues:
- Error squiggles may be misaligned due to known issues.  

#### Blazor
The Blazor experience is available when you open a .cshtml file in a valid OmniSharp/Blazor project. To setup a test project to verify on you can do:  
1. `dotnet new -i Microsoft.AspNetCore.Blazor.Templates`
2. `dotnet new blazor`
3. Open `Pages/Index.cshtml`

##### C# Completion
* Typing `@DateTime.Now` and `@(DateTime.Now)` provides completions throughout typing.
* Completion is available for types that exist in the project (i.e. `Program`)
* Typing `@layout MainLayout` prompts for completion for the `layout` symbol and the `MainLayout` symbol.

##### C# Signature Help
* Typing `@SetParameters()` prompts for signature help inside of the `()`.

##### C# Diagnostics
* When no changes have been performed on `Pages/Index.cshtml`, there are 0 errors.
* Typing `@ThisDoesNotExist` results in an error being created and squiggled in the .cshtml file. 

##### Known issues:
- Error squiggles may be misaligned due to known issues.  
- There are some errors in the default Blazor project that are known. All errors that read like `Cannot convert method group 'SomeMethodName' to non-delegate type 'object'. Did you intend to invoke the method? [ProjectName]` are expected.

#### Legacy Razor
The Razor experience is degraded (but no errors) when you open a .cshtml file in a valid OmniSharp/Legacy Razor project. To setup a test project to verify on you can do:  
1. Open Visual Studio
2. New Project
3. ASP.NET Web Application (.NET Framework)
4. Select MVC
5. OK
6. Open `Views/Home/Index.cshtml`

##### C# Completion / IntelliSense
* Typing `@DateTime.Now` does not result in any C# completion.
* Typing `@{ var x = DateTime.Now; }` does not result in any C# completion.
* Typing `@model` does not result in any Razor directive completion.

##### C# Diagnostics
* There are 0 .cshtml related errors on open.
* Typing `@ThisDoesNotExist` does not result in an error being created. 

##### Html Completion
Verifying Html is needed to ensure the Razor experience is still partially enabled.
* Typing `<stron` results in Html completion with an entry for `strong`.
* Typing `<strong>` results in a corresponding `</strong>` being appended
* Hitting enter Typing `@{}` and then hitting enter inbetween the curly braces results in:
```
@{

}
```

#### Razor Project level Information
To verify the project level information for Razor do the following:
1. Verify the `obj/Debug/TheTFMOfTheProject` folder contains a `project.razor.json` file (once the project is restored)
2. Verify the `project.razor.json`'s `Configuration` section is not set to `null`.

Verify each of the test projects above's `project.razor.json` file (ASP.NET Core Razor, Blazor and Legacy Razor) looks something like the following:

##### ASP.NET Core Razor
```JSON
{
  "ProjectFilePath": "c:\\Users\\JohnDoe\\Projects\\RazorCoreTestApp\\RazorCoreTestApp.csproj",
  "TargetFramework": "netcoreapp2.1",
  "TagHelpers": [],
  "Configuration": {
    "ConfigurationName": "MVC-2.1",
    "LanguageVersion": "2.1",
    "Extensions": [
      {
        "ExtensionName": "MVC-2.1"
      }
    ]
  }
}
```

##### Blazor
```JSON
{
  "ProjectFilePath": "c:\\Users\\JohnDoe\\Projects\\BlazorTestApp\\BlazorTestApp.csproj",
  "TargetFramework": "netstandard2.0",
  "TagHelpers": [],
  "Configuration": {
    "ConfigurationName": "Blazor-0.1",
    "LanguageVersion": "1337.1337",
    "Extensions": [
      {
        "ExtensionName": "Blazor.AngleSharp-0.1"
      },
      {
        "ExtensionName": "Blazor-0.1"
      }
    ]
  }
}
```

##### Legacy Razor
```JSON
{
  "ProjectFilePath": "c:\\Users\\JohnDoe\\Projects\\LegacyRazorTestApp\\LegacyRazorTestApp.csproj",
  "TargetFramework": "v4.6.1",
  "TagHelpers": [],
  "Configuration": {
    "ConfigurationName": "UnsupportedRazor",
    "LanguageVersion": "1.0",
    "Extensions": [
      {
        "ExtensionName": "UnsupportedRazorExtension"
      }
    ]
  }
}
```

#### Razor Options

##### razor.disabled
This option can be set to `true` to disable the above described C# experiences.

##### razor.trace
This option should always be displayed in the View --> Output --> Razor Log window
This option can be set to any of the following values:
  * "Off" - Will launch Razor Language server with its log output set to 'Off'. The header in the Razor Log output window will be shown but no other content will be shown.
  * "Messages" - Will launch Razor Language server with its log output set to 'Messages'. Limited messages will be shown such as "Opening document xyz in project abc".
  * "Verbose" - Will launch Razor Language server with its log output set to 'Verbose'. All logging messages will be shown such as "123 - Synchronizing documentxyz currently ...."

#### OmniSharp Options

  #### omnisharp.useGlobalMono (for Linux/Mac)
  This option can be set to any of the following values:
  * "auto" - Will launch OmniSharp using mono if version>=5.2.0 is installed but will launch using the run script if that is not so.
  * "always" - Will launch OmniSharp using mono if version>=5.2.0 is installed and will throw an error otherwise.
  * "never" - Launches OmniSharp without using the global mono

  The value of OmniSharp path displayed in the OmniSharp log can be used to know if OmniSharp has launched using mono or not. If it is running using global mono, the path will end with "OmniSharp.exe" else the path will end with "run". 
  For using this option, mono version greater than or equal to 5.2.0 must be installed. If that is not so, setting this option to true, should give an error.
  * If the option is not set, the OmniSharp path displayed in the "OmniSharp Log" should end with "run"
  * If the option is set, the OmniSharp path as mentioned above should end with "OmniSharp.exe"

  #### omnisharp.path
  Setting this path to any of the values as listed below, should start the OmniSharp server and display the correct OmniSharp path in the `OmniSharp Log`(View --> Output--> OmniSharp Log).
  * undefined - OmniSharp server must start using the copy of omnisharp shipped with the extension, that is, the OmniSharp path must be the extension path, followed by .omnisharp followed by the default omnisharp version as present in the package.json and the platform-specific executable.
  * Some absolute path - OmniSharp server must start using the local copy of OmniSharp pointed to by the path and the same must be displayed as the Omnisharp path. Example:C:\omnisharp-roslyn\artifacts\publish\OmniSharp.Stdio\win7-x64\OmniSharp.exe. 
  * "<version>" - The specified version must be downloaded and installed (The status of download/install can be seen in the `C#` log). If the installation is successful, the server must start and the OmniSharp path must include the .omnisharp folder followed by the version name and the executable. Eg: If the version is `1.29.2-beta.60`, the path displayed on Windows should be `.omnisharp/1.29.2-beta.60/OmniSharp.exe`.
  * "latest" - The file containing the information about the latest CI build (https://roslynomnisharp.blob.core.windows.net/releases/versioninfo.txt), must be downloaded and accordingly the latest CI build from the "master" branch of omnisharp-roslyn should be downloaded and installed. If the installation is successful, the server must start and the OmniSharp path must include the .omnisharp folder followed by the version name and the executable. Eg: If the latest version is `1.29.2-beta.62`, the path displayed on Windows should be `.omnisharp/1.29.2-beta.62/OmniSharp.exe`.
  * All the above configurations should work, with and without setting the useMono option on Linux
  * The above behavior should be exhibited when a new vscode window is opened, as well as if the setting is modified and a "Restart OmniSharp"(Ctrl+Shift+P --> OmniSharp: Restart OmniSharp) is performed. 

####  Status Bar Item
The status bar item(s) must appear on the left side of the VS Code's status bar
* When the extension is setting up the dependencies, the status bar item should show "Downloading packages"/"Installing packages".
* Once the server has started, there should be two status bar items:
  * OmniSharp status Bar item - It should show a green flame (indicating that the OmniSharp server is running) and clicking on it should show the OmniSharp log channel
  * Project status bar item  - It should show and a folder icon and the name of the currently selected project/solution. Clicking on this element should show a command palette menu to select other projects/solutions in the workspace.

[1] For example,
```
mkdir project
mkdir test
dotnet new console -o project
dotnet new xunit -o test
dotnet add test\test.csproj reference project\project.csproj
dotnet new solution -n solution
dotnet sln solution.sln add test\test.csproj project\project.csproj
```
