import * as vscode from 'vscode';
import * as fs from 'fs-extra';
import * as path from 'path';
import { Octokit } from '@octokit/rest';
import { GetResponseDataTypeFromEndpointMethod ,OctokitResponse} from "@octokit/types";


interface TrackingConfig {
  githubToken?: string;
  repositoryOwner?: string;
  repositoryName?: string;
}


export function activate(context: vscode.ExtensionContext) {
  const CONFIG_KEY = 'codeTrackingConfig';
  let config: TrackingConfig = context.globalState.get(CONFIG_KEY) || {};

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
        const octokit = new Octokit({ auth: githubToken });
        const user = await octokit.users.getAuthenticated();

        // Update configuration
        config.githubToken = githubToken;
        config.repositoryOwner = user.data.login;
        context.globalState.update(CONFIG_KEY, config);

        // Create code-tracking repository
        await createCodeTrackingRepository(octokit, user.data.login);

        vscode.window.showInformationMessage('GitHub account connected successfully!');
      }
    } catch (error) {
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
  async function createCodeTrackingRepository(octokit: Octokit, username: string) {
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

    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create repository: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Helper function to log code tracking entry
  async function logCodeTrackingEntry(config: TrackingConfig, document: vscode.TextDocument, commitMessage: string) {
    try {
      if (!config.githubToken || !config.repositoryOwner || !config.repositoryName) {
        vscode.window.showWarningMessage('GitHub connection not configured');
        return;
      }

      const octokit = new Octokit({ auth: config.githubToken });

      type GetContentResponse = GetResponseDataTypeFromEndpointMethod<typeof octokit.repos.getContent>;
      
      // Prepare entry details
      const timestamp = new Date().toISOString();
      const relativePath = vscode.workspace.asRelativePath(document.fileName);
      
      // Update README in GitHub repository
      const currentReadme:OctokitResponse<GetContentResponse> = await octokit.repos.getContent({
        owner: config.repositoryOwner,
        repo: config.repositoryName,
        path: 'README.md'
      });
      const content = currentReadme.data as any;

      const currentContent = Buffer.from(
        content.content, 
        'base64'
      ).toString('utf-8');

      // Append new entry to README
      const newContent = currentContent + 
        `\n| ${timestamp} | ${relativePath} | ${commitMessage} |`;

      await octokit.repos.createOrUpdateFileContents({
        owner: config.repositoryOwner,
        repo: config.repositoryName,
        path: 'README.md',
        message: `Log: ${commitMessage}`,
        content: Buffer.from(newContent).toString('base64'),
        sha: (currentReadme.data as any).sha
      });

      // Optional: Local logging
      const localLogPath = path.join(
        vscode.workspace.rootPath || '', 
        '.code-tracking.log'
      );
      
      await fs.appendFile(
        localLogPath, 
        `${timestamp} | ${relativePath} | ${commitMessage}\n`
      );

      vscode.window.showInformationMessage(`Tracked: ${commitMessage}`);

    } catch (error) {
      vscode.window.showErrorMessage(`Tracking failed: ${error instanceof Error ? error.message : error}`);
    }
  }

  // Add commands to subscriptions
  context.subscriptions.push(connectGitHubCommand, startTrackingCommand);
}

export function deactivate() {}