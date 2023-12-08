// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { FileExplorer } from './fileExplorer';
import { MyFileSystemProvider } from './fileExplorer';

var input_device = "";
const filesymprov = new MyFileSystemProvider(input_device);
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
    let pull = vscode.commands.registerCommand('mprem.pull', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} cp -r :./* .`);
	});
    let pullsub = vscode.commands.registerCommand('mprem.pullsub', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} cp -r :. .`);
	});
    let pullnclear = vscode.commands.registerCommand('mprem.pullnclear', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} cp -r :./* .`);
        runCommandInMPremTerminal(`mpremote connect ${input_device} rm -r :./*`);
	});
    let run = vscode.commands.registerCommand('mprem.run', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device} run`);
	});
    let safe = vscode.commands.registerCommand('mprem.safe', () => {
        runCommandInMPremTerminal(`mpremote connect ${input_device}`);
	});
    let device = vscode.commands.registerCommand('mprem.device', () => {
        getUserInput();
	});
    
    // new FileExplorer(context, input_device, filesymprov);

	context.subscriptions.push(clear);
	context.subscriptions.push(pull);
	context.subscriptions.push(pullsub);
	context.subscriptions.push(pullnclear);
	context.subscriptions.push(run);
	context.subscriptions.push(safe);
	context.subscriptions.push(device);
}

// This method is called when your extension is deactivated
export function deactivate() {}

function runCommandInMPremTerminal(command: string) {
    if (!input_device) {
        vscode.window.showErrorMessage('No device set. Please set a device first. (mprem Device)');
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

async function getUserInput() {
    const userInput = await vscode.window.showInputBox({
        prompt: 'Enter a device name (e.g. COM5 or /dev/ttyUSB0)',
        placeHolder: 'Enter device...',
    });

    if (userInput !== undefined) {
        vscode.window.showInformationMessage(`Device set to: ${userInput}`);
        input_device = userInput;
        filesymprov.update(userInput);
    } else {
        vscode.window.showErrorMessage('Not a valid device.');
    }
}

async function deleteConfirmation() {
    const userResponse = await vscode.window.showWarningMessage(
        'Do you really wish to delete everything on the device?',
        { modal: true },
        'Yes',
        'No'
    );

    if (userResponse === 'Yes') {
        runCommandInMPremTerminal(`mpremote connect ${input_device} rm -r :./*`);
    } else {
        vscode.window.showInformationMessage('Deletion canceled.');
    }
}