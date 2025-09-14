import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { LLMRouter, CommentRequest, CommentResponse } from './llmRouter';
import { CommentStorage } from './commentStorage';

export class CommentManager {
    private llmRouter: LLMRouter;
    private storage: CommentStorage | undefined;
    
    // Legacy cache properties (kept for fallback)
    private commentCache: Map<string, string> = new Map();
    private hashCache: Map<string, string> = new Map();

    constructor() {
        this.llmRouter = new LLMRouter();
        
        // Initialize storage when workspace is available
        this.initializeStorage();
        
        // Create custom highlight decoration with a nice color
        this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 193, 7, 0.3)', // Nice amber/yellow background
            border: '1px solid #ffc107', // Amber border
            borderRadius: '2px',
            isWholeLine: true
        });
    }

    private initializeStorage(): void {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            this.storage = new CommentStorage(workspaceFolders[0].uri.fsPath);
            console.log('Initialized persistent comment storage');
        } else {
            console.warn('No workspace folder found, using in-memory cache only');
        }
    }

    async generateCommentsForFile(filePath: string, abstractionLevel: number = 5): Promise<string[]> {
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Read file content
            const content = fs.readFileSync(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const language = this.detectLanguage(fileName);

            // Check persistent storage first
            if (this.storage && this.storage.hasComments(filePath, abstractionLevel, content)) {
                const storedComments = this.storage.getComments(filePath, abstractionLevel);
                if (storedComments) {
                    console.log('Using stored comments for:', fileName, 'level', abstractionLevel);
                    return storedComments;
                }
            }

            // Fallback to legacy in-memory cache
            const cacheKey = `${filePath}:level${abstractionLevel}`;
            const fileHash = this.calculateHash(content);
            const cachedHash = this.hashCache.get(cacheKey);
            
            if (cachedHash === fileHash) {
                const cachedComments = this.commentCache.get(cacheKey);
                if (cachedComments) {
                    console.log('Using legacy cached comments for:', fileName, 'level', abstractionLevel);
                    return cachedComments.split('\n');
                }
            }

            // Generate new comments
            console.log('Generating new comments for:', fileName, 'level', abstractionLevel);
            const request: CommentRequest = {
                code: content,
                language,
                fileName,
                abstractionLevel
            };

            const response: CommentResponse = await this.llmRouter.generateComments(request);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to generate comments');
            }

            // Store in persistent storage
            if (this.storage) {
                this.storage.storeComments(
                    filePath, 
                    abstractionLevel, 
                    response.comments, 
                    content, 
                    response.model, 
                    language
                );
                console.log('Stored comments persistently for:', fileName, 'level', abstractionLevel);
            } else {
                // Fallback to legacy in-memory cache
            const commentsText = response.comments.join('\n');
            this.commentCache.set(cacheKey, commentsText);
            this.hashCache.set(cacheKey, fileHash);
                console.log('Stored comments in memory cache for:', fileName, 'level', abstractionLevel);
            }

            return response.comments;

        } catch (error: any) {
            console.error('Error generating comments:', error);
            throw error;
        }
    }

    async showCommentsSideBySide(originalFilePath: string, abstractionLevel: number = 5): Promise<void> {
        try {
            // Generate comments
            const comments = await this.generateCommentsForFile(originalFilePath, abstractionLevel);
            
            // Create comments content
            const commentsContent = comments.join('\n');
            const fileName = path.basename(originalFilePath);
            const commentsFileName = fileName.replace(/\.[^/.]+$/, '_comments.txt');

            // Create beautiful Scope webview with terminal styling
            const panel = vscode.window.createWebviewPanel(
                'scope',
                `🎯 Scope AI • ${fileName}`,
                vscode.ViewColumn.Beside,
                { enableScripts: true, retainContextWhenHidden: true }
            );

            // Generate terminal-style HTML
            panel.webview.html = this.generateTerminalHTML(fileName, commentsContent);
            
            // Store references for cursor sync
            this.originalFilePath = originalFilePath;
            this.currentPanel = panel;
            
            // Set up cursor sync for webview
            this.setupWebviewCursorSync();
            
            vscode.window.showInformationMessage(`Smart comments generated for ${fileName} using LLM!`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate comments: ${error.message}`);
        }
    }

    private currentPanel: vscode.WebviewPanel | undefined = undefined;
    private currentFilePath: string | undefined = undefined;
    private currentLevel: number = 5;
    
    // Side-by-side highlighting properties
    private originalFilePath: string | undefined = undefined;
    private commentsEditor: vscode.TextEditor | undefined = undefined;
    private cursorSyncDisposable: vscode.Disposable | undefined = undefined;
    private highlightDecorationType: vscode.TextEditorDecorationType;

    async showUnifiedCommentsPanel(originalFilePath: string, initialLevel: number = 5): Promise<void> {
        try {
            const fileName = path.basename(originalFilePath);
            this.currentFilePath = originalFilePath;
            this.currentLevel = initialLevel;
            
            // Create webview panel with Scope branding
            this.currentPanel = vscode.window.createWebviewPanel(
                'aiCommentsPanel',
                `🎯 Scope AI • ${fileName}`,
                vscode.ViewColumn.Beside,
                {
                    enableScripts: true,
                    retainContextWhenHidden: true
                }
            );

            // Initial content
            await this.updatePanelContent(this.currentLevel);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to create AI comments panel: ${error.message}`);
        }
    }

    async switchToLevel(level: number): Promise<void> {
        // If no panel is open, try to open one with the current active editor
        if (!this.currentPanel || !this.currentFilePath) {
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor) {
                vscode.window.showWarningMessage('No active editor found. Please open a code file first.');
                return;
            }

            const filePath = activeEditor.document.fileName;
            const fileName = path.basename(filePath);
            
            // Check if it's a code file
            const language = this.detectLanguage(fileName);
            if (language === 'text') {
                vscode.window.showWarningMessage('Please open a code file to generate AI comments.');
                return;
            }

            // Auto-open the panel with the requested level
            await this.showUnifiedCommentsPanel(filePath, level);
            return;
        }

        // Panel is already open, just switch the level
        this.currentLevel = level;
        await this.updatePanelContent(level);
    }

    private async updatePanelContent(level: number): Promise<void> {
        if (!this.currentPanel || !this.currentFilePath) {
            return;
        }

        const fileName = path.basename(this.currentFilePath);
        
        // Get current cursor position
        const editor = vscode.window.activeTextEditor;
        const currentLine = editor ? editor.selection.active.line : 0;
        
        console.log(`Updating panel content - Level: ${level}, Current Line: ${currentLine}`);
        
        try {
            this.currentPanel.webview.html = this.generateLoadingHTML(fileName, level);
            
            const comments = await this.generateCommentsForFile(this.currentFilePath, level);
            const content = comments.join('\n');
            
            this.currentPanel.webview.html = this.generateUnifiedHTML(fileName, content, level, currentLine);
        } catch (error: any) {
            this.currentPanel.webview.html = this.generateErrorHTML(fileName, error.message);
        }
    }

    private detectLanguage(fileName: string): string {
        const ext = path.extname(fileName).toLowerCase();
        
        const languageMap: { [key: string]: string } = {
            '.js': 'javascript',
            '.ts': 'typescript',
            '.py': 'python',
            '.java': 'java',
            '.cs': 'csharp',
            '.cpp': 'cpp',
            '.c': 'c',
            '.go': 'go',
            '.rs': 'rust',
            '.php': 'php',
            '.rb': 'ruby',
            '.swift': 'swift',
            '.kt': 'kotlin',
            '.scala': 'scala',
            '.r': 'r',
            '.m': 'matlab',
            '.sh': 'bash',
            '.sql': 'sql',
            '.html': 'html',
            '.css': 'css',
            '.scss': 'scss',
            '.less': 'less',
            '.json': 'json',
            '.xml': 'xml',
            '.yaml': 'yaml',
            '.yml': 'yaml',
            '.md': 'markdown',
            '.txt': 'text'
        };

        return languageMap[ext] || 'text';
    }

    private calculateHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    clearCache(): void {
        // Clear persistent storage
        if (this.storage) {
            this.storage.clearAll();
            console.log('Cleared persistent comment storage');
        }
        
        // Clear legacy in-memory cache
        this.commentCache.clear();
        this.hashCache.clear();
        console.log('Cleared legacy in-memory cache');
    }

    getCacheStats(): { 
        commentCount: number; 
        hashCount: number; 
        persistentStats?: {
            totalFiles: number;
            totalComments: number;
            storageSize: number;
            version: string;
        }
    } {
        const stats = {
            commentCount: this.commentCache.size,
            hashCount: this.hashCache.size
        };

        // Add persistent storage stats if available
        if (this.storage) {
            const persistentStats = this.storage.getStats();
            return {
                ...stats,
                persistentStats: {
                    totalFiles: persistentStats.totalFiles,
                    totalComments: persistentStats.totalComments,
                    storageSize: persistentStats.storageSize,
                    version: persistentStats.version
                }
            };
        }

        return stats;
    }

    private generateUnifiedHTML(fileName: string, content: string, level: number, currentLine: number = 0): string {
        const levelNames = {
            1: 'High-Level Overview',
            2: 'Key Components', 
            3: 'Functional Summary',
            4: 'Detailed Analysis',
            5: 'Line-by-Line Comments'
        };

        const levelDescriptions = {
            1: 'Single sentence summary of overall purpose',
            2: 'Main components and their purposes',
            3: 'Key functions and interactions',
            4: 'Code structure and implementation details',
            5: 'AI-generated comments for each line'
        };

        const isLineByLine = level === 5;

        if (isLineByLine) {
            return this.generateLineByLineHTML(fileName, content, level);
        } else {
            return this.generateSummaryHTML(fileName, content, level, levelNames[level as keyof typeof levelNames], levelDescriptions[level as keyof typeof levelDescriptions]);
        }
    }

    private generateLineByLineHTML(fileName: string, content: string, level: number): string {
        // For line-by-line, we'll show the comments in a structured format
        const commentLines = content.split('\n');
        
        let commentRows = '';
        commentLines.forEach((comment, index) => {
            const lineNum = index + 1;
            commentRows += `
                <div class="comment-row">
                    <span class="line-number">${lineNum}</span>
                    <span class="comment-text">${this.escapeHtml(comment || '')}</span>
                </div>
            `;
        });

        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Scope AI</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        background: #000;
                        color: #00ff00;
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        background: #111;
                        border-bottom: 1px solid #333;
                        padding: 15px 20px;
                    }

                    .header h2 {
                        margin: 0 0 8px 0;
                        color: #00ff00;
                        font-size: 1.2em;
                    }

                    .level-info {
                        color: #00aa00;
                        font-size: 0.9em;
                        margin-bottom: 15px;
                    }

                    .content {
                        flex: 1;
                        overflow-y: auto;
                        padding: 20px;
                    }

                    .comment-row {
                        display: flex;
                        margin-bottom: 8px;
                        align-items: flex-start;
                        min-height: 20px;
                    }

                    .line-number {
                        min-width: 40px;
                        width: 40px;
                        text-align: right;
                        padding-right: 10px;
                        color: #00aa00;
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 13px;
                        user-select: none;
                        opacity: 0.7;
                    }

                    .comment-text {
                        flex: 1;
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 13px;
                        line-height: 1.4;
                        color: #00ff00;
                        white-space: pre-wrap;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>AI Comments: ${this.escapeHtml(fileName)}</h2>
                    <div class="level-info">
                        <strong>Level 5:</strong> Line-by-Line Comments - AI-generated comments for each line
                    </div>
                </div>
                
                <div class="content">
                    ${commentRows}
                </div>
            </body>
            </html>
        `;
    }

    private generateSummaryHTML(fileName: string, content: string, level: number, levelName: string, levelDescription: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Analysis - ${fileName}</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 14px;
                        color: #00ff00;
                        background: #000;
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        background: #111;
                        border-bottom: 1px solid #333;
                        padding: 15px 20px;
                    }

                    .header h2 {
                        margin: 0 0 8px 0;
                        color: #00ff00;
                        font-size: 1.2em;
                    }

                    .level-info {
                        color: #00aa00;
                        font-size: 0.9em;
                        margin-bottom: 15px;
                    }

                    .content {
                        flex: 1;
                        overflow-y: auto;
                        padding: 20px;
                        padding-bottom: 80px;
                    }

                    .summary-text {
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 13px;
                        line-height: 1.6;
                        color: #00ff00;
                        white-space: pre-wrap;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <h2>AI Analysis: ${this.escapeHtml(fileName)}</h2>
                    <div class="level-info">
                        <strong>Level ${level}:</strong> ${levelName} - ${levelDescription}
                    </div>
                </div>
                
                <div class="content">
                    <div class="summary-text">${this.escapeHtml(content)}</div>
                </div>
            </body>
            </html>
        `;
    }

    private generateLoadingHTML(fileName: string, level: number): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Analysis - ${fileName}</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 14px;
                        color: #00ff00;
                        background: #000;
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .loading {
                        text-align: center;
                        color: #00aa00;
                        font-style: italic;
                    }
                </style>
            </head>
            <body>
                <div class="loading">Generating AI analysis for ${this.escapeHtml(fileName)}...</div>
            </body>
            </html>
        `;
    }

    private generateErrorHTML(fileName: string, error: string): string {
        return `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>AI Analysis - ${fileName}</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        font-size: 14px;
                        color: #00ff00;
                        background: #000;
                        padding: 20px;
                    }
                    .error {
                        color: #ff4444;
                        background: #330000;
                        border: 1px solid #ff4444;
                        padding: 15px;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="error">
                    <h3>Error generating AI analysis for ${this.escapeHtml(fileName)}</h3>
                    <p>${this.escapeHtml(error)}</p>
                </div>
            </body>
            </html>
        `;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    isCurrentFileCodeFile(): boolean {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) {
            return false;
        }

        const fileName = path.basename(activeEditor.document.fileName);
        const language = this.detectLanguage(fileName);
        return language !== 'text';
    }

    getCurrentFilePath(): string | undefined {
        const activeEditor = vscode.window.activeTextEditor;
        return activeEditor?.document.fileName;
    }

    async batchExportComments(progress: any): Promise<void> {
        try {
            // Get all code files in the workspace
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                throw new Error('No workspace folder found');
            }

            const codeFiles = await this.findCodeFiles(workspaceFolders[0].uri.fsPath);
            const totalFiles = codeFiles.length;
            
            if (totalFiles === 0) {
                vscode.window.showInformationMessage('No code files found to export.');
                return;
            }

            progress.report({ increment: 0, message: `Found ${totalFiles} files to process...` });

            let processed = 0;
            const allSummaries: string[] = [];
            let originalSize = 0;

            for (const filePath of codeFiles) {
                try {
                    progress.report({ 
                        increment: (processed / totalFiles) * 100, 
                        message: `Processing ${path.basename(filePath)}...` 
                    });

                    // Calculate original file size for metrics
                    const fileContent = require('fs').readFileSync(filePath, 'utf8');
                    originalSize += fileContent.length;

                    // Generate summary comments (level 2 - good balance for Cursor)
                    const comments = await this.generateCommentsForFile(filePath, 2);
                    const fileName = path.basename(filePath);
                    const relativePath = path.relative(workspaceFolders[0].uri.fsPath, filePath);
                    
                    const fileSummary = `## 📁 ${relativePath}

**File:** \`${fileName}\`
**Path:** \`${relativePath}\`

### Summary
${comments.join('\n')}

---`;

                    allSummaries.push(fileSummary);
                    
                } catch (error) {
                    console.error(`Failed to process ${filePath}:`, error);
                }
                
                processed++;
            }

            // Create single PROJECT-CONTEXT.md with all summaries
            const contextFilePath = path.join(workspaceFolders[0].uri.fsPath, 'PROJECT-CONTEXT.md');
            const projectName = path.basename(workspaceFolders[0].uri.fsPath);
            
            const contextContent = `# 🎯 ${projectName} - Complete AI Context Guide

**🤖 For AI Assistants (Cursor, etc.):** This file contains optimized summaries of ALL code files in this project.

**📋 Instructions:** Use this file for complete project understanding instead of reading individual source files.

---

# 📂 Project File Summaries

${allSummaries.join('\n\n')}

---

## 🎯 How to Use This Context

- **Complete project overview** in one file
- **Level 2 abstractions** (balanced detail for AI understanding)
- **90% understanding with 10% of the tokens**
- **Generated by Scope** - AI Context Optimization

*Auto-generated: ${new Date().toLocaleString()} | Files processed: ${totalFiles}*
`;

            fs.writeFileSync(contextFilePath, contextContent);

            progress.report({ increment: 100, message: "Export complete!" });
            
            // Calculate and show metrics
            const contextSize = require('fs').statSync(contextFilePath).size;
            const tokenSavings = Math.round(((originalSize - contextSize) / Math.max(originalSize, 1)) * 100);
            
            vscode.window.showInformationMessage(
                `✅ Scope context exported! ${totalFiles} files → ${Math.round(contextSize/1000)}K (${tokenSavings}% token savings)`,
                'Open Context File', 'Show Metrics'
            ).then(selection => {
                if (selection === 'Open Context File') {
                    vscode.workspace.openTextDocument(contextFilePath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
                } else if (selection === 'Show Metrics') {
                    this.showContextQualityMetrics();
                }
            });

        } catch (error: any) {
            console.error('Error in batch export:', error);
            throw error;
        }
    }

    private async findCodeFiles(rootPath: string): Promise<string[]> {
        const codeFiles: string[] = [];
        const codeExtensions = [
            '.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.cs', '.cpp', '.c',
            '.go', '.rs', '.php', '.rb', '.swift', '.kt', '.scala', '.dart',
            '.html', '.css', '.scss', '.less', '.json', '.xml', '.yaml', '.yml',
            '.sql', '.sh', '.ps1', '.bat', '.r', '.m', '.pl', '.lua', '.hs',
            '.clj', '.fs', '.vb', '.groovy', '.ex', '.erl'
        ];

        const walkDir = (dir: string) => {
            try {
                const files = fs.readdirSync(dir);
                
                for (const file of files) {
                    const filePath = path.join(dir, file);
                    const stat = fs.statSync(filePath);
                    
                    if (stat.isDirectory()) {
                        // Skip common non-source directories
                        if (!['node_modules', '.git', 'dist', 'build', 'out', '.next', 'target'].includes(file)) {
                            walkDir(filePath);
                        }
                    } else {
                        const ext = path.extname(file).toLowerCase();
                        if (codeExtensions.includes(ext)) {
                            codeFiles.push(filePath);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error reading directory ${dir}:`, error);
            }
        };

        walkDir(rootPath);
        return codeFiles;
    }

    updateCurrentLineHighlight(): void {
        // Only update if panel is open and we're on stage 5 (line-by-line)
        if (!this.currentPanel || !this.currentFilePath || this.currentLevel !== 5) return;

        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor) return;

        // Update the panel with new current line highlighting
        this.updatePanelContent(this.currentLevel).catch(error => {
            console.error('Update current line highlight failed:', error);
        });
    }

    private setupCursorSync(): void {
        // Clean up any existing sync
        if (this.cursorSyncDisposable) {
            this.cursorSyncDisposable.dispose();
        }

        // Set up cursor sync between original file and comments
        this.cursorSyncDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
            // Only sync if the active editor is the original file
            if (!this.originalFilePath || !this.commentsEditor) return;
            
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.fileName !== this.originalFilePath) return;

            // Get current line in original file
            const currentLine = activeEditor.selection.active.line;
            
            // Highlight corresponding line in comments editor
            const commentsLine = Math.min(currentLine, this.commentsEditor.document.lineCount - 1);
            
            // Clear previous highlights
            this.commentsEditor.setDecorations(this.highlightDecorationType, []);
            
            // Add new highlight decoration
            const range = new vscode.Range(commentsLine, 0, commentsLine, 0);
            this.commentsEditor.setDecorations(this.highlightDecorationType, [range]);
            
            // Set selection and reveal the line in comments editor
            const newSelection = new vscode.Selection(commentsLine, 0, commentsLine, 0);
            this.commentsEditor.selection = newSelection;
            this.commentsEditor.revealRange(range, vscode.TextEditorRevealType.InCenter);
            
            console.log(`Synced cursor: Original line ${currentLine} → Comments line ${commentsLine}`);
        });
    }

    private generateTerminalHTML(fileName: string, commentsContent: string): string {
        // Split into individual lines for highlighting
        const commentLines = commentsContent.split('\n');
        
        let lineElements = '';
        commentLines.forEach((comment, index) => {
            const lineNum = index + 1;
            lineElements += `<div class="line" id="line-${index}">${lineNum}  ${this.escapeHtml(comment)}</div>\n`;
        });

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    body { 
                        font-family: 'SF Mono', Monaco, monospace; 
                        background: #000; 
                        color: #00ff00; 
                        padding: 20px; 
                        line-height: 1.4;
                        margin: 0;
                    }
                    .line {
                        padding: 2px 0;
                        transition: all 0.2s ease;
                    }
                    .line.highlighted {
                        background: #00ff00;
                        color: #000;
                        padding: 2px 8px;
                        margin: 0 -8px;
                        border-radius: 4px;
                    }
                </style>
            </head>
            <body>
                <div class="content">
                    ${lineElements}
                </div>
                
                <script>
                    window.addEventListener('message', event => {
                        const message = event.data;
                        if (message.command === 'highlightLine') {
                            document.querySelectorAll('.line.highlighted').forEach(line => {
                                line.classList.remove('highlighted');
                            });
                            
                            const targetLine = document.getElementById('line-' + message.line);
                            if (targetLine) {
                                targetLine.classList.add('highlighted');
                                targetLine.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }
                        }
                    });
                </script>
            </body>
            </html>
        `;
    }

    private setupWebviewCursorSync(): void {
        if (this.cursorSyncDisposable) {
            this.cursorSyncDisposable.dispose();
        }

        this.cursorSyncDisposable = vscode.window.onDidChangeTextEditorSelection((event) => {
            if (!this.originalFilePath || !this.currentPanel) return;
            
            const activeEditor = vscode.window.activeTextEditor;
            if (!activeEditor || activeEditor.document.fileName !== this.originalFilePath) return;

            const currentLine = activeEditor.selection.active.line;
            
            this.currentPanel.webview.postMessage({
                command: 'highlightLine',
                line: currentLine
            });
        });
    }

    // Auto-refresh and metrics features
    private contextMetrics = {
        filesProcessed: 0,
        totalTokensSaved: 0,
        lastRefresh: new Date(),
        refreshCount: 0
    };

    handleFileChange(document: vscode.TextDocument): void {
        // Auto-refresh context when code files change
        const fileName = document.fileName;
        const isCodeFile = this.detectLanguage(path.basename(fileName)) !== 'text';
        
        if (isCodeFile) {
            console.log(`File changed: ${fileName} - Stored comments may need refresh`);
            
            // Check if we have stored comments for this file
            if (this.storage) {
                const content = document.getText();
                let hasStoredComments = false;
                
                // Check all abstraction levels
                for (let level = 1; level <= 5; level++) {
                    if (this.storage.hasComments(fileName, level, content)) {
                        hasStoredComments = true;
                        break;
                    }
                }
                
                if (hasStoredComments) {
                    // File has changed, stored comments are now outdated
                    console.log(`Stored comments for ${fileName} are outdated due to file changes`);
                }
            }
            
            // Show subtle notification
            vscode.window.showInformationMessage(
                `📝 ${path.basename(fileName)} changed - Stored comments may be outdated`,
                'Refresh Comments', 'View Storage Stats'
            ).then(selection => {
                if (selection === 'Refresh Comments') {
                    // Clear stored comments for this file to force regeneration
                    if (this.storage) {
                        for (let level = 1; level <= 5; level++) {
                            this.storage.removeComments(fileName, level);
                        }
                    }
                    vscode.window.showInformationMessage('Stored comments cleared. New comments will be generated on next request.');
                } else if (selection === 'View Storage Stats') {
                    this.showStorageStats();
                }
            });
        }
    }

    showStorageStats(): void {
        // Create storage stats dashboard
        const panel = vscode.window.createWebviewPanel(
            'scopeStorage',
            '💾 Scope Comment Storage Stats',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.generateStorageStatsHTML();
    }

    showContextQualityMetrics(): void {
        // Create metrics dashboard
        const panel = vscode.window.createWebviewPanel(
            'scopeMetrics',
            '📊 Scope Context Metrics',
            vscode.ViewColumn.One,
            { enableScripts: true }
        );

        panel.webview.html = this.generateMetricsHTML();
    }

    private generateMetricsHTML(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders) return '<h1>No workspace found</h1>';

        // Calculate metrics
        const projectPath = workspaceFolders[0].uri.fsPath;
        const contextFile = path.join(projectPath, 'PROJECT-CONTEXT.md');
        const hasContext = require('fs').existsSync(contextFile);
        
        let contextSize = 0;
        let originalSize = 0;
        let tokenSavings = 0;

        if (hasContext) {
            const contextContent = require('fs').readFileSync(contextFile, 'utf8');
            contextSize = contextContent.length;
            
            // Estimate original codebase size
            this.findCodeFiles(projectPath).then(files => {
                files.forEach(file => {
                    try {
                        const content = require('fs').readFileSync(file, 'utf8');
                        originalSize += content.length;
                    } catch (e) {}
                });
            });
            
            tokenSavings = Math.round(((originalSize - contextSize) / originalSize) * 100);
        }

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Scope Metrics</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        background: #000;
                        color: #00ff00;
                        padding: 32px;
                        margin: 0;
                        line-height: 1.6;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 40px;
                    }
                    .logo {
                        font-size: 32px;
                        margin-bottom: 16px;
                    }
                    .title {
                        font-size: 24px;
                        font-weight: 600;
                        margin-bottom: 8px;
                    }
                    .subtitle {
                        color: #00aa00;
                        font-size: 14px;
                    }
                    .metrics-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                        gap: 20px;
                        margin: 40px 0;
                    }
                    .metric-card {
                        background: #111;
                        border: 1px solid #333;
                        border-radius: 8px;
                        padding: 20px;
                        text-align: center;
                    }
                    .metric-value {
                        font-size: 32px;
                        font-weight: 600;
                        color: #00ff00;
                        margin-bottom: 8px;
                    }
                    .metric-label {
                        color: #00aa00;
                        font-size: 14px;
                    }
                    .status {
                        margin: 20px 0;
                        padding: 16px;
                        background: ${hasContext ? '#003300' : '#330000'};
                        border: 1px solid ${hasContext ? '#00ff00' : '#ff4444'};
                        border-radius: 8px;
                        text-align: center;
                    }
                    .actions {
                        text-align: center;
                        margin-top: 32px;
                    }
                    .btn {
                        background: #00ff00;
                        color: #000;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 6px;
                        font-family: inherit;
                        font-weight: 600;
                        cursor: pointer;
                        margin: 0 8px;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">🎯</div>
                    <div class="title">Scope Context Metrics</div>
                    <div class="subtitle">AI Context Optimization Dashboard</div>
                </div>

                <div class="status">
                    ${hasContext ? 
                        '✅ PROJECT-CONTEXT.md exists - Cursor can use optimized context' : 
                        '❌ No context file found - Run "Export Comments for Cursor" to optimize'
                    }
                </div>

                <div class="metrics-grid">
                    <div class="metric-card">
                        <div class="metric-value">${Math.round(contextSize / 1000)}K</div>
                        <div class="metric-label">Context File Size</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${Math.round(originalSize / 1000)}K</div>
                        <div class="metric-label">Original Codebase Size</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${tokenSavings}%</div>
                        <div class="metric-label">Token Savings</div>
                    </div>
                    <div class="metric-card">
                        <div class="metric-value">${this.contextMetrics.filesProcessed}</div>
                        <div class="metric-label">Files Processed</div>
                    </div>
                </div>

                <div class="actions">
                    <button class="btn" onclick="refreshContext()">🔄 Refresh Context</button>
                    <button class="btn" onclick="openContext()">📄 View Context File</button>
                </div>

                <script>
                    function refreshContext() {
                        vscode.postMessage({ command: 'refreshContext' });
                    }
                    function openContext() {
                        vscode.postMessage({ command: 'openContext' });
                    }
                </script>
            </body>
            </html>
        `;
    }

    private generateStorageStatsHTML(): string {
        if (!this.storage) {
            return `
                <!DOCTYPE html>
                <html>
                <head>
                    <meta charset="UTF-8">
                    <title>Storage Stats</title>
                    <style>
                        body {
                            font-family: 'SF Mono', Monaco, monospace;
                            background: #000;
                            color: #ff4444;
                            padding: 32px;
                            text-align: center;
                        }
                    </style>
                </head>
                <body>
                    <h1>❌ No Persistent Storage Available</h1>
                    <p>Persistent comment storage is not initialized. Please ensure you have a workspace open.</p>
                </body>
                </html>
            `;
        }

        const stats = this.storage.getStats();
        const storedFiles = this.storage.getStoredFiles();
        
        let fileList = '';
        storedFiles.forEach(file => {
            fileList += `
                <div class="file-item">
                    <div class="file-path">${file.filePath}</div>
                    <div class="file-details">
                        <span class="levels">Levels: ${file.levels.join(', ')}</span>
                        <span class="comments">${file.totalComments} comments</span>
                        <span class="updated">Updated: ${file.lastUpdated.toLocaleString()}</span>
                    </div>
                </div>
            `;
        });

        return `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="UTF-8">
                <title>Scope Storage Stats</title>
                <style>
                    body {
                        font-family: 'SF Mono', Monaco, monospace;
                        background: #000;
                        color: #00ff00;
                        padding: 32px;
                        margin: 0;
                        line-height: 1.6;
                    }
                    .header {
                        text-align: center;
                        margin-bottom: 40px;
                    }
                    .logo {
                        font-size: 32px;
                        margin-bottom: 16px;
                    }
                    .title {
                        font-size: 24px;
                        font-weight: 600;
                        margin-bottom: 8px;
                    }
                    .subtitle {
                        color: #00aa00;
                        font-size: 14px;
                    }
                    .stats-grid {
                        display: grid;
                        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                        gap: 20px;
                        margin: 40px 0;
                    }
                    .stat-card {
                        background: #111;
                        border: 1px solid #333;
                        border-radius: 8px;
                        padding: 20px;
                        text-align: center;
                    }
                    .stat-value {
                        font-size: 32px;
                        font-weight: 600;
                        color: #00ff00;
                        margin-bottom: 8px;
                    }
                    .stat-label {
                        color: #00aa00;
                        font-size: 14px;
                    }
                    .files-section {
                        margin-top: 40px;
                    }
                    .section-title {
                        font-size: 18px;
                        font-weight: 600;
                        margin-bottom: 20px;
                        color: #00ff00;
                        border-bottom: 1px solid #333;
                        padding-bottom: 8px;
                    }
                    .file-item {
                        background: #111;
                        border: 1px solid #333;
                        border-radius: 6px;
                        padding: 16px;
                        margin-bottom: 12px;
                    }
                    .file-path {
                        font-weight: 600;
                        color: #00ff00;
                        margin-bottom: 8px;
                    }
                    .file-details {
                        display: flex;
                        gap: 20px;
                        flex-wrap: wrap;
                        font-size: 12px;
                        color: #00aa00;
                    }
                    .file-details span {
                        background: #222;
                        padding: 4px 8px;
                        border-radius: 4px;
                    }
                    .actions {
                        text-align: center;
                        margin-top: 32px;
                    }
                    .btn {
                        background: #00ff00;
                        color: #000;
                        border: none;
                        padding: 12px 24px;
                        border-radius: 6px;
                        font-family: inherit;
                        font-weight: 600;
                        cursor: pointer;
                        margin: 0 8px;
                    }
                    .btn.danger {
                        background: #ff4444;
                        color: #fff;
                    }
                </style>
            </head>
            <body>
                <div class="header">
                    <div class="logo">💾</div>
                    <div class="title">Scope Comment Storage</div>
                    <div class="subtitle">Persistent Comment Cache Statistics</div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalFiles}</div>
                        <div class="stat-label">Files with Comments</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalComments}</div>
                        <div class="stat-label">Total Comments</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${Math.round(stats.storageSize / 1024)}KB</div>
                        <div class="stat-label">Storage Size</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.version}</div>
                        <div class="stat-label">Storage Version</div>
                    </div>
                </div>

                <div class="files-section">
                    <div class="section-title">📁 Stored Files (${storedFiles.length})</div>
                    ${fileList || '<div style="text-align: center; color: #666; padding: 20px;">No files with stored comments</div>'}
                </div>

                <div class="actions">
                    <button class="btn" onclick="refreshStorage()">🔄 Refresh View</button>
                    <button class="btn danger" onclick="clearStorage()">🗑️ Clear All Comments</button>
                </div>

                <script>
                    const vscode = acquireVsCodeApi();
                    
                    function refreshStorage() {
                        window.location.reload();
                    }
                    
                    function clearStorage() {
                        if (confirm('Are you sure you want to clear all stored comments? This action cannot be undone.')) {
                            vscode.postMessage({ command: 'clearStorage' });
                        }
                    }
                </script>
            </body>
            </html>
        `;
    }
}


