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
    }

    async generateCommentsForFile(filePath: string): Promise<string[]> {
        try {
            // Check if file exists
            if (!fs.existsSync(filePath)) {
                throw new Error(`File not found: ${filePath}`);
            }

            // Read file content
            const content = fs.readFileSync(filePath, 'utf8');
            const fileName = path.basename(filePath);
            const language = this.detectLanguage(fileName);

            // Check cache first
            const fileHash = this.calculateHash(content);
            const cachedHash = this.hashCache.get(filePath);
            
            if (cachedHash === fileHash) {
                const cachedComments = this.commentCache.get(filePath);
                if (cachedComments) {
                    console.log('Using cached comments for:', fileName);
                    return cachedComments.split('\n');
                }
            }

            // Generate new comments
            console.log('Generating new comments for:', fileName);
            const request: CommentRequest = {
                code: content,
                language,
                fileName
            };

            const response: CommentResponse = await this.llmRouter.generateComments(request);
            
            if (!response.success) {
                throw new Error(response.error || 'Failed to generate comments');
            }

            // Cache the results
            const commentsText = response.comments.join('\n');
            this.commentCache.set(filePath, commentsText);
            this.hashCache.set(filePath, fileHash);

            return response.comments;

        } catch (error: any) {
            console.error('Error generating comments:', error);
            throw error;
        }
    }

    async showCommentsSideBySide(originalFilePath: string): Promise<void> {
        try {
            // Generate comments
            const comments = await this.generateCommentsForFile(originalFilePath);
            
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
            await vscode.window.showTextDocument(commentsDoc, vscode.ViewColumn.Beside);
            
            vscode.window.showInformationMessage(`Smart comments generated for ${fileName} using LLM!`);

        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to generate comments: ${error.message}`);
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
}


