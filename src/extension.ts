// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codieumextension" is now active!');

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable1 = vscode.commands.registerCommand('codieumextension.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from codeium!');
	});

	const disposable2 = vscode.commands.registerCommand('codieumextension.showStatus', () => {
		// Display extension status
		vscode.window.showInformationMessage('Extension is active and working!');
	});

	context.subscriptions.push(disposable1, disposable2);


	// Register a command to show the entire file contents in the side panel
	const disposable3 = vscode.commands.registerCommand('codieumextension.showCodeCommentsPanel', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		const panel = vscode.window.createWebviewPanel(
			'codeCommentsPanel',
			'File Contents',
			vscode.ViewColumn.Beside,
			{ enableScripts: false }
		);
		panel.webview.html = `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>File Contents</title>
			<style>
				body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
				.header { margin-bottom: 16px; }
				.header h1 { font-size: 1.2em; margin: 0; }
				.file-name { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
				.content { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre; overflow-x: auto; }
			</style>
		</head>
		<body>
			<div class='header'>
				<h1>File Contents</h1>
				<div class='file-name'>${escapeHtml(fileName)}</div>
			</div>
			<div class='content'>${escapeHtml(code)}</div>
		</body>
		</html>
		`;
	});

	context.subscriptions.push(disposable3);

	// Level 1: Line-by-line comments
	const disposableLineByLine = vscode.commands.registerCommand('codieumextension.showLineByLineComments', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		const codeLines = code.split('\n');
		const commentLines = codeLines.map((line, idx) => `Line ${idx + 1}: Comment for code: ${line.trim() ? escapeHtml(line.trim()) : '[blank]'}`);
		const panel = vscode.window.createWebviewPanel(
			'lineByLineCommentsPanel',
			'Line-by-Line Comments',
			vscode.ViewColumn.Beside,
			{ enableScripts: false }
		);
		panel.webview.html = `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>Line-by-Line Comments</title>
			<style>
				body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
				.header { margin-bottom: 16px; }
				.header h1 { font-size: 1.2em; margin: 0; }
				.file-name { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
				.content { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; overflow-x: auto; }
			</style>
		</head>
		<body>
			<div class='header'>
				<h1>Line-by-Line Comments</h1>
				<div class='file-name'>${escapeHtml(fileName)}</div>
			</div>
			<div class='content'>${commentLines.join('\n')}</div>
		</body>
		</html>
		`;
	});
	context.subscriptions.push(disposableLineByLine);

	// Level 2: Scope-level comments (function/block summaries)
	const disposableScopeLevel = vscode.commands.registerCommand('codieumextension.showScopeLevelComments', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		// Placeholder: Split by function keyword (for JS/TS/Python)
		const blocks = code.split(/\b(function |def |class )/).filter(Boolean);
		const blockComments = blocks.map((block, idx) => `Scope ${idx + 1}: Summary for block: ${escapeHtml(block.substring(0, 60))}...`);
		const panel = vscode.window.createWebviewPanel(
			'scopeLevelCommentsPanel',
			'Scope-Level Comments',
			vscode.ViewColumn.Beside,
			{ enableScripts: false }
		);
		panel.webview.html = `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>Scope-Level Comments</title>
			<style>
				body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
				.header { margin-bottom: 16px; }
				.header h1 { font-size: 1.2em; margin: 0; }
				.file-name { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
				.content { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; overflow-x: auto; }
			</style>
		</head>
		<body>
			<div class='header'>
				<h1>Scope-Level Comments</h1>
				<div class='file-name'>${escapeHtml(fileName)}</div>
			</div>
			<div class='content'>${blockComments.join('\n\n')}</div>
		</body>
		</html>
		`;
	});
	context.subscriptions.push(disposableScopeLevel);

	// Level 3: File summary
	const disposableFileSummary = vscode.commands.registerCommand('codieumextension.showFileSummary', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		// Placeholder summary
		const summary = `File Summary: This file contains ${code.split('\n').length} lines of code. Placeholder summary for the entire file.`;
		const panel = vscode.window.createWebviewPanel(
			'fileSummaryPanel',
			'File Summary',
			vscode.ViewColumn.Beside,
			{ enableScripts: false }
		);
		panel.webview.html = `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>File Summary</title>
			<style>
				body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
				.header { margin-bottom: 16px; }
				.header h1 { font-size: 1.2em; margin: 0; }
				.file-name { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
				.content { background: var(--vscode-textCodeBlock-background); border: 1px solid var(--vscode-panel-border); border-radius: 4px; padding: 16px; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); white-space: pre-wrap; overflow-x: auto; }
			</style>
		</head>
		<body>
			<div class='header'>
				<h1>File Summary</h1>
				<div class='file-name'>${escapeHtml(fileName)}</div>
			</div>
			<div class='content'>${escapeHtml(summary)}</div>
		</body>
		</html>
		`;
	});
	context.subscriptions.push(disposableFileSummary);

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
