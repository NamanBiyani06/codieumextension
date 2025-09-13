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

	// Unified Comment Panel with Layer Switching
	const disposableUnifiedPanel = vscode.commands.registerCommand('codieumextension.showUnifiedCommentPanel', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showInformationMessage('No active editor found.');
			return;
		}
		
		const code = editor.document.getText();
		const fileName = editor.document.fileName.split('/').pop() || editor.document.fileName;
		const codeLines = code.split('\n');
		
		// Prepare data for all layers
		const lineByLineData = codeLines.map((line, idx) => ({
			lineNumber: idx + 1,
			code: line.trim() || '[blank]',
			comment: `Comment for: ${line.trim() || 'blank line'}`
		}));
		
		const scopeData = parseCodeScopes(code);
		const fileSummary = generateFileSummary(code, fileName);
		
		const panel = vscode.window.createWebviewPanel(
			'unifiedCommentPanel',
			'Code Comments Panel',
			vscode.ViewColumn.Beside,
			{ enableScripts: true }
		);
		
		panel.webview.html = generateUnifiedPanelHTML(fileName, lineByLineData, scopeData, fileSummary);
		
		// Handle messages from webview
		panel.webview.onDidReceiveMessage(
			message => {
				switch (message.command) {
					case 'switchLayer':
						updatePanelContent(panel, message.layer, lineByLineData, scopeData, fileSummary);
						return;
					case 'jumpToLine':
						const lineNumber = message.lineNumber;
						const range = new vscode.Range(lineNumber - 1, 0, lineNumber - 1, 0);
						editor.revealRange(range);
						editor.selection = new vscode.Selection(lineNumber - 1, 0, lineNumber - 1, 0);
						return;
				}
			},
			undefined,
			context.subscriptions
		);
	});
	context.subscriptions.push(disposableUnifiedPanel);

	// Helper functions for unified panel
	function parseCodeScopes(code: string): any[] {
		const lines = code.split('\n');
		const scopes: any[] = [];
		let currentScope: any = null;
		let braceCount = 0;
		
		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();
			const lineNumber = i + 1;
			
			// Detect function/class definitions
			if (line.match(/^(function|class|def|const|let|var)\s+\w+/)) {
				if (currentScope) {
					scopes.push(currentScope);
				}
				currentScope = {
					type: line.match(/^(function|class|def)/) ? 'function' : 'variable',
					name: line.match(/\w+/)?.[0] || 'unnamed',
					startLine: lineNumber,
					endLine: lineNumber,
					code: line,
					summary: `Summary for ${line.match(/^(function|class|def)/) ? 'function' : 'variable'}: ${line.substring(0, 50)}...`
				};
			}
			
			// Track brace levels for scope boundaries
			if (currentScope) {
				braceCount += (line.match(/\{/g) || []).length;
				braceCount -= (line.match(/\}/g) || []).length;
				
				if (braceCount === 0 && currentScope.startLine !== lineNumber) {
					currentScope.endLine = lineNumber;
					scopes.push(currentScope);
					currentScope = null;
				}
			}
		}
		
		if (currentScope) {
			currentScope.endLine = lines.length;
			scopes.push(currentScope);
		}
		
		return scopes.length > 0 ? scopes : [{
			type: 'file',
			name: 'entire file',
			startLine: 1,
			endLine: lines.length,
			code: 'No functions detected',
			summary: 'This file contains no detectable functions or classes.'
		}];
	}
	
	function generateFileSummary(code: string, fileName: string): any {
		const lines = code.split('\n');
		const nonEmptyLines = lines.filter(line => line.trim().length > 0);
		const functions = code.match(/(function|def|class)\s+\w+/g) || [];
		
		return {
			fileName,
			totalLines: lines.length,
			nonEmptyLines: nonEmptyLines.length,
			functionCount: functions.length,
			summary: `File: ${fileName}\nTotal lines: ${lines.length}\nNon-empty lines: ${nonEmptyLines.length}\nFunctions/classes: ${functions.length}\n\nThis file contains ${functions.length} functions/classes and ${lines.length} total lines of code.`
		};
	}
	
	function generateUnifiedPanelHTML(fileName: string, lineByLineData: any[], scopeData: any[], fileSummary: any): string {
		return `
		<!DOCTYPE html>
		<html lang='en'>
		<head>
			<meta charset='UTF-8'>
			<meta name='viewport' content='width=device-width, initial-scale=1.0'>
			<title>Code Comments Panel</title>
			<style>
				body { 
					font-family: var(--vscode-font-family); 
					font-size: var(--vscode-font-size); 
					color: var(--vscode-foreground); 
					background: var(--vscode-editor-background); 
					margin: 0; 
					padding: 0; 
				}
				.header { 
					background: var(--vscode-panel-background); 
					border-bottom: 1px solid var(--vscode-panel-border); 
					padding: 12px 16px; 
					display: flex; 
					justify-content: space-between; 
					align-items: center; 
				}
				.header h1 { 
					font-size: 1.1em; 
					margin: 0; 
					font-weight: 600; 
				}
				.file-name { 
					font-size: 0.85em; 
					color: var(--vscode-descriptionForeground); 
					margin-top: 2px; 
				}
				.layer-switcher { 
					display: flex; 
					gap: 4px; 
				}
				.layer-btn { 
					padding: 6px 12px; 
					border: 1px solid var(--vscode-panel-border); 
					background: var(--vscode-button-background); 
					color: var(--vscode-button-foreground); 
					border-radius: 4px; 
					cursor: pointer; 
					font-size: 0.85em; 
					transition: all 0.2s; 
				}
				.layer-btn:hover { 
					background: var(--vscode-button-hoverBackground); 
				}
				.layer-btn.active { 
					background: var(--vscode-button-secondaryBackground); 
					color: var(--vscode-button-secondaryForeground); 
				}
				.content { 
					padding: 16px; 
					height: calc(100vh - 60px); 
					overflow-y: auto; 
				}
				.line-item { 
					display: flex; 
					margin-bottom: 8px; 
					padding: 8px; 
					background: var(--vscode-textCodeBlock-background); 
					border-radius: 4px; 
					border-left: 3px solid var(--vscode-focusBorder); 
				}
				.line-number { 
					min-width: 40px; 
					font-weight: bold; 
					color: var(--vscode-textPreformat-foreground); 
					cursor: pointer; 
					margin-right: 12px; 
				}
				.line-number:hover { 
					color: var(--vscode-textLink-foreground); 
				}
				.code-content { 
					flex: 1; 
					font-family: var(--vscode-editor-font-family); 
					font-size: var(--vscode-editor-font-size); 
				}
				.comment { 
					margin-top: 4px; 
					font-style: italic; 
					color: var(--vscode-descriptionForeground); 
				}
				.scope-item { 
					margin-bottom: 16px; 
					padding: 12px; 
					background: var(--vscode-textCodeBlock-background); 
					border-radius: 6px; 
					border-left: 4px solid var(--vscode-charts-blue); 
				}
				.scope-header { 
					font-weight: bold; 
					margin-bottom: 8px; 
					display: flex; 
					justify-content: space-between; 
					align-items: center; 
				}
				.scope-name { 
					color: var(--vscode-textLink-foreground); 
				}
				.scope-range { 
					font-size: 0.8em; 
					color: var(--vscode-descriptionForeground); 
				}
				.scope-code { 
					font-family: var(--vscode-editor-font-family); 
					font-size: 0.9em; 
					margin-bottom: 8px; 
					padding: 8px; 
					background: var(--vscode-editor-background); 
					border-radius: 4px; 
					overflow-x: auto; 
				}
				.scope-summary { 
					font-style: italic; 
					color: var(--vscode-descriptionForeground); 
				}
				.summary-content { 
					background: var(--vscode-textCodeBlock-background); 
					padding: 16px; 
					border-radius: 6px; 
					white-space: pre-wrap; 
					font-family: var(--vscode-editor-font-family); 
				}
				.summary-stats { 
					display: grid; 
					grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); 
					gap: 12px; 
					margin-bottom: 16px; 
				}
				.stat-item { 
					text-align: center; 
					padding: 12px; 
					background: var(--vscode-editor-background); 
					border-radius: 4px; 
					border: 1px solid var(--vscode-panel-border); 
				}
				.stat-value { 
					font-size: 1.5em; 
					font-weight: bold; 
					color: var(--vscode-textLink-foreground); 
				}
				.stat-label { 
					font-size: 0.8em; 
					color: var(--vscode-descriptionForeground); 
					margin-top: 4px; 
				}
			</style>
		</head>
		<body>
			<div class='header'>
				<div>
					<h1>Code Comments Panel</h1>
					<div class='file-name'>${escapeHtml(fileName)}</div>
				</div>
				<div class='layer-switcher'>
					<button class='layer-btn active' onclick='switchLayer("lineByLine")'>Line-by-Line</button>
					<button class='layer-btn' onclick='switchLayer("scope")'>Scope Level</button>
					<button class='layer-btn' onclick='switchLayer("summary")'>File Summary</button>
				</div>
			</div>
			<div class='content' id='content'>
				${lineByLineData.map(item => `
					<div class='line-item'>
						<div class='line-number' onclick='jumpToLine(${item.lineNumber})'>${item.lineNumber}</div>
						<div class='code-content'>
							<div>${escapeHtml(item.code)}</div>
							<div class='comment'>${escapeHtml(item.comment)}</div>
						</div>
					</div>
				`).join('')}
			</div>
			
			<script>
				const vscode = acquireVsCodeApi();
				const lineByLineData = ${JSON.stringify(lineByLineData)};
				const scopeData = ${JSON.stringify(scopeData)};
				const fileSummary = ${JSON.stringify(fileSummary)};
				
				function switchLayer(layer) {
					// Update button states
					document.querySelectorAll('.layer-btn').forEach(btn => btn.classList.remove('active'));
					event.target.classList.add('active');
					
					// Update content
					const content = document.getElementById('content');
					switch(layer) {
						case 'lineByLine':
							content.innerHTML = generateLineByLineHTML(lineByLineData);
							break;
						case 'scope':
							content.innerHTML = generateScopeHTML(scopeData);
							break;
						case 'summary':
							content.innerHTML = generateSummaryHTML(fileSummary);
							break;
					}
					
					// Notify extension
					vscode.postMessage({ command: 'switchLayer', layer: layer });
				}
				
				function jumpToLine(lineNumber) {
					vscode.postMessage({ command: 'jumpToLine', lineNumber: lineNumber });
				}
				
				function generateLineByLineHTML(data) {
					return data.map(item => \`
						<div class='line-item'>
							<div class='line-number' onclick='jumpToLine(\${item.lineNumber})'>\${item.lineNumber}</div>
							<div class='code-content'>
								<div>\${escapeHtml(item.code)}</div>
								<div class='comment'>\${escapeHtml(item.comment)}</div>
							</div>
						</div>
					\`).join('');
				}
				
				function generateScopeHTML(data) {
					return data.map(scope => \`
						<div class='scope-item'>
							<div class='scope-header'>
								<div class='scope-name'>\${escapeHtml(scope.name)}</div>
								<div class='scope-range'>Lines \${scope.startLine}-\${scope.endLine}</div>
							</div>
							<div class='scope-code'>\${escapeHtml(scope.code)}</div>
							<div class='scope-summary'>\${escapeHtml(scope.summary)}</div>
						</div>
					\`).join('');
				}
				
				function generateSummaryHTML(summary) {
					return \`
						<div class='summary-stats'>
							<div class='stat-item'>
								<div class='stat-value'>\${summary.totalLines}</div>
								<div class='stat-label'>Total Lines</div>
							</div>
							<div class='stat-item'>
								<div class='stat-value'>\${summary.nonEmptyLines}</div>
								<div class='stat-label'>Non-empty</div>
							</div>
							<div class='stat-item'>
								<div class='stat-value'>\${summary.functionCount}</div>
								<div class='stat-label'>Functions</div>
							</div>
						</div>
						<div class='summary-content'>\${escapeHtml(summary.summary)}</div>
					\`;
				}
				
				function escapeHtml(text) {
					return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
				}
			</script>
		</body>
		</html>
		`;
	}
	
	function updatePanelContent(panel: vscode.WebviewPanel, layer: string, lineByLineData: any[], scopeData: any[], fileSummary: any) {
		// This function can be used to update panel content dynamically if needed
		// For now, the JavaScript in the webview handles the switching
	}

	function escapeHtml(text: string): string {
		return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
	}
}

// This method is called when your extension is deactivated
export function deactivate() {}
