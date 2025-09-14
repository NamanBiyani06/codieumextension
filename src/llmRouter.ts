import * as vscode from 'vscode';
import axios from 'axios';
import * as crypto from 'crypto';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: '.env.local' });

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
        // Initialize with Martian API as default with enhanced routing using environment variables
        this.defaultConfig = {
            name: 'martian',
            apiUrl: process.env.MARTIAN_API_URL || 'https://api.withmartian.com/v1/chat/completions',
            apiKey: process.env.MARTIAN_API_KEY || '',
            model: process.env.MARTIAN_MODEL_CODE || 'martian/code' // Martian's smart routing for code tasks
        };
        this.configs.set('martian', this.defaultConfig);
        
        // Add additional Martian models for different use cases
        this.configs.set('martian-general', {
            name: 'martian-general',
            apiUrl: process.env.MARTIAN_API_URL || 'https://api.withmartian.com/v1/chat/completions',
            apiKey: process.env.MARTIAN_API_KEY || '',
            model: process.env.MARTIAN_MODEL_GENERAL || 'martian/general' // For general purpose tasks
        });
    }

    private selectModel(request: CommentRequest): LLMConfig {
        // Enhanced model selection based on code characteristics
        const { code, language, fileName } = request;
        
        // Use Martian's smart routing - it will automatically select the best model
        // based on the task type and content
        return this.defaultConfig;
    }

    async generateComments(request: CommentRequest): Promise<CommentResponse> {
        try {
            const config = this.selectModel(request);
            
            console.log(`Selected model: ${config.name}, API Key present: ${!!config.apiKey}`);
            console.log(`API Key value: ${config.apiKey?.substring(0, 10)}...`);
            console.log(`API URL being used: ${config.apiUrl}`);
            console.log(`Model being used: ${config.model}`);
            
            if (!config.apiKey) {
                return {
                    comments: [],
                    model: config.name,
                    success: false,
                    error: `API key not found for ${config.name}. Please check your .env.local file.`
                };
            }

            const prompt = this.buildPrompt(request);
            
            // Log the full request for debugging
            const requestPayload = {
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
            };
            
            console.log('Request payload:', JSON.stringify(requestPayload, null, 2));
            
            // Enhanced request with Martian's routing capabilities
            const response = await axios.post(config.apiUrl, requestPayload, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'VSCode-Extension/1.0'
                },
                timeout: 30000 // 30 second timeout
            });

            console.log('Response status:', response.status);
            console.log('Response data:', response.data);

            const content = response.data.choices[0].message.content;
            const comments = this.parseComments(content, request.code);
            
            // Log which model was actually used (Martian might route to different models)
            const actualModel = response.data.model || config.model;
            console.log(`Actual model used: ${actualModel}`);
            
            return {
                comments,
                model: actualModel,
                success: true
            };

        } catch (error: any) {
            console.error('LLM API Error:', error);
            
            // Enhanced error handling with detailed logging
            let errorMessage = 'Unknown error occurred';
            if (error.response) {
                console.error('Response status:', error.response.status);
                console.error('Response data:', error.response.data);
                console.error('Response headers:', error.response.headers);
                
                errorMessage = `API Error (${error.response.status}): ${error.response.data?.error?.message || error.response.statusText}`;
                
                // Log the full error response for debugging
                if (error.response.data) {
                    console.error('Full error response:', JSON.stringify(error.response.data, null, 2));
                }
            } else if (error.request) {
                console.error('Request error:', error.request);
                errorMessage = 'Network error: Unable to reach Martian API';
            } else {
                console.error('Other error:', error.message);
                errorMessage = error.message || errorMessage;
            }
            
            return {
                comments: [],
                model: 'unknown',
                success: false,
                error: errorMessage
            };
        }
    }

    private buildPrompt(request: CommentRequest): string {
        const { code, language, fileName } = request;
        
        // Enhanced prompt for better Martian routing
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
- Return only the comments, no line numbers or formatting
- Consider the programming language context and best practices`;
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

    // New method to get available models (useful for debugging)
    getAvailableModels(): string[] {
        return Array.from(this.configs.keys());
    }

    // New method to test API connectivity
    async testConnection(): Promise<boolean> {
        try {
            const config = this.defaultConfig;
            if (!config.apiKey) {
                return false;
            }

            const response = await axios.post(config.apiUrl, {
                model: config.model,
                messages: [{ role: 'user', content: 'test' }],
                max_tokens: 1
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                },
                timeout: 5000
            });

            return response.status === 200;
        } catch (error) {
            console.error('Connection test failed:', error);
            return false;
        }
    }
}
