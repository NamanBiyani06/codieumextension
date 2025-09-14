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
    abstractionLevel?: number; // 1-5, where 1 is most abstract, 5 is line-by-line
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
            
            console.log('Sending request to API:', {
                url: config.apiUrl,
                model: config.model,
                promptLength: prompt.length
            });

            const systemPrompts = {
                1: 'You are an expert code reviewer. Provide a high-level overview of what the code does.',
                2: 'You are an expert code reviewer. Summarize the main components and their purposes.',
                3: 'You are an expert code reviewer. Explain the key functions and their interactions.',
                4: 'You are an expert code reviewer. Provide detailed analysis of the code structure and implementation.',
                5: 'You are an expert code reviewer. Generate EXACTLY one comment per line of code. Each comment should be on its own line and explain what that specific line does. Return ONLY the comments, no line numbers, no formatting, no explanations. Match the number of lines exactly.'
            };

            const abstractionLevel = request.abstractionLevel || 5;
            const systemPrompt = systemPrompts[abstractionLevel as keyof typeof systemPrompts];

            const response = await axios.post(config.apiUrl, {
                model: config.model,
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: abstractionLevel === 5 ? 2000 : 1000,
                temperature: 0.3
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('API Response received:', {
                status: response.status,
                hasChoices: !!response.data.choices,
                choicesLength: response.data.choices?.length || 0
            });

            if (!response.data.choices || response.data.choices.length === 0) {
                console.error('No choices in API response:', response.data);
                return {
                    comments: [],
                    model: config.name,
                    success: false,
                    error: 'No response choices from API'
                };
            }

            const content = response.data.choices[0].message.content;
            console.log('Raw API content:', content);
            
            let comments: string[];
            if (abstractionLevel === 5) {
                comments = this.parseComments(content, request.code);
            } else {
                // For levels 1-4, return the content as a single comment
                comments = [content.trim()];
            }
            
            return {
                comments,
                model: config.name,
                success: true
            };

        } catch (error: any) {
            console.error('LLM API Error Details:', {
                message: error.message,
                status: error.response?.status,
                statusText: error.response?.statusText,
                data: error.response?.data,
                url: error.config?.url
            });
            
            return {
                comments: [],
                model: 'unknown',
                success: false,
                error: error.message || 'Unknown error occurred'
            };
        }
    }

    private buildPrompt(request: CommentRequest): string {
        const { code, language, fileName, abstractionLevel = 5 } = request;
        const lines = code.split('\n');
        
        const levelPrompts = {
            1: `Provide a very high-level, single sentence summary of what this ${language} code does. Focus on the overall purpose and main functionality.`,
            2: `Summarize the main components and their primary purposes in 2-3 sentences. Identify key functions, classes, or modules and their roles.`,
            3: `Explain the key functions, classes, and their interactions in a paragraph. Describe the code structure and logic flow.`,
            4: `Provide a detailed explanation of the code structure, logic flow, and important implementation details. Include specific function purposes and data flow.`,
            5: `Generate EXACTLY ${lines.length} comments for this ${language} code (one per line). Each comment should explain what that specific line does.`
        };

        const systemPrompts = {
            1: 'You are an expert code reviewer. Provide a high-level overview of what the code does.',
            2: 'You are an expert code reviewer. Summarize the main components and their purposes.',
            3: 'You are an expert code reviewer. Explain the key functions and their interactions.',
            4: 'You are an expert code reviewer. Provide detailed analysis of the code structure and implementation.',
            5: 'You are an expert code reviewer. Generate EXACTLY one comment per line of code. Each comment should be on its own line and explain what that specific line does. Return ONLY the comments, no line numbers, no formatting, no explanations. Match the number of lines exactly.'
        };

        if (abstractionLevel === 5) {
            return `Generate EXACTLY ${lines.length} comments for this ${language} code (one per line):

\`\`\`${language}
${code}
\`\`\`

CRITICAL REQUIREMENTS:
- Return EXACTLY ${lines.length} comments (one per line)
- Each comment on its own line
- Empty lines in code should have empty comments
- Be concise but descriptive
- Focus on what each line does
- NO line numbers, NO formatting, NO explanations
- Just the comments, one per line

Example format:
Comment for line 1
Comment for line 2
Comment for line 3
(empty comment for empty line)
Comment for line 5`;
        } else {
            return `${levelPrompts[abstractionLevel as keyof typeof levelPrompts]}

\`\`\`${language}
${code}
\`\`\`

File: ${fileName}`;
        }
    }

    private parseComments(content: string, originalCode: string): string[] {
        console.log('Parsing comments from LLM response:');
        console.log('Original code lines:', originalCode.split('\n').length);
        console.log('LLM response:', content);
        
        const codeLines = originalCode.split('\n');
        const commentLines = content.split('\n').filter(line => line.trim().length > 0);
        
        console.log('Filtered comment lines:', commentLines.length);
        console.log('Sample comment lines:', commentLines.slice(0, 3));
        
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
        
        console.log('Final parsed comments count:', result.length);
        console.log('Sample final comments:', result.slice(0, 3));
        
        return result;
    }
}
