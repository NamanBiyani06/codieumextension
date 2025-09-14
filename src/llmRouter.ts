import * as vscode from 'vscode';
import axios from 'axios';
import * as crypto from 'crypto';

export interface LLMConfig {
    name: string;
    apiUrl: string;
    apiKey: string;
    model: string;
}

export interface CommentRequest {
    code: string;
    language: string;
    fileName: string;
}

export interface CommentResponse {
    comments: string[];
    model: string;
    success: boolean;
    error?: string;
}

export class LLMRouter {
    private configs: Map<string, LLMConfig> = new Map();
    private defaultConfig: LLMConfig;

    constructor() {
        // Initialize with Martian API as default
        this.defaultConfig = {
            name: 'martian',
            apiUrl: 'https://api.withmartian.com/v1/chat/completions',
            apiKey: process.env.MARTIAN_API_KEY || '',
            model: 'martian/code' // Use Martian's smart routing for code tasks
        };
        this.configs.set('martian', this.defaultConfig);

        // Add other LLM configurations
        this.configs.set('openai-gpt4', {
            name: 'openai-gpt4',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-4o'
        });

        this.configs.set('openai-gpt5', {
            name: 'openai-gpt5',
            apiUrl: 'https://api.openai.com/v1/chat/completions',
            apiKey: process.env.OPENAI_API_KEY || '',
            model: 'gpt-5'
        });
    }

    private selectModel(request: CommentRequest): LLMConfig {
        // Always use Martian - it has the API key hardcoded
        return this.defaultConfig;
    }

    async generateComments(request: CommentRequest): Promise<CommentResponse> {
        try {
            const config = this.selectModel(request);
            
            console.log(`Selected model: ${config.name}, API Key present: ${!!config.apiKey}`);
            console.log(`API Key value: ${config.apiKey?.substring(0, 10)}...`);
            console.log(`API URL being used: ${config.apiUrl}`); // Debug: log the actual URL being used
            
            if (!config.apiKey) {
                return {
                    comments: [],
                    model: config.name,
                    success: false,
                    error: `API key not found for ${config.name}`
                };
            }

            const prompt = this.buildPrompt(request);
            
            const response = await axios.post(config.apiUrl, {
                model: config.model,
                messages: [
                    {
                        role: 'system',
                        content: 'You are an expert code reviewer. Generate concise, helpful line-by-line comments for the provided code. Return ONLY the comments, one per line, matching the line numbers exactly. Do not include line numbers or any other formatting.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: 2000,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            const content = response.data.choices[0].message.content;
            const comments = this.parseComments(content, request.code);
            
            return {
                comments,
                model: config.name,
                success: true
            };

        } catch (error: any) {
            console.error('LLM API Error:', error);
            return {
                comments: [],
                model: 'unknown',
                success: false,
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    private buildPrompt(request: CommentRequest): string {
        const { code, language, fileName } = request;
        return `Generate line-by-line comments for this ${language} code from file "${fileName}":

\`\`\`${language}
${code}
\`\`\`

Requirements:
- One comment per line of code
- Match empty lines with empty comments
- Be concise but helpful
- Focus on what the code does, not how
- Use clear, professional language
- Return only the comments, no line numbers or formatting`;
    }

    private parseComments(content: string, originalCode: string): string[] {
        const codeLines = originalCode.split('\n');
        const commentLines = content.split('\n').filter(line => line.trim().length > 0);
        
        const result: string[] = [];
        let commentIndex = 0;
        
        for (let i = 0; i < codeLines.length; i++) {
            const codeLine = codeLines[i];
            
            if (codeLine.trim().length === 0) {
                // Empty line in code
                result.push('');
            } else if (commentIndex < commentLines.length) {
                // Use the next available comment
                result.push(commentLines[commentIndex].trim());
                commentIndex++;
            } else {
                // No more comments available, use a generic one
                result.push('// Code line');
            }
        }
        
        return result;
    }
}
