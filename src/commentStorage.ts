import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as vscode from 'vscode';

/**
 * Interface for stored comment data
 */
export interface StoredComment {
    comments: string[];
    fileHash: string;
    timestamp: number;
    model: string;
    language: string;
    abstractionLevel: number;
}

/**
 * Interface for the JSON storage structure
 */
export interface CommentStorageData {
    version: string;
    metadata: {
        createdAt: number;
        updatedAt: number;
        totalFiles: number;
        totalComments: number;
    };
    files: {
        [filePath: string]: {
            [abstractionLevel: string]: StoredComment;
        };
    };
}

/**
 * CommentStorage class manages persistent storage of generated comments
 * Stores comments in a structured JSON file with file scope and abstraction levels
 */
export class CommentStorage {
    private storageFilePath: string;
    private data: CommentStorageData;
    private readonly STORAGE_VERSION = '1.0.0';

    constructor(workspacePath: string) {
        // Create storage file in workspace root with a descriptive name
        this.storageFilePath = path.join(workspacePath, '.scope-comments.json');
        this.data = this.createEmptyStorage();
        this.initializeStorage();
    }

    /**
     * Initialize storage file and load existing data
     */
    private initializeStorage(): void {
        try {
            if (fs.existsSync(this.storageFilePath)) {
                const content = fs.readFileSync(this.storageFilePath, 'utf8');
                this.data = JSON.parse(content);
                
                // Validate and migrate if needed
                this.validateAndMigrate();
            } else {
                // Create new storage structure
                this.data = this.createEmptyStorage();
                this.saveStorage();
            }
        } catch (error) {
            console.error('Error initializing comment storage:', error);
            // Create new storage if loading fails
            this.data = this.createEmptyStorage();
            this.saveStorage();
        }
    }

    /**
     * Create empty storage structure
     */
    private createEmptyStorage(): CommentStorageData {
        const now = Date.now();
        return {
            version: this.STORAGE_VERSION,
            metadata: {
                createdAt: now,
                updatedAt: now,
                totalFiles: 0,
                totalComments: 0
            },
            files: {}
        };
    }

    /**
     * Validate storage structure and migrate if needed
     */
    private validateAndMigrate(): void {
        if (!this.data.version || this.data.version !== this.STORAGE_VERSION) {
            console.log('Migrating comment storage to version', this.STORAGE_VERSION);
            // Add migration logic here if needed in the future
            this.data.version = this.STORAGE_VERSION;
            this.data.metadata.updatedAt = Date.now();
        }

        // Ensure required properties exist
        if (!this.data.metadata) {
            this.data.metadata = {
                createdAt: Date.now(),
                updatedAt: Date.now(),
                totalFiles: Object.keys(this.data.files || {}).length,
                totalComments: 0
            };
        }

        if (!this.data.files) {
            this.data.files = {};
        }
    }

    /**
     * Save storage to disk
     */
    private saveStorage(): void {
        try {
            this.data.metadata.updatedAt = Date.now();
            const content = JSON.stringify(this.data, null, 2);
            fs.writeFileSync(this.storageFilePath, content, 'utf8');
        } catch (error) {
            console.error('Error saving comment storage:', error);
        }
    }

    /**
     * Generate cache key for a file and abstraction level
     */
    private generateCacheKey(filePath: string, abstractionLevel: number): string {
        return `level_${abstractionLevel}`;
    }

    /**
     * Calculate file hash for change detection
     */
    private calculateFileHash(content: string): string {
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Convert absolute file path to relative path for storage
     */
    private getRelativeFilePath(filePath: string): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            const workspaceRoot = workspaceFolders[0].uri.fsPath;
            return path.relative(workspaceRoot, filePath);
        }
        return filePath;
    }

    /**
     * Check if comments exist for a file at a specific abstraction level
     */
    public hasComments(filePath: string, abstractionLevel: number, fileContent: string): boolean {
        const relativePath = this.getRelativeFilePath(filePath);
        const cacheKey = this.generateCacheKey(filePath, abstractionLevel);
        
        if (!this.data.files[relativePath] || !this.data.files[relativePath][cacheKey]) {
            return false;
        }

        const stored = this.data.files[relativePath][cacheKey];
        const currentHash = this.calculateFileHash(fileContent);
        
        // Check if file has changed since comments were generated
        return stored.fileHash === currentHash;
    }

    /**
     * Get stored comments for a file at a specific abstraction level
     */
    public getComments(filePath: string, abstractionLevel: number): string[] | null {
        const relativePath = this.getRelativeFilePath(filePath);
        const cacheKey = this.generateCacheKey(filePath, abstractionLevel);
        
        if (!this.data.files[relativePath] || !this.data.files[relativePath][cacheKey]) {
            return null;
        }

        return this.data.files[relativePath][cacheKey].comments;
    }

    /**
     * Store comments for a file at a specific abstraction level
     */
    public storeComments(
        filePath: string, 
        abstractionLevel: number, 
        comments: string[], 
        fileContent: string,
        model: string,
        language: string
    ): void {
        const relativePath = this.getRelativeFilePath(filePath);
        const cacheKey = this.generateCacheKey(filePath, abstractionLevel);
        const fileHash = this.calculateFileHash(fileContent);

        // Initialize file entry if it doesn't exist
        if (!this.data.files[relativePath]) {
            this.data.files[relativePath] = {};
        }

        // Store the comment data
        this.data.files[relativePath][cacheKey] = {
            comments,
            fileHash,
            timestamp: Date.now(),
            model,
            language,
            abstractionLevel
        };

        // Update metadata
        this.updateMetadata();
        
        // Save to disk
        this.saveStorage();
        
        console.log(`Stored comments for ${relativePath} at level ${abstractionLevel} (${comments.length} comments)`);
    }

    /**
     * Update metadata counters
     */
    private updateMetadata(): void {
        let totalFiles = 0;
        let totalComments = 0;

        for (const filePath in this.data.files) {
            const fileData = this.data.files[filePath];
            if (Object.keys(fileData).length > 0) {
                totalFiles++;
                for (const level in fileData) {
                    totalComments += fileData[level].comments.length;
                }
            }
        }

        this.data.metadata.totalFiles = totalFiles;
        this.data.metadata.totalComments = totalComments;
    }

    /**
     * Remove comments for a specific file (when file is deleted)
     */
    public removeFile(filePath: string): void {
        const relativePath = this.getRelativeFilePath(filePath);
        
        if (this.data.files[relativePath]) {
            delete this.data.files[relativePath];
            this.updateMetadata();
            this.saveStorage();
            console.log(`Removed comments for ${relativePath}`);
        }
    }

    /**
     * Remove comments for a specific file and abstraction level
     */
    public removeComments(filePath: string, abstractionLevel: number): void {
        const relativePath = this.getRelativeFilePath(filePath);
        const cacheKey = this.generateCacheKey(filePath, abstractionLevel);
        
        if (this.data.files[relativePath] && this.data.files[relativePath][cacheKey]) {
            delete this.data.files[relativePath][cacheKey];
            
            // Remove file entry if no comments remain
            if (Object.keys(this.data.files[relativePath]).length === 0) {
                delete this.data.files[relativePath];
            }
            
            this.updateMetadata();
            this.saveStorage();
            console.log(`Removed level ${abstractionLevel} comments for ${relativePath}`);
        }
    }

    /**
     * Clear all stored comments
     */
    public clearAll(): void {
        this.data.files = {};
        this.updateMetadata();
        this.saveStorage();
        console.log('Cleared all stored comments');
    }

    /**
     * Get storage statistics
     */
    public getStats(): {
        totalFiles: number;
        totalComments: number;
        storageSize: number;
        createdAt: Date;
        updatedAt: Date;
        version: string;
    } {
        let storageSize = 0;
        try {
            const stats = fs.statSync(this.storageFilePath);
            storageSize = stats.size;
        } catch (error) {
            console.error('Error getting storage file size:', error);
        }

        return {
            totalFiles: this.data.metadata.totalFiles,
            totalComments: this.data.metadata.totalComments,
            storageSize,
            createdAt: new Date(this.data.metadata.createdAt),
            updatedAt: new Date(this.data.metadata.updatedAt),
            version: this.data.version
        };
    }

    /**
     * Get list of files with stored comments
     */
    public getStoredFiles(): Array<{
        filePath: string;
        levels: number[];
        lastUpdated: Date;
        totalComments: number;
    }> {
        const result = [];
        
        for (const filePath in this.data.files) {
            const fileData = this.data.files[filePath];
            const levels = Object.keys(fileData).map(key => parseInt(key.replace('level_', '')));
            let lastUpdated = 0;
            let totalComments = 0;
            
            for (const level in fileData) {
                const data = fileData[level];
                if (data.timestamp > lastUpdated) {
                    lastUpdated = data.timestamp;
                }
                totalComments += data.comments.length;
            }
            
            result.push({
                filePath,
                levels,
                lastUpdated: new Date(lastUpdated),
                totalComments
            });
        }
        
        return result.sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());
    }

    /**
     * Export storage data for backup or analysis
     */
    public exportData(): CommentStorageData {
        return JSON.parse(JSON.stringify(this.data)); // Deep clone
    }

    /**
     * Import storage data from backup
     */
    public importData(data: CommentStorageData): void {
        this.data = data;
        this.validateAndMigrate();
        this.saveStorage();
        console.log('Imported comment storage data');
    }

    /**
     * Get storage file path
     */
    public getStorageFilePath(): string {
        return this.storageFilePath;
    }
}
