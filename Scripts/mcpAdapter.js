/**
 * mcpAdapter.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const MCPTool = require("mcpTool.js");

class MCPAdapter {

    constructor() {

        this.tools = new Map();
        this.toolSchemas = null;
    }

    async loadConfig(mcpConfigPath) {

        const mcpServers = new Map();

        try {

            const fileStats = nova.fs.stat(mcpConfigPath);
            if (fileStats && !fileStats.isFile()) {
                throw new Error("The provided configuration is not a file");
            }

            if (!nova.fs.access(mcpConfigPath, nova.fs.F_OK + nova.fs.R_OK)) {
                throw new Error("The configuration file does not exist or can not be read");
            }

            const fileObj = nova.fs.open(mcpConfigPath, "r");
            const content = fileObj.read();
            fileObj.close();

            const mcpConfig = JSON.parse(content);

            // Check if mcpConfig has "mcpServers"

            if (!Object.hasOwn(mcpConfig, "mcpServers")) {
                throw new Error("The configuration has no “mcpServers” key");
            }

            for (const [name, config] of Object.entries(mcpConfig.mcpServers)) {
                mcpServers.set(name, config);
            }

        } catch (error) {
            this.handleError(error);
            return;
        }


        // Get each server's tools list

        const requests = Array.from(mcpServers.entries()).map(async ([server, config]) => {

            if (config.type && config.type !== "http" && config.type !== "stdio") {
                console.error(`[MCP] Only type "http" and "stdio" are supported (${server})`);
                return null;
            }

            if (!config.url && !config.command) {
                console.error(`[MCP] Neither "url" nor "command" specified (${server})`);
                return null;
            }

            const tools = await this.getTools(server, config);

            if (!tools || !Array.isArray(tools) || tools.length === 0) {
                console.error(`[MCP] Returned tool list is empty or invalid (${server})`);
                return null;
            }

            return { server: server, config: config, tools: tools };

        });

        const results = await Promise.all(requests);
        const validResults = results.filter(result => result !== null);

        if (validResults.length !== results.length) {
            this.showNotification("Loading tools failed partially.\nSee log for more info.\n");
        }

        // Create tools

        for (const result of validResults) {
            await this.createTools(result.server, result.config, result.tools);
        }

        this.toolSchemas = [...this.tools.values()].map(tool => tool.schema);

        console.log(`[MCP] ${this.tools.size} tools loaded (${[...this.tools.keys()].join(", ")})`);
    }

    async getTools(server, config) {

        const jsonrpc = {
            jsonrpc: "2.0",
            id: `Nova.${nova.crypto.randomUUID()}`,
            method: "tools/list",
            params: {
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
                    "io.modelcontextprotocol/clientInfo": {
                        name: "NovaAIAssistant",
                        version: "1.0.0"
                    },
                    "io.modelcontextprotocol/clientCapabilities": {}
                }
            }
        };

        try {

            const data = await this.send(config, jsonrpc);

            return data?.result?.tools || null;

        } catch (error) {
            console.error(`[MCP] Error getting tool list (${server})`);
            console.error(`[MCP] ${error.message}`);
            return null;
        }
    }

    async createTools(server, config, tools) {

        for (const tool of tools) {

            const name = tool.name;
            const description = tool.description;
            const schema = tool.inputSchema;

            if (!name || !description || !schema) {
                console.error(`[MCP] Tool is missing name, desription or schema (${server})`);
                continue;
            }

            this.tools.set(
                name,
                new MCPTool(config, tool)
            );
        }
    }


    //! Helper

    async send(tool, jsonrpc) {
        if (tool.url) {
            return await this.sendHttp(tool, jsonrpc);
        } else if (tool.command) {
            return await this.sendStdio(tool, jsonrpc);
        } else {
            return null;
        }
    }

    async sendHttp(tool, jsonrpc) {

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json,text/event-stream",
        };

        if (!!tool.headers && typeof tool.headers === "object") {
            for (const [key, value] of Object.entries(tool.headers)) {
                headers[key] = value;
            }
        }

        const response = await fetch(tool.url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(jsonrpc),
        });

        if (!response.ok) {
            const jsonrpcError = await response.json();
            if (jsonrpcError?.error?.message) {
                throw new Error(`${jsonrpcError.error.message}`);
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        }

        const responseHeaders = response.headers;
        const contentType = responseHeaders.get("Content-Type");

        if (contentType === "text/event-stream") {

            return await this.parseResponseBody(response.body);

        } else if (contentType === "application/json") {

            return await response.json();

        } else {

            this.showNotification(`Content-Type not supported:\n${contentType}\n`);
        }
    }

    async sendStdio(tool, jsonrpc) {
        return new Promise(resolve => {

            let stdout = "";

            const eventListeners = new CompositeDisposable();

            // Create Process

            const process = new Process(tool.command, {
                args: tool.args,
                ...(tool.env ? { env: tool.env } : {}),
            });

            // Add event listeners

            eventListeners.add(
                process.onStdout(chunk => {

                    stdout += chunk.trim();

                    try {
                        resolve(JSON.parse(stdout));
                        process.terminate();
                    } catch (error) {
                        // noop - message not complete yet
                    }
                })
            );

            eventListeners.add(
                process.onDidExit(() => {
                    eventListeners.dispose();
                })
            );

            // Start Process

            process.start();

            // After struggling for a while ...
            // The most important part is "\n\n" at the end!

            const stdin = JSON.stringify(jsonrpc) + "\n\n";

            // Get WriteableStream

            const stream = process.stdin;

            if (!stream) {
                console.error("[MCP] No WriteableStream (stdin)");
                resolve(null);
                return;
            }

            // Write to stdin

            const writer = stream.getWriter();
            try {
                writer.write(stdin);
                writer.close();
            } catch (error) {
                console.error(`[MCP] Writing to stdin failed\n${error.message}`);
                writer.close();
                resolve(null);
            }
        });
    }

    async parseResponseBody(stream) {

        const reader = stream.getReader();
        const decoder = new TextDecoder();

        let out = "";
        let buffer = "";

        // eslint-disable-next-line no-constant-condition
        while (true) {

            const { value, done } = await reader.read();

            let sseMessages = [];

            if (!done) {
                buffer += decoder.decode(value);
                sseMessages = buffer.split("\n\n");
                buffer = sseMessages.pop() ?? "";
            } else {
                sseMessages = [buffer];
            }

            for (const message of sseMessages) {
                const lines = message.split("\n");
                for (let line of lines) {
                    line = line.trim();
                    if (line.startsWith("data:")) {
                        out += line.slice(5).trimStart();
                    }
                }
            }

            if (done) break;
        }

        if (!out) {
            return null;
        }

        try {
            return JSON.parse(out);
        } catch (error) {
            return null;
        }
    }

    handleError(error) {
        nova.workspace.showErrorMessage(`[MCP] ${error.message}`);
    }

    showNotification(message) {
        const request = new NotificationRequest("maxgrafik.AIAssistant.MCPError");
        request.title = "MCP";
        request.body = message;
        request.actions = ["OK"];
        nova.notifications.add(request);
    }
}

module.exports = MCPAdapter;