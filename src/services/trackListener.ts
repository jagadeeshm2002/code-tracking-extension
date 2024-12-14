import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import { Octokit } from "@octokit/rest";

interface TrackingConfig {
  accessToken?: string;
  refreshToken?: string;
  githubUsername?: string;
  repositoryName?: string;
  trackingEnabled?: boolean;
  isFirstInstall?: boolean;
}

interface CodeTrackingEntry {
  timestamp: string;
  filePath: string;
  commitMessage: string;
  username: string;
}

// Enhanced logging function
function logToOutputChannel(message: string, isError: boolean = false) {
  const outputChannel = vscode.window.createOutputChannel("Code Tracking");
  if (isError) {
    outputChannel.appendLine(`[ERROR] ${message}`);
    vscode.window.showErrorMessage(message);
  } else {
    outputChannel.appendLine(`[INFO] ${message}`);
  }
  outputChannel.show(true);
}

// Improved setupTrackingListener function
function setupTrackingListener(
  config: TrackingConfig,
  context: vscode.ExtensionContext
) {
  // Dispose of any existing listeners
  context.subscriptions
    .filter((subscription) => subscription instanceof vscode.Disposable)
    .forEach((disposable) => (disposable as vscode.Disposable).dispose());

  // Create new tracking listener
  const trackingDisposable = vscode.workspace.onDidSaveTextDocument(
    async (document) => {
      // Comprehensive logging for debugging
      logToOutputChannel(`Tracking triggered for file: ${document.fileName}`);

      // Validate tracking prerequisites
      if (!config.trackingEnabled) {
        logToOutputChannel("Tracking is disabled", true);
        return;
      }

      if (!config.accessToken) {
        logToOutputChannel("No GitHub access token found", true);
        return;
      }

      const text = document.getText();

      // More comprehensive tracking comment detection
      const trackingCommentPatterns = [
        /\/\/\s*track:\s*(.+)/, // Single-line C-style comments
        /\/\*\s*track:\s*(.+)\s*\*\//, // Multi-line C-style comments
        /\/\/\s*code-tracking->\s*(.+)/, // Alternative single-line tracking
        /#\s*track:\s*(.+)/, // Python/Ruby style comments
        /--\s*track:\s*(.+)/, // SQL/Ada style comments
        /;\s*track:\s*(.+)/, // Assembly style comments
        /<!--\s*track:\s*(.+)\s*-->/, // HTML comments
      ];

      // Find the first matching tracking comment
      let commitMessageMatch: RegExpMatchArray | null = null;
      for (const pattern of trackingCommentPatterns) {
        commitMessageMatch = text.match(pattern);
        if (commitMessageMatch) break;
      }

      // Fallback commit message if no tracking comment found
      const commitMessage = commitMessageMatch
        ? commitMessageMatch[1].trim()
        : "Automatic code tracking";

      try {
        // Log the tracking entry
        await logCodeTrackingEntry(config, document, commitMessage);
      } catch (error) {
        logToOutputChannel(
          `Tracking failed: ${
            error instanceof Error ? error.message : String(error)
          }`,
          true
        );
      }
    }
  );

  // Add the new disposable to context subscriptions
  context.subscriptions.push(trackingDisposable);
}





async function logCodeTrackingEntry(
  config: TrackingConfig,
  document: vscode.TextDocument,
  commitMessage: string
) {
  // Validate GitHub connection
  if (!config.accessToken || !config.githubUsername || !config.repositoryName) {
    throw new Error("GitHub connection not properly configured");
  }
  const octokit = new Octokit({ auth: config.accessToken });

  // Prepare entry details
  const entry: CodeTrackingEntry = {
    timestamp: new Date().toISOString(),
    filePath: vscode.workspace.asRelativePath(document.fileName),
    commitMessage,
    username: config.githubUsername,
  };

  try {
    // Get file content to commit
    // const fileContent = await fs.readFile(document.fileName, "utf-8");

    // Get the default branch
    const repoDetails = await octokit.repos.get({
      owner: config.githubUsername,
      repo: config.repositoryName,
    });
    const defaultBranch = repoDetails.data.default_branch;

    // Upload the file to the main branch
    // await octokit.repos.createOrUpdateFileContents({
    //   owner: config.githubUsername,
    //   repo: config.repositoryName,
    //   branch: defaultBranch,
    //   path: entry.filePath,
    //   message: `Track: ${commitMessage}`,
    //   content: Buffer.from(fileContent).toString("base64"),
    // });

    // Retrieve README content with SHA
    let readmeContent = '';
    let readmeSha: string | undefined;
    try {
      const readmeResponse = await octokit.repos.getContent({
        owner: config.githubUsername,
        repo: config.repositoryName,
        path: "README.md",
      });
      
      // Safely extract content and SHA
      if (Array.isArray(readmeResponse.data)) {
        // If multiple files are returned, find README
        const readmeFile = readmeResponse.data.find(file => file.name.toLowerCase() === 'readme.md');
        if (readmeFile && 'content' in readmeFile && 'sha' in readmeFile) {
          readmeContent = Buffer.from(readmeFile.content as any, "base64").toString("utf-8");
          readmeSha = readmeFile.sha;
        }
      } else if ('content' in readmeResponse.data && 'sha' in readmeResponse.data) {
        // Direct content case
        readmeContent = Buffer.from(readmeResponse.data.content, "base64").toString("utf-8");
        readmeSha = readmeResponse.data.sha;
      }
    } catch (error) {
      // If README doesn't exist, we'll create a new one
      console.log("README.md not found, will create a new one");
    }
    

    // Create a more detailed markdown table entry
    const newEntry = `| ${entry.timestamp} | ${entry.filePath} | ${entry.commitMessage} | ${entry.username} |`;

    // Append new entry to README
    const newContent = readmeContent.includes('| Timestamp |') 
      ? readmeContent + newEntry 
      : readmeContent + `
## Code Tracking Log
| Timestamp | File Path | Commit Message | User |
|-----------|-----------|----------------|------|
${newEntry}`;

    // Update README with proper SHA handling
    await octokit.repos.createOrUpdateFileContents({
        owner: config.githubUsername,
        repo: config.repositoryName,
        branch:defaultBranch,
        path: "README.md",
        message: `Update tracking log: ${commitMessage}`,
        content: Buffer.from(newContent).toString("base64"),
        sha: readmeSha, // Always provide SHA, even if creating a new file
      });

    // Local logging
    const localLogPath = path.join(
      vscode.workspace.rootPath || "",
      ".code-tracking.log"
    );

    let localLog: CodeTrackingEntry[] = [];
    try {
      localLog = await fs.readJson(localLogPath);
    } catch {
      // Initial log file creation
    }

    localLog.push(entry);
    await fs.writeJSON(localLogPath, localLog, { spaces: 2 });

    // Log success
    logToOutputChannel(`Successfully tracked: ${commitMessage}`);
  } catch (error) {
    // Enhanced error logging
    const errorMessage = error instanceof Error 
      ? error.message 
      : JSON.stringify(error);
    
    logToOutputChannel(`Tracking failed: ${errorMessage}`);
    throw error;
  }
}


// Export these improved functions to be used in your main extension file
export { setupTrackingListener, logCodeTrackingEntry };
