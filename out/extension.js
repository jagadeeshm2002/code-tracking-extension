"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs-extra"));
const path = __importStar(require("path"));
const rest_1 = require("@octokit/rest");
function activate(context) {
    const CONFIG_KEY = 'codeTrackingConfig';
    let config = context.globalState.get(CONFIG_KEY) || {};
    // Command to connect GitHub
    const connectGitHubCommand = vscode.commands.registerCommand('codeTracking.connectGitHub', async () => {
        try {
            // GitHub OAuth flow (simplified for demonstration)
            const clientId = 'Ov23lizMBot4VTKCZiuo';
            const redirectUri = 'vscode://code-tracker-extension/github-callback';
            const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=repo`;
            // Open GitHub authorization in browser
            await vscode.env.openExternal(vscode.Uri.parse(authUrl));
            // TODO: Implement proper OAuth callback handling
            const githubToken = await vscode.window.showInputBox({
                prompt: 'Enter GitHub Personal Access Token',
                ignoreFocusOut: true
            });
            if (githubToken) {
                const octokit = new rest_1.Octokit({ auth: githubToken });
                const user = await octokit.users.getAuthenticated();
                // Update configuration
                config.githubToken = githubToken;
                config.repositoryOwner = user.data.login;
                context.globalState.update(CONFIG_KEY, config);
                // Create code-tracking repository
                await createCodeTrackingRepository(octokit, user.data.login);
                vscode.window.showInformationMessage('GitHub account connected successfully!');
            }
        }
        catch (error) {
            vscode.window.showErrorMessage(`GitHub connection failed: ${error instanceof Error ? error.message : error}`);
        }
    });
    // Command to start tracking
    const startTrackingCommand = vscode.commands.registerCommand('codeTracking.startTracking', () => {
        if (!config.githubToken) {
            vscode.window.showWarningMessage('Please connect GitHub account first');
            return;
        }
        // Register text document change listener
        const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
            // Check for specific comment trigger
            const document = event.document;
            const text = document.getText();
            // Look for tracking comment
            const trackingCommentMatch = text.match(/\/\/\s*code-tracking->\s*(.+)/);
            if (trackingCommentMatch) {
                const commitMessage = trackingCommentMatch[1];
                await logCodeTrackingEntry(config, document, commitMessage);
            }
        });
        context.subscriptions.push(disposable);
    });
    // Helper function to create code-tracking repository
    async function createCodeTrackingRepository(octokit, username) {
        try {
            const repoName = config.repositoryName || 'code-tracking';
            // Create repository
            // @ts-expect-error 
            const repo = await octokit.repos.createForAuthenticatedUser({
                name: repoName,
                description: 'Automated code tracking repository',
                private: true,
                auto_init: true
            });
            // Update config with repository details
            config.repositoryName = repoName;
            context.globalState.update(CONFIG_KEY, config);
            // Initial README
            await octokit.repos.createOrUpdateFileContents({
                owner: username,
                repo: repoName,
                path: 'README.md',
                message: 'Initialize code tracking repository',
                content: Buffer.from('# Code Tracking\n\n| Timestamp | File | Message |\n|-----------|------|---------|').toString('base64')
            });
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to create repository: ${error instanceof Error ? error.message : error}`);
        }
    }
    // Helper function to log code tracking entry
    async function logCodeTrackingEntry(config, document, commitMessage) {
        try {
            if (!config.githubToken || !config.repositoryOwner || !config.repositoryName) {
                vscode.window.showWarningMessage('GitHub connection not configured');
                return;
            }
            const octokit = new rest_1.Octokit({ auth: config.githubToken });
            // Prepare entry details
            const timestamp = new Date().toISOString();
            const relativePath = vscode.workspace.asRelativePath(document.fileName);
            // Update README in GitHub repository
            const currentReadme = await octokit.repos.getContent({
                owner: config.repositoryOwner,
                repo: config.repositoryName,
                path: 'README.md'
            });
            const content = currentReadme.data;
            const currentContent = Buffer.from(content.content, 'base64').toString('utf-8');
            // Append new entry to README
            const newContent = currentContent +
                `\n| ${timestamp} | ${relativePath} | ${commitMessage} |`;
            await octokit.repos.createOrUpdateFileContents({
                owner: config.repositoryOwner,
                repo: config.repositoryName,
                path: 'README.md',
                message: `Log: ${commitMessage}`,
                content: Buffer.from(newContent).toString('base64'),
                sha: currentReadme.data.sha
            });
            // Optional: Local logging
            const localLogPath = path.join(vscode.workspace.rootPath || '', '.code-tracking.log');
            await fs.appendFile(localLogPath, `${timestamp} | ${relativePath} | ${commitMessage}\n`);
            vscode.window.showInformationMessage(`Tracked: ${commitMessage}`);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Tracking failed: ${error instanceof Error ? error.message : error}`);
        }
    }
    // Add commands to subscriptions
    context.subscriptions.push(connectGitHubCommand, startTrackingCommand);
}
function deactivate() { }
