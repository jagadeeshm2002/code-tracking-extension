
# Code Tracking VS Code Extension

## Overview
Code Tracking is a powerful VS Code extension that simplifies your development workflow by automatically logging and tracking code changes directly to a private GitHub repository.

## Features
- 🔒 Secure GitHub OAuth integration
- 📦 Automatic private repository creation
- 📝 Intelligent code change tracking
- 🌐 Local and remote logging
- 🧩 Multi-language comment support

## Prerequisites
- A GitHub account
- VS Code version 1.85.0 or later

## Installation
1. Open VS Code
2. Go to Extensions (Cmd+Shift+X or Ctrl+Shift+X)
3. Search for "Code Tracking"
4. Click "Install"

## Getting Started

### Connecting GitHub
1. Open the Command Palette (Cmd+Shift+P or Ctrl+Shift+P)
2. Run "Code Tracking: Connect GitHub"
3. Follow the OAuth flow to authorize the extension

### Tracking Code Changes
Add a tracking comment in any supported language:

```typescript
// track: Started implementing user authentication
// code-tracking-> Refactoring login flow
```

Supported tracking comment styles:
- `// track: message`
- `/* track: message */`
- `# track: message`
- `-- track: message`
- `; track: message`
- `<!-- track: message -->`

## Commands
- `Code Tracking: Connect GitHub`: Connect your GitHub account
- `Code Tracking: Toggle Tracking`: Enable/Disable tracking
- `Code Tracking: Configure Tracking`: Adjust tracking settings

## Configuration
Customize the extension in VS Code settings:

```json
{
  "codeTracking.repositoryName": "my-custom-tracking-repo",
  "codeTracking.autoCommitInterval": 30,
  "codeTracking.excludedFiles": ["**/.git/**", "**/node_modules/**"]
}
```

Configuration Options:
- `repositoryName`: Custom GitHub repository name
- `autoCommitInterval`: Minutes between automatic commits
- `excludedFiles`: Patterns of files to ignore

## Security
- Private repository created automatically
- OAuth-based authentication
- Secure token management

## Supported Languages
Supports tracking comments in:
- TypeScript/JavaScript
- Python
- Ruby
- SQL
- HTML
- And more!

## Known Limitations
- Beta version with ongoing improvements
- Requires an active internet connection
- GitHub account required

## Troubleshooting
- Ensure GitHub OAuth is correctly configured
- Check VS Code settings for correct configuration
- Verify internet connectivity

## Release Notes

### 0.1.0
- Initial release
- GitHub OAuth integration
- Basic code tracking
- Local and remote logging

## Contributing
Contributions are welcome! 
- Report issues on GitHub
- Submit pull requests
- Provide feedback

## License
ISC License

## Support
For support, please open an issue on the GitHub repository.


