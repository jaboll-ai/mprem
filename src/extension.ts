// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as jschardet from 'jschardet';
import * as iconv from 'iconv-lite';
import * as cp from 'child_process';

var input_device = "";
var auto_device = false;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

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
        auto_device = true;
    });
    let sync = vscode.commands.registerCommand('mprem.sync', () => {
        sync_device();
    });
    // let sync_specific = vscode.commands.registerCommand('mprem.sync-specific', () => {
    //     sync_device();
    // });
    let syncnclear = vscode.commands.registerCommand('mprem.syncnclear', () => {
        const files = parseFileLog();
        runCommandInMPremTerminal("mkdir ./mprem_files");
        files.forEach(file => {
            runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./mprem_files/${file.trim()}`);
        });
        deleteConfirmation(true);
    });
    let run = vscode.commands.registerCommand('mprem.run', () => {
        const activeFilePath = getActiveFilePath();
        // const activeFileName = getActiveFilePath(true);
        if (activeFilePath) {
            runCommandInMPremTerminal(`mpremote connect ${input_device} run \"${activeFilePath}\"`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let save = vscode.commands.registerCommand('mprem.save', () => {
        const activeFilePath = getActiveFilePath();
        if (activeFilePath) {
            runCommandInMPremTerminal(`mpremote connect ${input_device} cp \"${activeFilePath}\" :.`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let mount = vscode.commands.registerCommand('mprem.mount', () => {
        runCommandInMPremTerminal("mkdir ./remote");
        runCommandInMPremTerminal(`cd ./remote`);
        runCommandInMPremTerminal(`mpremote connect ${input_device} mount ./`);
        runCommandInMPremTerminal(`cd ..`);
    });
    let soft_reset = vscode.commands.registerCommand('mprem.soft_reset', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} soft-reset`);
    });
    let hard_reset = vscode.commands.registerCommand('mprem.hard_reset', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} reset`);
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
    if(auto_device) {
        const cmd_words = command.split(" ");
        command = command.split(" ").splice(1,2).join(" ");
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
        const file_lst = await parseFileLog();
        file_lst.forEach(file => {
            if (file !== "boot.py") {
                runCommandInMPremTerminal(`mpremote connect ${input_device} rm ${file.trim()}`);
                // runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
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

async function parseFileLog(): Promise<string[]> {
    
}

async function getDevices(): Promise<string[]> {
    const output = await execShell("mpremote connect list");
    const logContentRaw = output.trim();
    return logContentRaw.split("\n");
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

    runCommandInMPremTerminal(`mkdir ./mprem_files`);
    const files = await parseFileLog();
    // Show the quick pick menu
    vscode.window.showQuickPick(options).then((selectedOption) => {
        if (selectedOption) {
            // Handle the selected option
            if (selectedOption.label === "From") {
                if(!extension) {
                    files.forEach(file => {
                        runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./mprem_files/${file.trim()}`);
                    });
                } else {
                    files.forEach(file => {
                        if (file.endsWith(extension)) {
                            runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./mprem_files/${file.trim()}`);
                        }
                    });
                }
                // runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
            } else if (selectedOption.label === "To") {
                if(!extension) {
                    deleteConfirmation(true);
                    runCommandInMPremTerminal(`mpremote connect ${input_device} cp -r ./mprem_files/ :`);
                    runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
                }
                else {
                    files.forEach(file => {
                        if (file.endsWith(extension)) {
                            runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./mprem_files/${file.trim()}`);
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