# AI Assistant Help

## Quick Start
1. **Set a Server URL**: Before using the assistant, ensure you have the URL for an inference provider configured. This can be local (e.g., [Osaurus](https://osaurus.ai)) or remote. The server must support OpenAI compatible API endpoints (`/models`, `/chat/completions`).
2. **Select a Model:** Select a model in the “Info” sidebar.
3. **Ask Assistant:** Use the “Ask Assistant” command in the editor or the “Chat bubble” button in the chat sidebar to start a conversation.
4. **Context:** The assistant automatically uses your workspace context to provide more relevant answers.

## Configuration Overview

### Global vs. Workspace Settings
The extension supports two levels of configuration:
- **Global:** Settings apply to all workspaces.
- **Workspace:** Settings override the global settings for the current workspace.

*Tip: Use Workspace settings to define specific “System Prompts” or “Tool Permissions” for different projects (e.g., a “Security” project might have all tool permissions set to “Deny”).*

### Chat & Context Management
- **Wrap Width:** Adjusts how the chat text wraps in the sidebar.
- **Plain Text:** If enabled, the extension will strip Markdown syntax from responses for a cleaner look.
- **Show Last Turn Only:** When enabled, the sidebar only shows the most recent exchange, keeping the UI clean while preserving the full conversation history in the background.
- **Stream Response:** Enables real-time streaming of the assistant’s output. This is most effective when paired with “Show Last Turn Only”, allowing short responses to appear instantly while keeping the chat history clean.
- **Context Strategy:**
    - **None:** Sends the full history for maximum context.
    - **Sliding Window:** Only the last *n* messages are sent to stay within token limits.
- **Message Limit:** Defines the maximum number of messages considered in the “Sliding Window” strategy.

### Tool Use & Permissions
The assistant can perform actions like listing files, reading files, and writing files. To ensure security, you can control these permissions:
- **Deny:** The assistant cannot use the tool.
- **Always Ask:** Nova will prompt you for permission every time the assistant tries to use the tool.
- **Allow:** The assistant can use the tool automatically.

*Note: The assistant is restricted to your current Workspace. It cannot access files outside of your active project.*

### MCP (Model Context Protocol)
The extension provides basic support for the Model Context Protocol to integrate external data sources and tools.

**Security Note:** Please note that this extension does not provide independent permission controls or security filtering for MCP servers. Since MCP servers are managed externally, you are solely responsible for ensuring that the connected servers are configured securely and that the permissions granted to the assistant are appropriate for the intended use.

You can configure your MCP servers via a `.json` file:

```json
{
    "mcpServers": {
        "local-server": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", "@modelcontextprotocol/server-github"],
            "env": {
                "GITHUB_TOKEN": "ghp_xxx"
            }
        },
        "remote-server": {
            "type": "http",
            "url": "https://mcp.example.com/api",
            "headers": {
                "Authorization": "Bearer token"
            }
        }
    }
}
```

## Commands
- **New Chat:** Starts a fresh conversation.
- **Open Chat:** Opens a previous chat history from a JSON file.
- **Clear Chat:** Wipes the current conversation history but keeps your session settings (Model, Server URL).
- **Save Chat:** Saves the current conversation to a JSON file.
- **Export Markdown:** Exports the current chat history as a formatted Markdown file.

## Troubleshooting
- **“Select a model first”:** Ensure you have chosen a model in the “Info” sidebar.
- **Tool errors:** If a tool fails, the assistant will receive an error message and should be able to explain why the action failed.