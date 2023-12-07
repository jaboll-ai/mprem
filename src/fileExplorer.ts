import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as mkdirp from 'mkdirp';
import * as rimraf from 'rimraf';

//#region Utilities

export class MyFileSystemProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private files: string[];
	private input_device: string;
	private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null> = new vscode.EventEmitter<vscode.TreeItem | undefined | null>();
	readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null> = this._onDidChangeTreeData.event;

    constructor(input_device: string) {
        this.files = [];
		this.input_device = input_device;
		const term = vscode.window.createTerminal();
		// term.sendText(`mpremote connect ${input_device} fs ls > $env:temp/mprem_ls.log`);
		term.sendText(`mkdir $env:temp/mprem & ls > $env:temp/mprem/mprem_ls_root.log`);
    }

	parseLsLog(prefix = './') {
		if(this.input_device === "") {
			return [""];
		}
		const tempPath = path.join(process.env.TEMP || '/tmp', 'mprem/mprem_ls_root.log');
		const logContentRAW = fs.readFileSync(tempPath, 'utf8');
		const logContent = logContentRAW.replace(/\r\n {50}/gm, "");
		const lines = logContent.split(/\n/).slice(5); // Split the content by new line characters and discard the first 5 lines
		// Check if the line represents a directory and append a slash accordingly
		let tmpfiles = lines.map(line => line.startsWith('d----') ? `${line}/` : line);
		return tmpfiles.map(line => line.replace(/.{50}/g, '')); // Replace matches with an empty string
	}

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            return Promise.resolve(this.buildTreeItems(this.files));
        }

		console.log(element.label);
		const ls_string = this.parseLsLog(String(element.label).trim());
        return Promise.resolve(this.buildTreeItems(this.files));
    }

	update(device: string) {
		this.input_device = device;
		this.files = this.parseLsLog();
		this._onDidChangeTreeData.fire(undefined);
	}

    private buildTreeItems(files: string[]): vscode.TreeItem[] {
		if(this.input_device === ""){
			var btn = new vscode.TreeItem("Please set a device first. (mprem Device)", vscode.TreeItemCollapsibleState.None);
			btn.command = {
				command: 'mprem.device',
				title: 'Set Device',
				arguments: []
			};
			console.log("btn");
			return [btn];
		}
		console.log("not btn");
        return files.map(file => file.endsWith("/") ? new vscode.TreeItem(file.replace("/", ""), vscode.TreeItemCollapsibleState.Collapsed) : new vscode.TreeItem(file, vscode.TreeItemCollapsibleState.None));
    }
}

export class FileExplorer {
	constructor(context: vscode.ExtensionContext, input_device: string, treeDataProvider: MyFileSystemProvider) {
		context.subscriptions.push(vscode.window.createTreeView('fileExplorer', { treeDataProvider }));
		vscode.commands.registerCommand('fileExplorer.openFile', (resource) => this.openResource(resource));
	}

	private openResource(resource: vscode.Uri): void {
		vscode.window.showTextDocument(resource);
	}
}

class Node<T> {
	data: T;
	parent: Node<T> | null;
	children: Node<T>[] = [];
  
	constructor(data: T, parent: Node<T> | null = null) {
	  this.data = data;
	  this.parent = parent;
	}
  
	addChild(data: T): Node<T> {
	  const childNode = new Node(data, this);
	  this.children.push(childNode);
	  return childNode;
	}
  }