/**
 * mcpAdapter.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const MCPTool = require("mcpTool.js");

class MCPAdapter {

    constructor(config, emitter) {

        this.config = config;
        this.emitter = emitter;

        this.tools = new Map();
        this.toolSchemas = [];

        this.PROTOCOL_VERSION = "2026-07-28";


        //! Events

        emitter.on("reloadMCPTools", () => {
            this.loadTools();
        });
    }

    async loadTools() {

        this.tools.clear();
        this.toolSchemas = [];

        if (!this.config.mcpConfigPath) {
            return;
        }

        const mcpServers = new Map();

        try {

            const fileStats = nova.fs.stat(this.config.mcpConfigPath);
            if (fileStats && !fileStats.isFile()) {
                throw new Error("The provided configuration is not a file");
            }

            if (!nova.fs.access(this.config.mcpConfigPath, nova.fs.F_OK + nova.fs.R_OK)) {
                throw new Error("The configuration file does not exist or can not be read");
            }

            const fileObj = nova.fs.open(this.config.mcpConfigPath, "r");
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

            if (tools !== null && (!Array.isArray(tools) || tools.length === 0)) {
                console.error(`[MCP] Returned tool list is empty or invalid (${server})`);
                return null;
            }

            if (tools === null) {
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
                    "io.modelcontextprotocol/protocolVersion": this.PROTOCOL_VERSION,
                    "io.modelcontextprotocol/clientInfo": {
                        name: nova.extension.name,
                        version: nova.extension.version
                    },
                    "io.modelcontextprotocol/clientCapabilities": {}
                }
            }
        };

        try {

            const result = await this.send(config, jsonrpc);

            return result.tools || null;

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

        let data = null;

        if (tool.url) {
            data = await this.sendHttp(tool, jsonrpc);
        } else if (tool.command) {
            data = await this.sendStdio(tool, jsonrpc);
        } else {
            return null;
        }

        return await this.parseResponse(data);
    }

    async sendHttp(tool, jsonrpc) {

        const headers = {
            "Content-Type": "application/json",
            "Accept": "application/json,text/event-stream",
            "MCP-Protocol-Version": this.PROTOCOL_VERSION,
            "Mcp-Method": jsonrpc.method,
            ...(jsonrpc.method === "tools/call" ? { "Mcp-Name": jsonrpc.params.name } : {}),
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

        const responseHeaders = response.headers;
        const contentType = responseHeaders.get("Content-Type");

        if (!response.ok) {
            if (contentType === "application/json") {
                return await response.json();
            } else {
                throw new Error(`${response.status} ${response.statusText}`);
            }
        }

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

            const eventListeners = new CompositeDisposable();

            // Create Process

            const process = new Process(tool.command, {
                args: tool.args,
                ...(tool.env ? { env: tool.env } : {}),
            });

            // Add event listeners

            eventListeners.add(
                process.onStdout(lines => {

                    // Stdio
                    // https://modelcontextprotocol.io/specification/2026-07-28/basic/transports/stdio
                    //
                    // - Messages are delimited by newlines, and MUST NOT contain embedded newlines
                    // - Each message is a single JSON-RPC request, notification, or response
                    // - The client SHOULD initiate shutdown by:
                    //   1. Closing the input stream to the child process (the server)
                    //   2. Waiting for the server to exit
                    //   3. If the server does not exit within a reasonable time, forcibly terminating the process
                    //
                    //
                    // https://modelcontextprotocol.io/specification/2026-07-28/basic
                    //
                    // Result Responses
                    // - Result responses MUST include the same ID as the request they correspond to
                    // - Result responses MUST include a result field
                    // - The result field MUST include a resultType field to indicate the type of the result
                    //   - "complete" = the request completed successfully
                    //   - "input_required" = likely a multi round-trip request (MRTR)
                    //   - A resultType of any value unrecognized by the client MUST be considered invalid
                    //   - Treat absent resultType as "complete" (for backward compatibility)
                    //
                    // {
                    //     jsonrpc: "2.0",
                    //     id: string | number,
                    //     result: {
                    //         resultType: string
                    //     }
                    // }
                    //
                    // Error Responses
                    // - Error responses MUST include the same ID as the request they correspond to
                    // - Error responses MUST include an error field with a "code" and "message"
                    //
                    // {
                    //     jsonrpc: "2.0",
                    //     id: string | number,
                    //     error: {
                    //         ...
                    //     }
                    // }

                    const messages = lines.split("\n").filter(line => line.trim() !== "");

                    try {
                        for (let message of messages) {

                            message = JSON.parse(message.trim());

                            // Response complete or error

                            if (
                                message.id === jsonrpc.id &&
                                (
                                    (message.result && message.result.resultType === "complete") ||
                                    (message.result && message.result.resultType === undefined) ||
                                    (message.error)
                                )
                            ) {
                                eventListeners.dispose();
                                process.terminate();
                                resolve(message);
                                return;
                            }

                            // What shall we do with the drunk...
                            // We likely may never support MRTR ("input_required")

                            if (
                                message.id === jsonrpc.id &&
                                message.result &&
                                message.result.resultType === "input_required"
                            ) {
                                eventListeners.dispose();
                                process.terminate();
                                resolve(null);
                                return;
                            }

                            // Consider any other result type invalid

                            if (
                                message.id === jsonrpc.id &&
                                message.result &&
                                message.result.resultType !== "complete" &&
                                message.result.resultType !== "input_required"
                            ) {
                                eventListeners.dispose();
                                process.terminate();
                                resolve(null);
                                return;
                            }
                        }

                    } catch (error) {
                        console.error(`[MCP] Error parsing message (stdin)\n${error.message}`);
                        eventListeners.dispose();
                        process.terminate();
                        resolve(null);
                        return;
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
                eventListeners.dispose();
                process.terminate();
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
                writer?.close();
                eventListeners.dispose();
                process.terminate();
                resolve(null);
            }
        });
    }

    async parseResponse(data) {

        if (!data) {
            throw new Error("No valid data returned");
        }

        if (!data.jsonrpc || data.jsonrpc !== "2.0") {
            throw new Error("Response is not a JSON-RPC 2.0 message");
        }

        if (data.error) {
            throw new Error(data.error.message);
        }

        const result = data.result || null;

        if (!result) {
            throw new Error('Response does not contain "result" field');
        }

        return result;
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