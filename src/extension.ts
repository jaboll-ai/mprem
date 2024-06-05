// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';

var input_device = "";
var auto_device = false;
const seperator = process.platform==="win32" ? "\r\n" : "\n";
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    let vpath = path.join(context.extensionPath, 'python');
    let ppath = path.join(context.extensionPath, 'python', 'Scripts', process.platform==="win32" ? 'python.exe' : 'python3');
    let esptool = path.join(context.extensionPath, 'python', 'Scripts', process.platform==="win32" ? 'esptool.exe' : 'esptool.py');
    let mpremote = path.join(context.extensionPath, 'python', 'Scripts', 'mpremote');
    if (!fs.existsSync(vpath)) {
        vscode.window.showErrorMessage('Missing, creating python backend');
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "mprem",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ message: "Please wait for python backend..." });
            console.log(vpath, esptool);
            const terminal = vscode.window.createTerminal('backend');
            terminal.show();
            terminal.sendText(`python -m venv ${vpath} && ${ppath} -m pip install esptool mpremote`);
            const checkFileExists = async (filePath: string) => {
                return new Promise<boolean>((resolve) => {
                    fs.access(filePath, fs.constants.F_OK, (err) => {
                        resolve(!err);
                    });
                });
            };
            while (!(await checkFileExists(esptool))) {
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            vscode.window.showInformationMessage('Python backend created');
        });
        // vscode.window.showInformationMessage('A restart of Visual Studio Code might be required');
    }
    


    console.log('Extension "mprem" is now active! Path:', context.extensionPath);
    // Use the console to output diagnostic information (console.log) and errors (console.error)
    // This line of code will only be executed once when your extension is activated
    console.log('Congratulations, your extension "mprem" is now active!');
    // The command has been defined in the package.json file
    // Now provide the implementation of the command with registerCommand
    // The commandId parameter must match the command field in package.json
    let clear = vscode.commands.registerCommand('mprem.clear', () => {
        deleteConfirmation();
    });
    let override_device = vscode.commands.registerCommand('mprem.override', () => {
        auto_device = !auto_device;
    });
    let sync = vscode.commands.registerCommand('mprem.sync', () => {
        sync_device();
    });
    // let sync_specific = vscode.commands.registerCommand('mprem.sync-specific', () => {
    //     sync_device();
    // });
    let syncnclear = vscode.commands.registerCommand('mprem.syncnclear', () => {
        runCommandInMPremTerminal("mkdir ./mprem_files");
        copy_file_from("");
        deleteConfirmation(true);
    });
    let run = vscode.commands.registerCommand('mprem.run', () => {
        const activeFilePath = getActiveFilePath();
        // const activeFileName = getActiveFilePath(true);
        if (activeFilePath) {
            runCommandInMPremTerminal(`mpremote run \"${activeFilePath}\"`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let save = vscode.commands.registerCommand('mprem.save', () => {
        const activeFilePath = getActiveFilePath();
        if (activeFilePath) {
            runCommandInMPremTerminal(`mpremote cp \"${activeFilePath}\" :.`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let mount = vscode.commands.registerCommand('mprem.mount', () => {
        runCommandInMPremTerminal("mkdir ./remote");
        runCommandInMPremTerminal("mpremote mount ./remote");
    });
    let soft_reset = vscode.commands.registerCommand('mprem.soft_reset', () => {
        runCommandInMPremTerminal("mpremote soft-reset");
    });
    let hard_reset = vscode.commands.registerCommand('mprem.hard_reset', () => {
        runCommandInMPremTerminal("mpremote reset");
    });

    context.subscriptions.push(clear);
    context.subscriptions.push(sync);
    context.subscriptions.push(syncnclear);
    context.subscriptions.push(run);
    context.subscriptions.push(save);
    context.subscriptions.push(mount);
    context.subscriptions.push(soft_reset);
    context.subscriptions.push(hard_reset);
    context.subscriptions.push(override_device);
    let device_list = new MpremDevices(context, new MpremProvider());
}

// This method is called when your extension is deactivated
export function deactivate() { }

const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
      cp.exec(cmd, (err, out) => {
        if (err) {
          return resolve(cmd+' error!');
          //or,  reject(err);
        }
        return resolve(out);
      });
    });

function runCommandInMPremTerminal(command: string) {
    if (!input_device && !auto_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    if(!auto_device) {
        command = command.replace("mpremote", `mpremote connect ${input_device}`);
    }
    // Find the terminal with the specified name
    const mpremTerminal = vscode.window.terminals.find((terminal) => terminal.name === 'mprem');

    if (mpremTerminal) {
        // If the terminal exists, use it
        mpremTerminal.sendText(command);
    } else {
        // If the terminal does not exist, create a new one
        const newTerminal = vscode.window.createTerminal('mprem');
        newTerminal.sendText(command);
    }
}

async function deleteConfirmation(supress = false) {
    if (!input_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    if (!supress) {
        var userResponse = await vscode.window.showWarningMessage(
            'Do you really wish to delete everything on the device?',
            { modal: true },
            'Yes',
            'No'
        );
    } else {
        userResponse = "Yes";
    }

    if (userResponse === 'Yes') {
        const file_lst = await getFiles();
        file_lst.forEach(file => {
            if (file !== "boot.py") {
                runCommandInMPremTerminal(`mpremote rm ${file.trim()}`);
                // runCommandInMPremTerminal("mpremote ls");
            }
        });
    } else {
        vscode.window.showInformationMessage('Deletion canceled.');
    }
}

function getActiveFilePath(only_name = false): string | undefined {
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        const f_path = activeEditor.document.uri.fsPath;
        if (only_name) {
            return path.basename(f_path);
        }
        return f_path;
    }
}

async function getFiles(myPath=""): Promise<string[]> {
    if(!myPath){
        var output = await execShell(auto_device ? "mpremote ls" : `mpremote connect ${input_device}`);
    } else {
        var output = await execShell(`ls ${path.resolve(myPath)}`);
    } 
    const content = output.trim();
    return content.split(seperator);
}

async function getDevices(): Promise<string[]> {
    const output = await execShell("mpremote connect list");
    const content = output.trim();
    return content.split(seperator);
}

async function copy_file_from(extension:string) {
    const files = await getFiles();
    if(!extension) {
        files.forEach(file => {
            runCommandInMPremTerminal(`mpremote cp :${file.trim()} ./mprem_files/${file.trim()}`);
        });
    } else {
        files.forEach(file => {
            if (file.endsWith(extension)) {
                runCommandInMPremTerminal(`mpremote cp :${file.trim()} ./mprem_files/${file.trim()}`);
            }
        });
    }
}

async function sync_device() {
    var extension = "";
    if (!input_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    const undext = await vscode.window.showInputBox({ prompt: "Enter file extension, leave blank for all" });
    extension = undext ? undext : "";
    const options: vscode.QuickPickItem[] = [
        { label: 'From', description: '"From" device to local' },
        { label: 'To', description: 'From local "To" device' },
    ];
    runCommandInMPremTerminal("mkdir ./mprem_files");
    const files = await getFiles("./mprem_files");
    // Show the quick pick menu
    vscode.window.showQuickPick(options).then((selectedOption) => {
        if (selectedOption) {
            // Handle the selected option
            if (selectedOption.label === "From") {
                copy_file_from(extension);
            } else if (selectedOption.label === "To") {
                if(!extension) {
                    deleteConfirmation(true);
                    runCommandInMPremTerminal("mpremote cp -r ./mprem_files/ :");
                    runCommandInMPremTerminal("mpremote ls");
                }
                else {
                    files.forEach(file => {
                        if (file.endsWith(extension)) {
                            runCommandInMPremTerminal(`mpremote cp :${file.trim()} ./mprem_files/${file.trim()}`);
                        }
                    });
                }
            }
        }
    });
}

class MpremProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private devices: string[];

    constructor() {
        this.devices = [];
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }
    getChildren(element?: vscode.TreeItem | undefined): vscode.ProviderResult<vscode.TreeItem[]> {
        if (!element) {
            return Promise.resolve(this.buildTreeItems());
        }
        return Promise.resolve([]);
    }
    getParent(element: vscode.TreeItem): vscode.ProviderResult<vscode.TreeItem> {
        return undefined;
    }

    private async buildTreeItems(): Promise<vscode.TreeItem[]> {
        const devices_list = await getDevices();
        return devices_list.map(device =>
            new MpremDeviceItem(device, device.replace(/(?<=\w) .+/g, "").trim())
        );
    }
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }
}

class MpremDeviceItem extends vscode.TreeItem {
    private port: string;
    constructor(label: string, port: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.port = port;
    }

    command = {
        command: 'mprem.select_device',
        title: 'Select Device',
        arguments: [this],
    };

    getPort(): string {
        return this.port;
    }
}

class MpremDevices {
    public treeView: vscode.TreeView<vscode.TreeItem>;
    constructor(context: vscode.ExtensionContext, treeDataProvider: MpremProvider) {
        this.treeView = vscode.window.createTreeView('device_list', { treeDataProvider });
        const treedispose = vscode.window.registerTreeDataProvider('device_list', treeDataProvider);
        let select_device = vscode.commands.registerCommand('mprem.select_device', (device: MpremDeviceItem) => this.select_device(device));
        let refresh = vscode.commands.registerCommand('device_list.refreshEntry', () =>
            treeDataProvider.refresh()
        );

        context.subscriptions.push(this.treeView);
        context.subscriptions.push(treedispose);
        context.subscriptions.push(select_device);
        context.subscriptions.push(refresh);
    }

    select_device(device: MpremDeviceItem) {
        const devicePort = device.getPort();
        input_device = devicePort;
        vscode.window.showInformationMessage(`Selected device is on port: ${devicePort}`);
    }

}