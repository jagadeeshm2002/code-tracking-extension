# Code Tracking VS Code Extension

## Features

- Connect to GitHub via OAuth
- Automatically create a private `code-tracking` repository
- Track code changes with simple comments
- Log entries locally and on GitHub

## Installation

1. Install the extension from VS Code marketplace
2. Open the Command Palette (Cmd+Shift+P on macOS or Ctrl+Shift+P on Windows/Linux)
3. Run "Code Tracking: Connect GitHub"
4. Authorize the extension with your GitHub account

## Usage

### Connecting GitHub

1. Use the "Code Tracking: Connect GitHub" command
2. Follow the OAuth flow to authorize the extension

### Tracking Code

To log a tracking entry, simply add a comment in your code:

```typescript
// code-tracking-> Started implementing user authentication
```

This will automatically:
- Add an entry to the `code-tracking` repository's README
- Log the entry locally in `.code-tracking.log`

## Commands

- `Code Tracking: Connect GitHub`: Connect your GitHub account
- `Code Tracking: Start Tracking`: Begin monitoring for tracking comments

## Configuration

You can customize the repository name in VSCode settings:

```json
{
  "codeTracking.repositoryName": "my-custom-tracking-repo"
}
```

## Requirements

- GitHub Account
- Personal Access Token (during initial setup)

## Known Issues

- Beta version may have limited OAuth support
- Requires manual token input for now

## Release Notes

### 0.1.0

Initial release of Code Tracking extension