// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import * as jschardet from 'jschardet';
import * as iconv from 'iconv-lite';

var input_device = "";
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
    let sync = vscode.commands.registerCommand('mprem.sync', () => {
        sync_device();
    });
    let syncnclear = vscode.commands.registerCommand('mprem.syncnclear', () => {
        const files = parseFileLog();
        runCommandInMPremTerminal("mkdir ./mprem_files > NUL");
        runCommandInMPremTerminal(`cd ./mprem_files`);
        files.forEach(file => {
            runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./${file.trim()}`);
        });
        runCommandInMPremTerminal(`cd ..`);
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
        runCommandInMPremTerminal("mkdir ./remote 2>NUL");
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
    let device_list = new MpremDevices(context, new MpremProvider());
}

// This method is called when your extension is deactivated
export function deactivate() { }

function runCommandInMPremTerminal(command: string) {
    if (!input_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
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
    log_files();
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
        const file_lst = parseFileLog();
        file_lst.forEach(file => {
            if (file !== "boot.py") {
                runCommandInMPremTerminal(`mpremote connect ${input_device} rm ${file.trim()} >NUL 2>&1`);
                runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
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
function log_files() {
    const temp_path = path.resolve(os.tmpdir(), ".mprem_log");
    runCommandInMPremTerminal(`mpremote connect ${input_device} ls > \"${temp_path}\"`);
}
function log_devices() {
    const temp_path = path.resolve(os.tmpdir(), ".mprem_devices_log");
    runindisposeterm(`mpremote connect list >\"${temp_path}\"`);
    while (!fs.existsSync(temp_path)) { }
}
async function runindisposeterm(command: string) {
    const newTerminal = vscode.window.createTerminal({
        name: 'Background Task',
        hideFromUser: true,
    });
    newTerminal.sendText(command);
    await new Promise(resolve => setTimeout(resolve, 2000));
    newTerminal.dispose();
}


function parseFileLog(): string[] {
    log_files();
    const my_path = path.resolve(os.tmpdir(), '.mprem_log');
    console.log("Waiting for .mprem_log to be created...");
    while (!fs.existsSync(my_path)) {}
    console.log("Finished.\nWaiting for .mprem_log to be populated...");
    while (fs.readFileSync(my_path, 'utf-8') === "") {}
    const logContentRaw = detectFileEncodingandRead(my_path);
    const tmp1 = logContentRaw.replace(/^.{13}/gm, '');
    const tmpList = tmp1.split('\r\n');
    runindisposeterm(`rm \"${my_path}\"`);
    console.log("Log deleted");
    return tmpList.slice(0, -2);
}

function detectFileEncodingandRead(filePath: string): string {
    const buffer = fs.readFileSync(filePath);
    const result = jschardet.detect(buffer);
    while(!result.encoding) {}
    const encoding = result.encoding.toLowerCase();
    const content = iconv.decode(buffer, encoding);
    return content;
}

function parseDeviceLog(): string[] {
    log_devices();
    const my_path = path.resolve(os.tmpdir(), '.mprem_devices_log');
    console.log("Waiting for .mprem_devices_log to be created...");
    while (!fs.existsSync(my_path)) {}
    console.log("Finished.\nWaiting for .mprem_devices_log to be populated...");
    while (fs.readFileSync(my_path, 'utf-8') === "") {}
    console.log("Finished.\nEverything is ready.");
    const logContentRaw = detectFileEncodingandRead(my_path);
    runindisposeterm(`rm \"${my_path}\"`);
    console.log("Log deleted");
    return logContentRaw.split("\r\n");
}

function sync_device() {
    if (!input_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    const options: vscode.QuickPickItem[] = [
        { label: 'From', description: '"From" device to local' },
        { label: 'To', description: 'From local "To" device' },
    ];

    // Show the quick pick menu
    vscode.window.showQuickPick(options).then((selectedOption) => {
        if (selectedOption) {
            // Handle the selected option
            if (selectedOption.label === "From") {
                const files = parseFileLog();
                runindisposeterm("mkdir ./mprem_files 2>NUL");
                runCommandInMPremTerminal(`cd ./mprem_files`);
                files.forEach(file => {
                    runCommandInMPremTerminal(`mpremote connect ${input_device} cp :${file.trim()} ./${file.trim()} >NUL 2>&1`);
                });
                runCommandInMPremTerminal(`cd ..`);
                // runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
            } else if (selectedOption.label === "To") {
                runCommandInMPremTerminal("mkdir ./mprem_files 2>NUL");
                runCommandInMPremTerminal(`cd ./mprem_files`);
                deleteConfirmation(true);
                runCommandInMPremTerminal(`mpremote connect ${input_device} cp -r . : >NUL 2>&1`);
                runCommandInMPremTerminal(`cd ..`);
                runCommandInMPremTerminal(`mpremote connect ${input_device} ls`);
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

    private buildTreeItems(): vscode.TreeItem[] {
        const devices_list = parseDeviceLog();
        return devices_list.map(device =>
            new MpremDeviceItem(device, device.replace(/(?<=\w) .+/g, "").trim())
        );
    }
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    refresh(): void {
        log_devices();
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