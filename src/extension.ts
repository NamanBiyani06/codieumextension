/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

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

let currentPanel: vscode.WebviewPanel | undefined = undefined;
let debounceTimer: NodeJS.Timeout | undefined = undefined;
let currentAbstractionLevel: number = 3; // 1=most abstract, 5=most detailed

// Abstraction levels configuration
const ABSTRACTION_LEVELS = {
	1: { name: 'High-Level Overview', prompt: 'Provide a very high-level, single sentence summary of what this code does.' },
	2: { name: 'Key Components', prompt: 'Summarize the main components and their primary purposes in 2-3 sentences.' },
	3: { name: 'Functional Summary', prompt: 'Explain the key functions, classes, and their interactions in a paragraph.' },
	4: { name: 'Detailed Analysis', prompt: 'Provide a detailed explanation of the code structure, logic flow, and important implementation details.' },
	5: { name: 'Complete Breakdown', prompt: 'Give a comprehensive analysis including all functions, variables, edge cases, and technical implementation details.' }
};

// Simple in-memory database for storing summaries
interface SummaryRecord {
	filePath: string;
	level: number;
	summary: string;
	contentHash: string;
	timestamp: number;
}

// Initialize database immediately at module level
let summaryDatabase: Map<string, SummaryRecord> = new Map();

// Function to get database file path
function getDatabasePath(): string {
	const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
	const baseDir = workspaceFolder?.uri.fsPath || vscode.env.appRoot;
	return path.join(baseDir, '.vscode', 'ai-analysis-db.json');
}

// Function to load database from disk
function loadDatabaseFromDisk(): void {
	try {
		const dbPath = getDatabasePath();
		if (fs.existsSync(dbPath)) {
			const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
			summaryDatabase = new Map(Object.entries(data).map(([key, value]) => [key, value as SummaryRecord]));
			console.log(`Loaded ${summaryDatabase.size} entries from database`);
		} else {
			console.log('No existing database found, starting with empty database');
		}
	} catch (error) {
		console.error('Failed to load database:', error);
		summaryDatabase = new Map();
	}
}

export function activate(context: vscode.ExtensionContext) {
	// Load database from disk on activation
	loadDatabaseFromDisk();

	// Function to check if a document is a code file
	function isCodeFile(document: vscode.TextDocument | undefined): boolean {
		if (!document) {
			return false;
		}

		return CODE_LANGUAGES.has(document.languageId);
	}

	// Function to save database to disk
	function saveDatabase(): void {
		try {
			const dbPath = getDatabasePath();
			const dbDir = path.dirname(dbPath);

			// Create directory if it doesn't exist
			if (!fs.existsSync(dbDir)) {
				fs.mkdirSync(dbDir, { recursive: true });
			}

			const data = Object.fromEntries(summaryDatabase);
			fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
			console.log(`Saved ${summaryDatabase.size} entries to database`);
		} catch (error) {
			console.error('Failed to save database:', error);
		}
	}

	// Function to generate database key
	function getDatabaseKey(filePath: string, level: number): string {
		return `${filePath}:level${level}`;
	}

	// Function to save summary to database
	function saveSummaryToDatabase(filePath: string, level: number, summary: string, contentHash: string): void {
		const key = getDatabaseKey(filePath, level);
		const record: SummaryRecord = {
			filePath,
			level,
			summary,
			contentHash,
			timestamp: Date.now()
		};

		summaryDatabase.set(key, record);
		saveDatabase();
	}

	// Function to load summary from database
	function loadSummaryFromDatabase(filePath: string, level: number, currentContentHash: string): string | null {
		const key = getDatabaseKey(filePath, level);
		const record = summaryDatabase.get(key);

		if (record && record.contentHash === currentContentHash) {
			return record.summary;
		}

		return null;
	}

	// Function to generate content hash
	function generateContentHash(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
	}

	// Function to generate simple summary format
	async function generateSimpleSummary(code: string, level: number): Promise<string> {
		// Simple format: "Abstraction level X + TEXT OF FILE SELECTED"
		// Simulate processing time (remove this later when connecting to AI)
		await new Promise(resolve => setTimeout(resolve, 500));

		return `Abstraction level ${level} + ${code}`;
	}

	// Function to get or generate summary for current abstraction level
	async function getCurrentSummary(): Promise<string> {
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor || !activeEditor.document) {
			return 'No active editor';
		}

		const filePath = activeEditor.document.fileName;
		const code = activeEditor.document.getText();

		if (code.length === 0) {
			return 'Empty file';
		}

		const contentHash = generateContentHash(code);

		// Try to load from database first
		const cachedSummary = loadSummaryFromDatabase(filePath, currentAbstractionLevel, contentHash);
		if (cachedSummary) {
			console.log(`Loaded from database: ${filePath} level ${currentAbstractionLevel}`);
			return cachedSummary;
		}

		// Generate new summary
		try {
			console.log(`Generating new summary: ${filePath} level ${currentAbstractionLevel}`);
			const summary = await generateSimpleSummary(code, currentAbstractionLevel);

			// Save to database
			saveSummaryToDatabase(filePath, currentAbstractionLevel, summary, contentHash);

			return summary;
		} catch (error) {
			return `Error generating summary: ${error}`;
		}
	}

	// Function to create or show the sample text panel
	function showSampleTextPanel() {
		const config = vscode.workspace.getConfiguration('sampleTextPanel');
		const enabled = config.get('enabled', true);

		if (!enabled) {
			return;
		}

		if (currentPanel) {
			// If panel exists, don't recreate it
			return;
		}

		// Create a new webview panel
		currentPanel = vscode.window.createWebviewPanel(
			SAMPLE_TEXT_VIEW_TYPE,
			'AI Code Analysis',
			{ viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		// Handle messages from the webview
		currentPanel.webview.onDidReceiveMessage(
			async (message: any) => {
				switch (message.command) {
					case 'changeLevel':
						currentAbstractionLevel = message.level;
						await updatePanelContent();
						break;
				}
			},
			undefined,
			context.subscriptions
		);

		// Set the webview content
		updatePanelContent();

		// Handle panel disposal
		currentPanel.onDidDispose(() => {
			currentPanel = undefined;
		}, null, context.subscriptions);

		// Update content when document content changes
		const documentChangeListener = vscode.workspace.onDidChangeTextDocument((e: vscode.TextDocumentChangeEvent) => {
			if (currentPanel && vscode.window.activeTextEditor?.document === e.document) {
				updatePanelContent();
			}
		});
		context.subscriptions.push(documentChangeListener);

		// Update content when configuration changes (only register once)
		const configChangeListener = vscode.workspace.onDidChangeConfiguration((e: vscode.ConfigurationChangeEvent) => {
			if (e.affectsConfiguration('sampleTextPanel') && currentPanel) {
				updatePanelContent();
			}
		});
		context.subscriptions.push(configChangeListener);
	}

	// Function to hide the sample text panel
	function hideSampleTextPanel() {
		if (currentPanel) {
			currentPanel.dispose();
			currentPanel = undefined;
		}
	}

	// Function to generate HTML for the panel
	function generateHTML(fileName: string, content: string, isLoading: boolean = false): string {
		return `
			<!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<title>AI Code Analysis</title>
				<style>
					body {
						font-family: var(--vscode-font-family);
						font-size: var(--vscode-font-size);
						color: var(--vscode-foreground);
						background-color: var(--vscode-editor-background);
						padding: 0;
						margin: 0;
						line-height: 1.6;
						height: 100vh;
						display: flex;
						flex-direction: column;
					}

					.slider-container {
						position: fixed;
						bottom: 20px;
						right: 20px;
						z-index: 1000;
						background-color: var(--vscode-panel-background);
						border: 1px solid var(--vscode-panel-border);
						border-radius: 6px;
						padding: 8px 12px;
						box-shadow: 0 2px 8px rgba(0,0,0,0.15);
						opacity: 0.7;
						transition: opacity 0.2s ease;
					}

					.slider-container:hover {
						opacity: 1;
					}

					.slider-wrapper {
						display: flex;
						align-items: center;
						gap: 8px;
						min-width: 120px;
					}

					.slider-text {
						font-size: 0.7em;
						color: var(--vscode-descriptionForeground);
						min-width: 20px;
						text-align: center;
					}

					.slider {
						flex: 1;
						height: 3px;
						border-radius: 2px;
						background: var(--vscode-scrollbarSlider-background);
						outline: none;
						-webkit-appearance: none;
						appearance: none;
					}

					.slider::-webkit-slider-thumb {
						-webkit-appearance: none;
						appearance: none;
						width: 12px;
						height: 12px;
						border-radius: 50%;
						background: var(--vscode-button-background);
						cursor: pointer;
					}

					.slider::-moz-range-thumb {
						width: 12px;
						height: 12px;
						border-radius: 50%;
						background: var(--vscode-button-background);
						cursor: pointer;
						border: none;
					}

					.content {
						flex: 1;
						padding: 20px;
						overflow-y: auto;
						padding-bottom: 80px; /* Space for floating slider */
					}

					.summary-text {
						font-family: var(--vscode-editor-font-family);
						font-size: var(--vscode-editor-font-size);
						line-height: 1.6;
						color: var(--vscode-editor-foreground);
						white-space: pre-wrap;
					}

					.loading {
						color: var(--vscode-descriptionForeground);
						font-style: italic;
					}
				</style>
			</head>
			<body>
				<div class="content">
					<div class="summary-text ${isLoading ? 'loading' : ''}">${escapeHtml(content)}</div>
				</div>

				<div class="slider-container">
					<div class="slider-wrapper">
						<span class="slider-text">1</span>
						<input type="range" min="1" max="5" value="${currentAbstractionLevel}" class="slider" id="abstractionSlider">
						<span class="slider-text">5</span>
					</div>
				</div>

				<script>
					const vscode = acquireVsCodeApi();
					const slider = document.getElementById('abstractionSlider');

					slider.addEventListener('input', (e) => {
						vscode.postMessage({
							command: 'changeLevel',
							level: parseInt(e.target.value)
						});
					});
				</script>
			</body>
			</html>
		`;
	}

	// Function to update panel content
	async function updatePanelContent() {
		if (!currentPanel) {
			return;
		}

		const activeEditor = vscode.window.activeTextEditor;
		const fileName = activeEditor?.document.fileName || 'Unknown file';

		// Show loading state first
		currentPanel.webview.html = generateHTML(fileName, 'Loading AI summary...', true);

		// Get AI summary
		const summary = await getCurrentSummary();

		// Update with actual content
		currentPanel.webview.html = generateHTML(fileName, summary, false);
	}

	// Function to escape HTML
	function escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#39;');
	}

	// Debounced function to handle editor changes
	function handleEditorChange(editor: vscode.TextEditor | undefined) {
		// Clear any existing timer
		if (debounceTimer) {
			clearTimeout(debounceTimer);
		}

		// Set a new timer to debounce rapid changes
		debounceTimer = setTimeout(() => {
			const shouldShowPanel = editor && isCodeFile(editor.document);
			const panelExists = currentPanel !== undefined;
			const panelCurrentlyVisible = currentPanel && currentPanel.visible;

			if (shouldShowPanel && !panelExists) {
				// Only create panel if it doesn't exist at all
				showSampleTextPanel();
			} else if (shouldShowPanel && panelExists && !panelCurrentlyVisible) {
				// Reveal existing panel without focus
				if (currentPanel) {
					currentPanel.reveal(vscode.ViewColumn.Beside, true);
				}
			} else if (shouldShowPanel && panelExists && panelCurrentlyVisible) {
				// Update content when switching between code files
				updatePanelContent();
			} else if (!shouldShowPanel && panelCurrentlyVisible) {
				// Hide panel when switching away from code files
				hideSampleTextPanel();
			}
			// If both are code files or both are non-code files, do nothing
		}, 200); // Longer debounce for more stability
	}

	// Listen for active editor changes
	vscode.window.onDidChangeActiveTextEditor(handleEditorChange, null, context.subscriptions);

	// Check current editor on activation
	if (vscode.window.activeTextEditor && isCodeFile(vscode.window.activeTextEditor.document)) {
		showSampleTextPanel();
	}

	// Register command to toggle the panel
	const toggleCommand = vscode.commands.registerCommand('sampleTextPanel.toggle', () => {
		if (currentPanel) {
			hideSampleTextPanel();
		} else {
			showSampleTextPanel();
		}
	});

	context.subscriptions.push(toggleCommand);

	// Register webview panel serializer for persistence
	vscode.window.registerWebviewPanelSerializer(SAMPLE_TEXT_VIEW_TYPE, {
		async deserializeWebviewPanel(webviewPanel: vscode.WebviewPanel, state: any) {
			currentPanel = webviewPanel;

			// Restore abstraction level from state if available
			if (state && state.abstractionLevel) {
				currentAbstractionLevel = state.abstractionLevel;
			}

			// Re-register message handler
			currentPanel.webview.onDidReceiveMessage(
				async (message: any) => {
					switch (message.command) {
						case 'changeLevel':
							currentAbstractionLevel = message.level;
							await updatePanelContent();
							break;
					}
				},
				undefined,
				context.subscriptions
			);

			updatePanelContent();

			// Re-register disposal handler
			currentPanel.onDidDispose(() => {
				currentPanel = undefined;
			});
		}
	});
}

export function deactivate() {
	// Clean up resources when extension is deactivated
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
}