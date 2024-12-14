import * as vscode from "vscode";
import * as fs from "fs-extra";
import * as path from "path";
import * as crypto from "crypto";
import { Octokit } from "@octokit/rest";
import { setupTrackingListener } from "./services/trackListener";
import * as dotenv from 'dotenv';
dotenv.config();

interface TrackingConfig {
  accessToken?: string;
  refreshToken?: string;
  githubUsername?: string;
  repositoryName?: string;
  trackingEnabled?: boolean;
  tokenExpiresAt?: number;
  isFirstInstall?: boolean;
  autoCommitInterval?: number;
  excludedFiles?: string[];
  maxTrackedEntries?: number;
}

interface CodeTrackingEntry {
  timestamp: string;
  filePath: string;
  commitMessage: string;
}
interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  refresh_token?: string;
  expires_in?: number;
}

class CodeTrackingProvider
  implements vscode.TreeDataProvider<CodeTrackingEntry>
{
  private _onDidChangeTreeData: vscode.EventEmitter<
    CodeTrackingEntry | undefined | void
  > = new vscode.EventEmitter<CodeTrackingEntry | undefined | void>();
  readonly onDidChangeTreeData: vscode.Event<
    CodeTrackingEntry | undefined | void
  > = this._onDidChangeTreeData.event;

  private entries: CodeTrackingEntry[] = [];

  constructor(private context: vscode.ExtensionContext) {
    this.loadLocalLog();
  }

  async loadLocalLog() {
    try {
      const localLogPath = path.join(
        vscode.workspace.rootPath || "",
        ".code-tracking.log"
      );
      this.entries = await fs.readJson(localLogPath);
      //  maxTrackedEntries configuration
      const config: TrackingConfig =
        this.context.globalState.get("codeTrackingConfig") || {};
      if (
        config.maxTrackedEntries &&
        this.entries.length > config.maxTrackedEntries
      ) {
        this.entries = this.entries.slice(-config.maxTrackedEntries);
      }
      this._onDidChangeTreeData.fire();
    } catch {
      this.entries = [];
    }
  }

  getTreeItem(element: CodeTrackingEntry): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(
      `${element.commitMessage} - ${new Date(
        element.timestamp
      ).toLocaleString()}`,
      vscode.TreeItemCollapsibleState.None
    );

    treeItem.description = element.filePath;
    treeItem.command = {
      command: "vscode.open",
      arguments: [
        vscode.Uri.file(
          path.join(vscode.workspace.rootPath || "", element.filePath)
        ),
      ],
      title: "Open File",
    };

    return treeItem;
  }

  getChildren(): CodeTrackingEntry[] {
    return this.entries.reverse(); // Show most recent first
  }
}
class TokenManager {
  private context: vscode.ExtensionContext;
  private CONFIG_KEY = "codeTrackingConfig";

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }

  // Improved token refresh mechanism
  async refreshAccessToken(
    refreshToken: string
  ): Promise<GitHubTokenResponse | null> {
    try {
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID || "Ov23lizMBot4VTKCZiuo",
            client_secret: process.env.GITHUB_CLIENT_SECRET || "3032c4ee18b559b8835b56122749a1ef694e2e8e",
            grant_type: "refresh_token",
            refresh_token: refreshToken,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Token refresh failed");
      }

      const tokenResponse = (await response.json()) as GitHubTokenResponse;

      // Update configuration with new tokens
      const currentConfig: TrackingConfig =
        this.context.globalState.get(this.CONFIG_KEY) || {};
      const updatedConfig: TrackingConfig = {
        ...currentConfig,
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token || currentConfig.refreshToken,
      };

      await this.context.globalState.update(this.CONFIG_KEY, updatedConfig);

      return tokenResponse;
    } catch (error) {
      vscode.window.showErrorMessage(
        `Token refresh failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
      return null;
    }
  }

  // Check if token is expired or about to expire
  isTokenExpired(config: TrackingConfig): boolean {
    // If no expiration is set, assume token is valid
    if (!config.tokenExpiresAt) return true;

    // Check if token is expiring within next 5 minutes
    return Date.now() >= config.tokenExpiresAt - 5 * 60 * 1000;
  }
}

export function activate(context: vscode.ExtensionContext) {
  const CONFIG_KEY = "codeTrackingConfig";
  let config: TrackingConfig = context.globalState.get(CONFIG_KEY) || {};
  const tokenManager = new TokenManager(context);

  // Default configuration if not set
  const defaultConfig: TrackingConfig = {
    trackingEnabled: true,
    isFirstInstall: true,
    autoCommitInterval: 30, // 30 minutes
    excludedFiles: ["**/.git/**", "**/.vscode/**", "**/node_modules/**"],
    maxTrackedEntries: 100,
  };

  // Merge default config with existing config
  config = { ...defaultConfig, ...config };
  context.globalState.update(CONFIG_KEY, config);

  // Configuration command to modify tracking settings
  const configureTrackingCommand = vscode.commands.registerCommand(
    "codeTracking.configureTracking",
    async () => {
      const quickPick = vscode.window.createQuickPick();
      quickPick.items = [
        {
          label: "Set Auto-Commit Interval",
          description: `Current: ${config.autoCommitInterval} minutes`,
        },
        {
          label: "Manage Excluded Files",
          description: `Currently excluding ${
            (config.excludedFiles as any).length
          } file patterns`,
        },
        {
          label: "Set Max Tracked Entries",
          description: `Current: ${config.maxTrackedEntries}`,
        },
      ];

      quickPick.onDidChangeSelection(async ([item]) => {
        switch (item.label) {
          case "Set Auto-Commit Interval":
            const intervalInput = await vscode.window.showInputBox({
              prompt: "Enter auto-commit interval in minutes",
              value: config.autoCommitInterval?.toString(),
            });
            if (intervalInput) {
              config.autoCommitInterval = parseInt(intervalInput);
              context.globalState.update(CONFIG_KEY, config);
            }
            break;

          case "Manage Excluded Files":
            const newExcludedFiles = await vscode.window.showInputBox({
              prompt: "Enter file patterns to exclude (comma-separated)",
              value: (config.excludedFiles as any).join(", "),
            });
            if (newExcludedFiles) {
              config.excludedFiles = newExcludedFiles
                .split(",")
                .map((f) => f.trim());
              context.globalState.update(CONFIG_KEY, config);
            }
            break;

          case "Set Max Tracked Entries":
            const maxEntriesInput = await vscode.window.showInputBox({
              prompt: "Enter maximum number of tracked entries",
              value: config.maxTrackedEntries?.toString(),
            });
            if (maxEntriesInput) {
              config.maxTrackedEntries = parseInt(maxEntriesInput);
              context.globalState.update(CONFIG_KEY, config);
            }
            break;
        }
        quickPick.hide();
      });

      quickPick.show();
    }
  );

  // Periodic token refresh
  const tokenRefreshInterval = setInterval(async () => {
    if (config.refreshToken && tokenManager.isTokenExpired(config)) {
      await tokenManager.refreshAccessToken(config.refreshToken);
    }
  }, 30 * 60 * 1000); // Check every 30 minutes

  context.subscriptions.push({
    dispose: () => clearInterval(tokenRefreshInterval),
  });

  // GitHub OAuth Configuration
  const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || "Ov23lizMBot4VTKCZiuo";
  const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || "3032c4ee18b559b8835b56122749a1ef694e2e8e";
  const REDIRECT_URI = "vscode://jagadeesh.code-tracker/callback";
  const SCOPES = ["repo", "user"].join(" ");

  function generateState(): string {
    return crypto.randomBytes(16).toString("hex");
  }
  async function exchangeCodeForToken(code: string | null): Promise<GitHubTokenResponse> {
    try {
      if (!code) throw new Error("No authorization code");
      
      // Log the request details for debugging
      console.log('Exchanging code with:', {
        client_id: GITHUB_CLIENT_ID,
        client_secret: GITHUB_CLIENT_SECRET ? '***' : 'missing',
        code: code ? '***' : 'missing'
      });
  
      const response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code: code,
          }),
        }
      );
  
      // Log full response for debugging
      const responseText = await response.text();
      console.log('Raw response:', responseText);
  
      const tokenResponse = JSON.parse(responseText) as GitHubTokenResponse;
  
      if (!tokenResponse.access_token) {
        throw new Error("No access token received");
      }
  
      return tokenResponse;
    } catch (error) {
      console.error('Token exchange error:', error);
      vscode.window.showErrorMessage(`Token exchange failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }

  // GitHub OAuth Handler
  const githubOAuthHandler = vscode.window.registerUriHandler({
    handleUri: async (uri: vscode.Uri) => {
      // Verify the URI is from the expected callback
      console.log('Received URI:', uri.toString());
      if (uri.path !== "/callback") return;

      // Parse query parameters
      const params = new URLSearchParams(uri.query);
      const receivedCode = params.get("code");
      const receivedState = params.get("state");

      // Validate state to prevent CSRF
      const storedState = context.globalState.get("github-oauth-state");
      if (receivedState !== storedState) {
        vscode.window.showErrorMessage("Authentication failed: Invalid state");
        return;
      }

      try {
        // Exchange code for access token
        const tokenResponse = await exchangeCodeForToken(receivedCode);

        // Create Octokit instance
        const octokit = new Octokit({ auth: tokenResponse.access_token });

        // Fetch user information
        const user = await octokit.users.getAuthenticated();

        // Update configuration
        config = {
          accessToken: tokenResponse.access_token,
          refreshToken: tokenResponse.refresh_token,
          githubUsername: user.data.login,
          repositoryName: "code-tracking",
          trackingEnabled: true,
          isFirstInstall: false,
        };

        // Save to global state
        context.globalState.update(CONFIG_KEY, config);

        // Create or verify repository
        await createOrVerifyCodeTrackingRepository(octokit, config);

        // Show success message
        vscode.window.showInformationMessage(
          `GitHub account connected successfully as ${user.data.login}!`
        );

        // Setup tracking listener (ensure this function is imported or defined)
        setupTrackingListener(config, context);
      } catch (error) {
        console.error('Full OAuth handler error:', error);
        vscode.window.showErrorMessage(
          `Authentication failed: ${
            error instanceof Error ? error.message : "Unknown error"
          }`
        );
      }
    },
  });
  // Command to initiate GitHub OAuth login
  const connectGitHubCommand = vscode.commands.registerCommand(
    "codeTracking.connectGitHub",
    async () => {
      // Generate state for CSRF protection
      const state = generateState();

      // Store state in global state
      context.globalState.update("github-oauth-state", state);

      // Construct GitHub OAuth authorization URL
      const authUrl =
        `https://github.com/login/oauth/authorize?` +
        `client_id=${GITHUB_CLIENT_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=${encodeURIComponent(SCOPES)}` +
        `&state=${state}`;

      // Open the GitHub authorization page in the default browser
      await vscode.env.openExternal(vscode.Uri.parse(authUrl));
    }
  );

  // Check if this is the first install
  // if (config.isFirstInstall === undefined) {
  //   config.isFirstInstall = true;
  //   context.globalState.update(CONFIG_KEY, config);
  // }

  // Show welcome/sign-in popup on first install
  // if (config.isFirstInstall) {
    vscode.window
      .showInformationMessage(
        "Welcome to Code Tracking! Please connect your GitHub account to start tracking.",
        "Connect GitHub"
      )
      .then((selection) => {
        if (selection === "Connect GitHub") {
          vscode.commands.executeCommand("codeTracking.connectGitHub");
        }
      });
  // }

  // Create Sidebar View for Tracked Changes
  const codeTrackingProvider = new CodeTrackingProvider(context);
  vscode.window.registerTreeDataProvider(
    "codeTrackingView",
    codeTrackingProvider
  );

  context.subscriptions.push(githubOAuthHandler, connectGitHubCommand);

  // Function to create or verify code tracking repository
  async function createOrVerifyCodeTrackingRepository(
    octokit: Octokit,
    config: TrackingConfig
  ) {
    try {
      // Check if repository exists, create if not
      try {
        await octokit.repos.get({
          owner: config.githubUsername!,
          repo: config.repositoryName!,
        });
      } catch {
        // Repository doesn't exist, create it
        await octokit.repos.createForAuthenticatedUser({
          name: config.repositoryName!,
          description: "Automated code tracking repository",
          private: true,
          auto_init: true,
        });
      }

      // Ensure README exists with tracking table
      const readmeContent = `# Code Tracking

| Timestamp | File | Message |
|-----------|------|---------|
`;

      // Get current README or create if not exists
      try {
        await octokit.repos.getContent({
          owner: config.githubUsername!,
          repo: config.repositoryName!,
          path: "README.md",
        });
      } catch {
        // README doesn't exist, create it
        await octokit.repos.createOrUpdateFileContents({
          owner: config.githubUsername!,
          repo: config.repositoryName!,
          path: "README.md",
          message: "Initialize code tracking repository",
          content: Buffer.from(readmeContent).toString("base64"),
        });
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Repository setup failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  // Command to initiate GitHub OAuth login

  // Command to toggle tracking
  const toggleTrackingCommand = vscode.commands.registerCommand(
    "codeTracking.toggleTracking",
    () => {
      if (!config.accessToken) {
        vscode.window.showWarningMessage("Please connect GitHub account first");
        return;
      }

      config.trackingEnabled = !config.trackingEnabled;

      context.globalState.update(CONFIG_KEY, config);

      vscode.window.showInformationMessage(
        `Code tracking ${config.trackingEnabled ? "enabled" : "disabled"}`
      );
    }
  );

  context.subscriptions.push(
    connectGitHubCommand,
    toggleTrackingCommand,
    configureTrackingCommand
  );
}

export function deactivate() {
  // Optional cleanup when extension is deactivated
  // You can add any necessary cleanup logic here
}