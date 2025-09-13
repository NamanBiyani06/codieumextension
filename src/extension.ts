// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { CommentManager } from './commentManager';
import * as dotenv from 'dotenv';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Load environment variables from .env file
	const envPath = path.join(context.extensionPath, '.env');
	const workspaceEnvPath = path.join(context.extensionPath, '..', '.env');
	console.log('Loading .env from:', envPath);
	console.log('Workspace .env path:', workspaceEnvPath);
	
	// Try both paths
	dotenv.config({ path: envPath });
	dotenv.config({ path: workspaceEnvPath });
	
	console.log('MARTIAN_API_KEY loaded:', !!process.env.MARTIAN_API_KEY);
	console.log('API Key value (first 10 chars):', process.env.MARTIAN_API_KEY?.substring(0, 10));

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "codieumextension" is now active!');

	// Initialize comment manager
	const commentManager = new CommentManager();

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

	// Register a command to show code and comments side by side (LLM-powered)
	const disposable3 = vscode.commands.registerCommand('codieumextension.showCodeCommentsPanel', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}

		const filePath = editor.document.fileName;
		
		// Show progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating Smart Comments",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0, message: "Analyzing code..." });
			
			try {
				await commentManager.showCommentsSideBySide(filePath);
				progress.report({ increment: 100, message: "Comments generated!" });
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to generate comments: ${error.message}`);
			}
		});
	});

	context.subscriptions.push(disposable3);

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
