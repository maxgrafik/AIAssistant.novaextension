/**
 * mcpTool.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Tool = require("tool.js");
const ToolError = require("toolError.js");

class MCPTool extends Tool {

    constructor(config, tool) {

        super();

        this.name = tool.name;
        this.schema = {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
            }
        };

        // http
        this.url = config.url;
        this.headers = config.headers || {};

        // stdio
        this.command = config.command;
        this.args = config.args || [];
        this.env = config.env || null;
    }

    async do(toolCall, mcpAdapter) {

        // 1. Parse arguments

        let args = null;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (error) {
            throw new ToolError("execution_error", `Parsing arguments failed with error "${error.message}"`);
        }

        // 2. Check arguments

        this.checkArguments(this.schema, args);


        // 3. Do what this tool is supposed to do

        const jsonrpc = {
            jsonrpc: "2.0",
            id: toolCall.id,
            method: "tools/call",
            params: {
                name: this.name,
                arguments: args,
                _meta: {
                    "io.modelcontextprotocol/protocolVersion": mcpAdapter.PROTOCOL_VERSION,
                    "io.modelcontextprotocol/clientInfo": {
                        name: nova.extension.name,
                        version: nova.extension.version
                    },
                    "io.modelcontextprotocol/clientCapabilities": {}
                }
            },
        };

        try {

            const result = await mcpAdapter.send(this, jsonrpc);

            const content = result.content || null;
            if (!content) {
                throw new ToolError("execution_error", "Tool returned no result");
            }

            // Success Envelope

            const successEnvelope = {
                id: toolCall.id,
                content: {
                    ok: true,
                    tool: this.name,
                    result: content,
                }
            };

            return successEnvelope;

        } catch (error) {
            throw new ToolError("execution_error", `Tool failed with error "${error.message}"`);
        }
    }
}

module.exports = MCPTool;