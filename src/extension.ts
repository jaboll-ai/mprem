// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as cp from 'child_process';
import * as fs from 'fs';
import axios from 'axios';
import * as cheerio from 'cheerio';

const seperator = process.platform==="win32" ? "\r\n" : "\n";
const python = process.platform==="win32" ? "python" : "python3";
var input_device = "";
var auto_device = false;
let binpath = "";
let mpremote = "";
let esptool = "";
let vpath = "";
let ppath = "";
let walker = "";
let customInterpreter = false;
let outputChannel: vscode.OutputChannel;
// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

    outputChannel = vscode.window.createOutputChannel('mprem');

    const scriptpath = path.join(context.extensionPath, 'python', process.platform==="win32" ? 'Scripts' : 'bin');
    binpath = path.join(context.extensionPath, 'bin', 'firmware.bin');
    walker = path.join(scriptpath, 'walker.py');
    if(!fs.existsSync(path.join(context.extensionPath, 'bin'))) {
        fs.mkdirSync(path.join(context.extensionPath, 'bin'));
    }
    vpath = path.join(context.extensionPath, 'python');
    ppath = path.join(scriptpath, process.platform==="win32" ? 'python.exe' : 'python3');
    esptool = path.join(scriptpath, process.platform==="win32" ? 'esptool.exe' : 'esptool.py');
    mpremote = path.join(scriptpath, 'mpremote');
    execShell(`${python} -V`)
        .catch(error => {
            vscode.window.showErrorMessage("Python not properly installed, please install and reload window");
            vscode.env.openExternal(vscode.Uri.parse('https://www.python.org/downloads/'));
        });
    if (!fs.existsSync(vpath)) {
        vscode.window.showErrorMessage('Missing, creating python backend');
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "mprem",
            cancellable: false
        }, async (progress, token) => {
            progress.report({ message: "Initializing tools..." });
            const terminal = vscode.window.createTerminal('backend');
            terminal.show();
            terminal.sendText(`${python} -m venv ${vpath} && ${ppath} -m pip install --upgrade pip && ${ppath} -m pip install esptool mpremote pip-search`);
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
            terminal.dispose();
            setTimeout(() => {
                vscode.commands.executeCommand("device_list.refreshEntry");
            }, 1000);
        });
        // vscode.window.showInformationMessage('A restart of Visual Studio Code might be required');
        
    }
    if (!fs.existsSync(walker)) {
        downloadFile('https://raw.githubusercontent.com/YolloPlays/mprem/main/backend/walker.py', walker);
    }
    

    // #### COMMANDS ####
    let clear = vscode.commands.registerCommand('mprem.clear', () => {
        deleteConfirmation();
    });
    let repair_backend = vscode.commands.registerCommand('mprem.repair', () => {
        const deleteFolderRecursive = (folderPath: string) => {
            if (fs.existsSync(folderPath)) {
                fs.readdirSync(folderPath).forEach((file) => {
                    const curPath = `${folderPath}/${file}`;
                    if (fs.lstatSync(curPath).isDirectory()) { // recurse
                        deleteFolderRecursive(curPath);
                    } else { // delete file
                        fs.unlinkSync(curPath);
                    }
                });
                fs.rmdirSync(folderPath);
            }
        };
        deleteFolderRecursive(vpath);
        vscode.window.showInformationMessage('Please restart Visual Studio Code');
    });
    let override_device = vscode.commands.registerCommand('mprem.override', () => {
        auto_device = !auto_device;
    });
    let install_stubs = vscode.commands.registerCommand('mprem.install_stubs', () => {
        installStubs();
    })
    let test = vscode.commands.registerCommand('mprem.test', () => {
        runCommandInMPremTerminal('\x03');
    });
    let stop = vscode.commands.registerCommand('mprem.stop', () => {
        runCommandInMPremTerminal('\x03');
    });
    let flash = vscode.commands.registerCommand('mprem.flash', () => {
        flashFirmware();
    });
    let sync = vscode.commands.registerCommand('mprem.sync', () => {
        sync_device();
    });
    // let sync_specific = vscode.commands.registerCommand('mprem.sync-specific', () => {
    //     sync_device();
    // });
    let run = vscode.commands.registerCommand('mprem.run', () => {
        const activeFilePath = getActiveFilePath();
        // const activeFileName = getActiveFilePath(true);
        if (activeFilePath) {
            runCommandInMPremTerminal(`${mpremote} run \"${activeFilePath}\"`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let save = vscode.commands.registerCommand('mprem.save', () => {
        const activeFilePath = getActiveFilePath();
        if (activeFilePath) {
            runCommandInMPremTerminal(`${mpremote} cp \"${activeFilePath}\" :.`);
        } else {
            vscode.window.showErrorMessage('No active file.');
        }
    });
    let mount = vscode.commands.registerCommand('mprem.mount', () => {
        if(!fs.existsSync(path.join(getCurrentWorkspaceFolderPath(), 'remote'))) {
            fs.mkdirSync(path.join(getCurrentWorkspaceFolderPath(), 'remote'));
        }
        runCommandInMPremTerminal(`${mpremote} mount ./remote`);
    });
    let soft_reset = vscode.commands.registerCommand('mprem.soft_reset', () => {
        runCommandInMPremTerminal(`${mpremote} soft-reset`);
    });
    let hard_reset = vscode.commands.registerCommand('mprem.hard_reset', () => {
        runCommandInMPremTerminal(`${mpremote} reset`);
    });
    let set_environment = vscode.commands.registerCommand('mprem.set_environment', () => {
        setPythonInterpreter();
    });

    context.subscriptions.push(clear);
    context.subscriptions.push(sync);
    context.subscriptions.push(run);
    context.subscriptions.push(save);
    context.subscriptions.push(mount);
    context.subscriptions.push(soft_reset);
    context.subscriptions.push(hard_reset);
    context.subscriptions.push(override_device);
    context.subscriptions.push(flash);
    context.subscriptions.push(repair_backend);
    context.subscriptions.push(stop);
    context.subscriptions.push(set_environment);
    context.subscriptions.push(install_stubs);
    let device_list = new MpremDevices(context, new MpremProvider());
}

// This method is called when your extension is deactivated
export async function deactivate() {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (pythonExtension) {
        if (!pythonExtension.isActive) {
            pythonExtension.activate();
        }
        const config = vscode.workspace.getConfiguration('python');
        const pythonAPI = pythonExtension.exports;
        pythonAPI.environments.updateActiveEnvironmentPath(config.get('defaultInterpreterPath'));
        config.update('analysis.diagnosticSeverityOverrides', undefined, vscode.ConfigurationTarget.Workspace);
    }
 }

 async function installStubs() {
    let options = await fetchStubNames();
    let selection = await vscode.window.showQuickPick(options);
    if (typeof selection == 'string') {
        let v = await vscode.window.showInputBox({ prompt: "Enter version" });
        if (typeof v == 'string') {
            let version = v ? "=="+v : '';
            vscode.window.withProgress({
                location: vscode.ProgressLocation.Notification,
                title: "mprem",
                cancellable: true
            }, async (progress, token) => {
                progress.report({ message: "Installing stubs..." });
                await execShell(`${ppath} -m pip install ${selection}${version}`);
            });
        }
    }
 }

async function setPythonInterpreter() {
    const pythonExtension = vscode.extensions.getExtension('ms-python.python');
    if (pythonExtension) {
        if (!customInterpreter) {
            if (!pythonExtension.isActive) {
                await pythonExtension.activate();
            }
            const config = vscode.workspace.getConfiguration('python');
            const pythonAPI = pythonExtension.exports;
            pythonAPI.environments.updateActiveEnvironmentPath(ppath);
            await config.update('analysis.diagnosticSeverityOverrides', { "reportMissingModuleSource": "none"}, vscode.ConfigurationTarget.Workspace);
            customInterpreter = true;
        } else {
            deactivate();
            customInterpreter = false;
        }
    } else {
        vscode.window.showErrorMessage('Python extension not found');
    }
}

async function fetchStubNames(): Promise<string[]> {
    try {
        const response = await axios.get('https://micropython-stubs.readthedocs.io/en/main/packages.html');
        const $ = cheerio.load(response.data);
        const links = $('ul.simple');
        const imgFileNames: string[] = [];

        links.each((index, element) => {
            const li = $(element).find('li').first();
            if (li.length) {
                const img = li.find('img').first();
                if (img.length) {
                    const imgSrc = img.attr('src');
                    if (imgSrc) {
                        const imgFileName = imgSrc.split("?")[0].split("/").pop();
                        if (imgFileName) {
                            imgFileNames.push(imgFileName);
                        }
                    }
                }
            }
        });
        return imgFileNames;
    } catch (error) {
        console.error('Error fetching data:', error);
        return [];
    }
}

const fetchBoardLinks = async () => {
    try {
        const response = await axios.get('https://micropython.org/download/');
        const $ = cheerio.load(response.data);
        const cards = $('.board-card');
        const boards: string[] = [];
        cards.each((index, element) => {
            const href = $(element).attr('href');
            if (href) {
                boards.push(href);
            }
        });
        return boards;
    } catch (error) {
        console.error('Error fetching board links:', error);
        return [];
    }
};

async function getBins(boardCode: string): Promise<string[]> {
    try {
        const response = await axios.get(`https://micropython.org/download/${boardCode}`);
        const $ = cheerio.load(response.data);
        const binLinks: string[] = [];
        $('a[href$=".bin"]').each((index, element) => {
            const href = $(element).attr('href') || '';
            binLinks.push(`https://micropython.org${href}`);
        });
        if (binLinks.length === 0) {
            $('a[href$=".dfu"]').each((index, element) => {
                const href = $(element).attr('href') || '';
                binLinks.push(`https://micropython.org${href}`);
            });
        }
        return binLinks.slice(0, 2);
    } catch (error) {
        console.error('Error fetching binary links:', error);
        return [];
    }
}

async function downloadFile(url: string, filePath: string): Promise<void> {
    const response = await axios({
        url,
        method: 'GET',
        responseType: 'stream',
    });

    const writer = fs.createWriteStream(filePath);

    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
    });
}

async function flashFirmware() {
    if (!input_device && !auto_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    outputChannel.clear();
    let boards = await fetchBoardLinks();
    vscode.window.showQuickPick(boards).then((selectedItem) => {
        if (selectedItem) {
            getBins(selectedItem).then((binLinks) => {
                vscode.window.showQuickPick(binLinks).then((selectedBin) => {
                    if (selectedBin) {
                        downloadFile(selectedBin, binpath).then(() => {
                            console.log(`${esptool} --port ${input_device} write_flash --flash_mode keep --flash_size keep --erase-all 0x1000 ${binpath}`)
                            const child = cp.spawn(`${esptool} --port ${input_device} write_flash --flash_mode keep --flash_size keep --erase-all 0x1000 ${binpath}`, [], { shell: true });
                            child.stdout.setEncoding('utf-8');
                            child.stderr.setEncoding('utf-8');
                            outputChannel.show();
                            child.stdout.on('data', (data) => {
                                outputChannel.append(`${data}`);
                            });
                            child.stderr.on('data', (data) => {
                                outputChannel.append(`${data}`);
                                child.kill();
                            });
                            child.on('close', (code) => {
                                child.kill();
                            });
                        });
                    }
                });
            }).catch((error) => {
                console.error('Error:', error);
            });
        }
    });
}
const execShell = (cmd: string) =>
    new Promise<string>((resolve, reject) => {
      cp.exec(cmd, (err, out) => {
        if (err) {
        //   return resolve(cmd+' error!');
          return reject(err);
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
        const file_lst = (await getFiles()).reverse();
        file_lst.forEach(file => {
            if (file !== "/boot.py" && file !== "/") {
                runCommandInMPremTerminal(`${mpremote} rm ${file.trim()}`);
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

function getCurrentWorkspaceFolderPath(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        // Return the path of the first workspace folder
        return workspaceFolders[0].uri.fsPath;
    }
    return "";
}

async function getFiles(myPath=""): Promise<string[]> {
    if(!myPath){
        if (!input_device && !auto_device) {
            vscode.commands.executeCommand("device_list.focus");
            vscode.window.showErrorMessage('No device set. Please set a device first.');
            return [];
        }
        // var output = await execShell(auto_device ? `${mpremote} ls` : `${mpremote} connect ${input_device} ls`);
        var output = await execShell(`${mpremote} connect ${input_device} run ${walker}`);
    } else {
        var output = await execShell(`${ppath} ${walker} ${path.join(getCurrentWorkspaceFolderPath(), myPath)}`);
    }
    const content = output.split(seperator);
    const result:string[] = [];
    content.forEach((file)=>{
        if(file){ //ignore empty strings
            result.push(file);
    }});
    return result;
}

async function getDevices(): Promise<string[]> {
    const output = await execShell(`${mpremote} connect list`);
    const content = output.trim();
    return content.split(seperator);
}

async function copy_file_from(extension:string) {
    const files = await getFiles();
    files.forEach(file => {
        if (file.includes('.') && (!extension || file.endsWith(extension))) {
            createFolders(path.join(getCurrentWorkspaceFolderPath(), 'mprem_files', file), false);
            runCommandInMPremTerminal(`${mpremote} cp :${file.trim()} ./mprem_files/${file.trim()}`);
        }
    });
}

function createFolders(pth: string | undefined, microcontroller=true): void {
    if (typeof pth !== 'string') {
        return;
    }
    var sep = microcontroller ? "/" : path.sep;
    let folders = pth.split(sep);
    let currentPath = "";
    if(process.platform==="win32" && !microcontroller){ //overwrite for windows... again
        folders = folders.slice(1, folders.length);
        currentPath =  "C:\\";
    }
    folders.forEach((folder, index) => {
        // Check if the last part is a file
        if (index === folders.length - 1 && folder.includes('.')) {
            return;
        }
        if (folder) {
            currentPath += `${sep}${folder}`;
            if (microcontroller){
                runCommandInMPremTerminal(`${mpremote} mkdir ${currentPath}`);
            } else {
                if (!fs.existsSync(currentPath)) {
                    fs.mkdirSync(currentPath);
                }
            }
        }
    });
}

async function sync_device() {
    var extension = "";
    if (!input_device) {
        vscode.commands.executeCommand("device_list.focus");
        vscode.window.showErrorMessage('No device set. Please set a device first.');
        return;
    }
    const undext = await vscode.window.showInputBox({ prompt: "Enter file extension, leave blank for all" });
    extension = undext ? undext.replace(".", "") : "";
    const options: vscode.QuickPickItem[] = [
        { label: 'From', description: '"From" device to local' },
        { label: 'To', description: 'From local "To" device' },
    ];
    if(!fs.existsSync(path.join(getCurrentWorkspaceFolderPath(), 'mprem_files'))) {
        fs.mkdirSync(path.join(getCurrentWorkspaceFolderPath(), 'mprem_files'));
    }
    const files = await getFiles("./mprem_files");
    // Show the quick pick menu
    vscode.window.showQuickPick(options).then((selectedOption) => {
        if (selectedOption) {
            // Handle the selected option
            if (selectedOption.label === "From") {
                copy_file_from(extension);
            } else if (selectedOption.label === "To") {
                files.forEach(file => {
                    if (file.includes('.') && (!extension || file.endsWith(extension))) {
                        const subPath = file.trim().split("mprem_files").pop()?.replaceAll("\\", "/");
                        createFolders(subPath);
                        runCommandInMPremTerminal(`${mpremote} cp ${file.trim()} :${subPath}`);
                    }
                });
                
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
        // vscode.window.showInformationMessage(`Selected device is on port: ${devicePort}`);
        execShell(`${mpremote} connect ${input_device} df`).then(res =>
            vscode.commands.executeCommand('setContext', 'mprem.connected', true)
        ).catch(err => 
            vscode.commands.executeCommand('setContext', 'mprem.connected', false)
        );
    }

}

