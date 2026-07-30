/**
 * toolHandler.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const ToolError = require("toolError.js");

class ToolHandler {

    constructor(config, emitter) {

        this.config = config;
        this.emitter = emitter;

        this.tools = new Map();
        this.toolSchemas = null;

        this.loadTools();
    }

    loadTools() {

        // Get files from "[extension]/Scripts/tools"

        const extensionPath = nova.extension.path;
        const toolsPath = nova.path.join(extensionPath, "Scripts", "tools");
        const toolFiles = nova.fs.listdir(toolsPath);

        for (const toolFile of toolFiles) {

            // Check if it's a .js file

            if (toolFile.endsWith(".js")) {

                // Try loading the tool and adding it to the tools Map

                try {
                    const tool = require(`tools/${toolFile}`);
                    const instance = new tool(this.config);
                    this.tools.set(instance.name, instance);
                } catch (error) {
                    console.error(`Loading "${toolFile}" failed with error ${error.message}`);
                }
            }
        }

        this.toolSchemas = [...this.tools.values()].map(tool => tool.schema);
    }

    async dispatch(toolCalls) {
        const tasks = toolCalls.map(async (toolCall) => {

            const toolName = toolCall.function.name;

            if (this.tools.has(toolName)) { // Check if we have the requested tool

                const tool = this.tools.get(toolName);

                try { // Tools may throw anytime, therefore try...catch

                    return await tool.do(toolCall);

                } catch (error) {
                    if (error instanceof ToolError) {
                        return this.failureEnvelope(toolCall.id, error.kind, error.message);
                    } else {
                        console.error(error);
                        return null;
                    }
                }
            } else {
                return this.failureEnvelope(toolCall.id, "tool_not_found", `Tool ${toolName} not found`);
            }
        });

        // Execute all tool calls in parallel

        const results = await Promise.all(tasks);
        const validResults = results.filter(result => result !== null);

        this.emitter.emit("sendMessage", validResults);
    }


    //! Helper

    failureEnvelope(toolCallID, kind, message) {
        return {
            id: toolCallID,
            content: {
                ok: false,
                kind: kind,
                error: message,
                retryable: false,
            },
        };
    }
}

module.exports = ToolHandler;