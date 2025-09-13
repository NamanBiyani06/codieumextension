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
		
		// Generate Lorem Ipsum comments for each line
		const loremVariations = [
			"Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
			"Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
			"Ut enim ad minim veniam, quis nostrud exercitation ullamco.",
			"Laboris nisi ut aliquip ex ea commodo consequat.",
			"Duis aute irure dolor in reprehenderit in voluptate velit esse.",
			"Cillum dolore eu fugiat nulla pariatur.",
			"Excepteur sint occaecat cupidatat non proident.",
			"Sunt in culpa qui officia deserunt mollit anim id est laborum.",
			"Sed ut perspiciatis unde omnis iste natus error sit.",
			"Voluptatem accusantium doloremque laudantium, totam rem aperiam."
		];
		
		// Generate comment lines that match line numbers exactly
		const commentLines = codeLines.map((line, idx) => {
			if (line.trim().length === 0) return ''; // Empty line for empty code lines
			const loremIndex = idx % loremVariations.length;
			return loremVariations[loremIndex];
		});
		
		// Create a temporary comments file
		const commentsContent = commentLines.join('\n');
		const commentsFileName = fileName.replace(/\.[^/.]+$/, '_comments.txt');
		
		// Create and open the comments file
		vscode.workspace.openTextDocument({
			content: commentsContent,
			language: 'plaintext'
		}).then(doc => {
			vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
			vscode.window.showInformationMessage(`Comments file created: ${commentsFileName}`);
		});
	});
	context.subscriptions.push(disposable3);

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
