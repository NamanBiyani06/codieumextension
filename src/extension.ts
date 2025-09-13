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

	// Register a command to show code and comments side by side
	const disposable3 = vscode.commands.registerCommand('codieumextension.showCodeCommentsPanel', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		// Split code into lines
		const codeLines = code.split('\n');
		// Generate placeholder comments for each line
		const commentLines = codeLines.map((line, idx) => `Comment for line ${idx + 1}`);
		// Build table rows
		let tableRows = '';
		for (let i = 0; i < codeLines.length; i++) {
			tableRows += `<tr>\n<td class='code-cell'><pre>${escapeHtml(codeLines[i])}</pre></td>\n<td class='comment-cell'>${escapeHtml(commentLines[i])}</td>\n</tr>`;
		}
		// Create and show panel
		const panel = vscode.window.createWebviewPanel(
			'codeCommentsPanel',
			'Code & Comments Side by Side',
			vscode.ViewColumn.Beside,
			{ enableScripts: false }
		);
		panel.webview.html = `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>Code & Comments</title>
			<style>
				body { font-family: var(--vscode-font-family); font-size: var(--vscode-font-size); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; padding: 16px; }
				.header { margin-bottom: 16px; }
				.header h1 { font-size: 1.2em; margin: 0; }
				.file-name { font-size: 0.9em; color: var(--vscode-descriptionForeground); margin-top: 4px; }
				table { width: 100%; border-collapse: collapse; }
				th, td { border: 1px solid var(--vscode-panel-border); padding: 4px 8px; vertical-align: top; }
				.code-cell { background: var(--vscode-editor-background); width: 60%; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); }
				.comment-cell { background: var(--vscode-textCodeBlock-background); width: 40%; font-family: var(--vscode-editor-font-family); font-size: var(--vscode-editor-font-size); color: var(--vscode-descriptionForeground); }
			</style>
		</head>
		<body>
			<div class='header'>
				<h1>Code & Comments Side by Side</h1>
				<div class='file-name'>${escapeHtml(fileName)}</div>
			</div>
			<table>
				<thead>
					<tr><th>Code</th><th>Comment</th></tr>
				</thead>
				<tbody>
					${tableRows}
				</tbody>
			</table>
		</body>
		</html>
		`;
	});
	context.subscriptions.push(disposable3);

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
