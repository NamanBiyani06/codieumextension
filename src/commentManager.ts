import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as crypto from 'crypto';
import { LLMRouter, CommentRequest, CommentResponse } from './llmRouter';

export class CommentManager {
    private llmRouter: LLMRouter;
    private commentCache: Map<string, string> = new Map();
    private hashCache: Map<string, string> = new Map();

    constructor() {
        this.llmRouter = new LLMRouter();
        
        // Create custom highlight decoration with a nice color
        this.highlightDecorationType = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(255, 193, 7, 0.3)', // Nice amber/yellow background
            border: '1px solid #ffc107', // Amber border
            borderRadius: '2px',
            isWholeLine: true
        });
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

            // Check cache first (include abstraction level in cache key)
            const cacheKey = `${filePath}:level${abstractionLevel}`;
            const fileHash = this.calculateHash(content);
            const cachedHash = this.hashCache.get(cacheKey);
            
            if (cachedHash === fileHash) {
                const cachedComments = this.commentCache.get(cacheKey);
                if (cachedComments) {
                    console.log('Using cached comments for:', fileName, 'level', abstractionLevel);
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

            // Cache the results
            const commentsText = response.comments.join('\n');
            this.commentCache.set(cacheKey, commentsText);
            this.hashCache.set(cacheKey, fileHash);

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

            // Create and open the comments file
            const commentsDoc = await vscode.workspace.openTextDocument({
                content: commentsContent,
                language: 'plaintext'
            });

            // Show both files side by side
            const commentsEditor = await vscode.window.showTextDocument(commentsDoc, vscode.ViewColumn.Beside);
            
            // Store references for hover highlighting
            this.originalFilePath = originalFilePath;
            this.commentsEditor = commentsEditor;
            
            // Set up cursor sync - when cursor moves in original file, highlight corresponding line in comments
            this.setupCursorSync();
            
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
            
            // Create webview panel
            this.currentPanel = vscode.window.createWebviewPanel(
                'aiCommentsPanel',
                `AI Comments: ${fileName}`,
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
        this.commentCache.clear();
        this.hashCache.clear();
    }

    getCacheStats(): { commentCount: number; hashCount: number } {
        return {
            commentCount: this.commentCache.size,
            hashCount: this.hashCache.size
        };
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
                <title>AI Comments - ${fileName}</title>
                <style>
                    body {
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        background-color: var(--vscode-panel-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 15px 20px;
                    }

                    .header h2 {
                        margin: 0 0 8px 0;
                        color: var(--vscode-panelTitle-activeForeground);
                        font-size: 1.2em;
                    }

                    .level-info {
                        color: var(--vscode-descriptionForeground);
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
                        color: var(--vscode-editorLineNumber-foreground);
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        user-select: none;
                        opacity: 0.7;
                    }

                    .comment-text {
                        flex: 1;
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        line-height: 1.4;
                        color: var(--vscode-editor-foreground);
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
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        flex-direction: column;
                    }

                    .header {
                        background-color: var(--vscode-panel-background);
                        border-bottom: 1px solid var(--vscode-panel-border);
                        padding: 15px 20px;
                    }

                    .header h2 {
                        margin: 0 0 8px 0;
                        color: var(--vscode-panelTitle-activeForeground);
                        font-size: 1.2em;
                    }

                    .level-info {
                        color: var(--vscode-descriptionForeground);
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
                        font-family: var(--vscode-editor-font-family);
                        font-size: var(--vscode-editor-font-size);
                        line-height: 1.6;
                        color: var(--vscode-editor-foreground);
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
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 0;
                        margin: 0;
                        height: 100vh;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                    }
                    .loading {
                        text-align: center;
                        color: var(--vscode-descriptionForeground);
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
                        font-family: var(--vscode-font-family);
                        font-size: var(--vscode-font-size);
                        color: var(--vscode-foreground);
                        background-color: var(--vscode-editor-background);
                        padding: 20px;
                    }
                    .error {
                        color: var(--vscode-errorForeground);
                        background-color: var(--vscode-inputValidation-errorBackground);
                        border: 1px solid var(--vscode-inputValidation-errorBorder);
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

            for (const filePath of codeFiles) {
                try {
                    progress.report({ 
                        increment: (processed / totalFiles) * 100, 
                        message: `Processing ${path.basename(filePath)}...` 
                    });

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
            
            vscode.window.showInformationMessage(
                `✅ Scope context exported! ${totalFiles} files processed into PROJECT-CONTEXT.md`,
                'Open Context File'
            ).then(selection => {
                if (selection === 'Open Context File') {
                    vscode.workspace.openTextDocument(contextFilePath).then(doc => {
                        vscode.window.showTextDocument(doc);
                    });
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
}


