/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CommentManager } from './commentManager';
import * as dotenv from 'dotenv';

const SAMPLE_TEXT_VIEW_TYPE = 'sampleTextPanel.view';

// List of programming language IDs that we consider as "code files"
const CODE_LANGUAGES = new Set([
	'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
	'go', 'rust', 'php', 'ruby', 'swift', 'kotlin', 'scala', 'dart',
	'html', 'css', 'scss', 'less', 'json', 'xml', 'yaml', 'sql',
	'shell', 'powershell', 'batch', 'dockerfile', 'makefile',
	'r', 'matlab', 'perl', 'lua', 'haskell', 'clojure', 'fsharp',
	'vb', 'objective-c', 'groovy', 'elixir', 'erlang'
]);

let debounceTimer: NodeJS.Timeout | undefined = undefined;

export function activate(context: vscode.ExtensionContext) {
	// Load environment variables from config.env file
	const envPath = path.join(context.extensionPath, 'config.env');
	const workspaceEnvPath = path.join(context.extensionPath, '..', 'config.env');
	console.log('Loading config.env from:', envPath);
	console.log('Workspace config.env path:', workspaceEnvPath);
	
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

	context.subscriptions.push(disposable1);

	// Register showStatus command
	const disposable2 = vscode.commands.registerCommand('codieumextension.showStatus', () => {
		vscode.window.showInformationMessage('Extension is active and ready!');
	});

	context.subscriptions.push(disposable2);



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

	// Register showUnifiedCommentPanel command
	const disposable4 = vscode.commands.registerCommand('codieumextension.showUnifiedCommentPanel', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}

		const filePath = editor.document.fileName;
		
		// Show progress
		await vscode.window.withProgress({
			location: vscode.ProgressLocation.Notification,
			title: "Generating AI Comments",
			cancellable: false
		}, async (progress) => {
			progress.report({ increment: 0, message: "Analyzing code..." });
			
			try {
				// Show unified panel with slider
				await commentManager.showUnifiedCommentsPanel(filePath);
				progress.report({ increment: 100, message: "AI comments panel ready!" });
			} catch (error: any) {
				vscode.window.showErrorMessage(`Failed to generate AI comments panel: ${error.message}`);
			}
		});
	});

	context.subscriptions.push(disposable4);

	// Create status bar items for comment level switching
	const statusBarItems: vscode.StatusBarItem[] = [];
	
	// Create status bar items for levels 1-5
	for (let level = 1; level <= 5; level++) {
		const statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100 - level);
		
		const levelNames = {
			1: 'High-Level',
			2: 'Components', 
			3: 'Functional',
			4: 'Detailed',
			5: 'Line-by-Line'
		};
		
		statusBarItem.text = `$(comment-discussion) ${level}`;
		statusBarItem.tooltip = `Switch to Level ${level}: ${levelNames[level as keyof typeof levelNames]} Comments`;
		statusBarItem.command = `codieumextension.switchToLevel${level}`;
		statusBarItem.show();
		
		statusBarItems.push(statusBarItem);
		context.subscriptions.push(statusBarItem);
	}

	// Register commands for each level
	for (let level = 1; level <= 5; level++) {
		const disposable = vscode.commands.registerCommand(`codieumextension.switchToLevel${level}`, async () => {
			// Check if current file is a code file
			if (!commentManager.isCurrentFileCodeFile()) {
				vscode.window.showWarningMessage('Please open a code file to generate AI comments.');
				return;
			}

			await commentManager.switchToLevel(level);
		});
		context.subscriptions.push(disposable);
	}

	// Function to check if a document is a code file
	function isCodeFile(document: vscode.TextDocument | undefined): boolean {
		if (!document) {
			return false;
		}

		return CODE_LANGUAGES.has(document.languageId);
	}




	// Register command to toggle the panel
	const toggleCommand = vscode.commands.registerCommand('sampleTextPanel.toggle', () => {
		vscode.window.showInformationMessage('Use "Show Unified Comment Panel" command instead!');
	});

	context.subscriptions.push(toggleCommand);
}

export function deactivate() {
	// Clean up resources when extension is deactivated
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
}