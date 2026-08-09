/**
 * apiHandler.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const ToolHandler = require("toolHandler.js");

class APIHandler {

    constructor(config, emitter, session) {

        this.config = config;
        this.emitter = emitter;

        this.session = session;

        this.toolHandler = new ToolHandler(config, emitter);


        //! Events

        emitter.on("sendMessage", (message) => {
            this.sendMessage(message);
        });
    }


    //! Get model list

    async getModelList() {

        try {

            if (!this.session.serverURL && !this.config.serverURL) {
                throw new Error("No Server URL configured");
            }

            const url = (this.session.serverURL || this.config.serverURL) + "/models";

            const response = await fetch(url, {
                method: "GET",
                headers: {
                    ...(this.config.APIKey ? { "Authorization": `Bearer ${this.config.APIKey}` } : {}),
                },
            });

            if (!response.ok) {
                throw new Error(`Server returned an error:\n${response.statusText}`);
            }

            const modelList = await response.json();

            if (modelList.data) {
                return modelList.data.map(model => model.id);
            } else {
                throw new Error("Sorry, but the model list is in an unknown format");
            }

        } catch (error) {
            this.handleError(error);
        }
    }


    //! Chat

    async sendMessage(prompt) {

        try {

            if (!this.session.serverURL && !this.config.serverURL) {
                throw new Error("No Server URL configured");
            }

            if (!this.session.modelID) {
                throw new Error("No Model selected");
            }


            // Handle prompt

            if (Array.isArray(prompt)) {

                // Prompt is an array of tool call results

                if (prompt.length === 0) {
                    this.session.removePendingMessages();
                    this.emitter.emit("updateChatView", null);
                    return; // Not a single valid result?
                }

                const toolCallResults = prompt.map(result => {
                    return {
                        role: "tool",
                        tool_call_id: result.id,
                        content: JSON.stringify(result.content),
                    };
                });

                // Add tool call results to current chat session

                for (const result of toolCallResults) {
                    this.session.addMessage(result);
                }

            } else if (typeof prompt === "string") {

                // Prompt is a user message

                const userMessage = {
                    role: "user",
                    content: prompt
                };

                // Add user message to current chat session

                this.session.addMessage(userMessage);

            } else {
                throw new Error("Unknown input type for sendMessage");
            }


            // Get all messages

            let messages = this.session.getMessages();


            // Prune chat history, if contextStrategy is "Sliding Window"
            // and messages.length > config.messageLimit

            if (
                this.config.contextStrategy === 1 &&
                messages.length > this.config.messageLimit
            ) {
                messages = this.pruneHistory(messages);
            }


            // Get available tools

            const availableTools = [];

            if (this.config.allowToolUse && nova.workspace.path) {
                availableTools.push(...this.toolHandler.toolSchemas);
            }

            if (this.toolHandler.mcpAdapter.toolSchemas.length) {
                availableTools.push(...this.toolHandler.mcpAdapter.toolSchemas);
            }


            // Create (pending) assistant message

            const assistantMessage = this.session.addMessage({
                isPending: true,
                role: "assistant",
            });

            this.emitter.emit("updateChatView", null);


            // Fetch stream

            const url = (this.session.serverURL || this.config.serverURL) + "/chat/completions";

            const response = await fetch(url, {
                method: "POST",
                headers: {
                    ...(this.config.APIKey ? { "Authorization": `Bearer ${this.config.APIKey}` } : {}),
                    "Content-Type": "application/json",
                    // "Accept": "application/json,text/event-stream",
                },
                body: JSON.stringify({
                    session_id: this.session.ID,
                    model: this.session.modelID,
                    messages: messages,
                    max_tokens: this.config.maxTokens || 2048,
                    temperature: Number(this.config.temperature.replace(",", ".")) || 0.2,
                    top_p: Number(this.config.topP.replace(",", ".")) || 0.9,
                    ...(availableTools.length ? { tools:  availableTools } : {}),
                    ...(availableTools.length ? { tool_choice:  "auto" } : {}),
                    stream: true,
                    stream_options: { include_usage: true },
                }),
            });

            if (!response.ok) {

                const responseHeaders = response.headers;
                const contentType = responseHeaders.get("Content-Type");

                if (contentType === "application/json") {
                    const responseObj = await response.json();
                    const errorMessage = responseObj?.error?.message || null;
                    if (errorMessage) {
                        throw new Error(errorMessage);
                    }
                }

                throw new Error(`${response.status} ${response.statusText}`);
            }


            // Await and parse SSE messages

            const chatCompletionChunks = await this.parseResponseBody(response.body);


            // Get message content and token usage (if included)

            let content = "";
            let promptTokens = 0;

            for (const chunk of chatCompletionChunks) {

                // Message
                content += chunk.choices?.[0]?.delta?.content || "";

                // Token Usage
                if (chunk.usage) {
                    promptTokens += chunk.usage.prompt_tokens || 0;
                }
            }


            // Get tool calls

            const toolCalls = await this.parseToolCalls(chatCompletionChunks);


            // Update assistant message

            assistantMessage.isPending = false;
            assistantMessage.content = content || null;
            assistantMessage.UIContent = assistantMessage.wrapContent();

            if (toolCalls.length) {
                assistantMessage.tool_calls = toolCalls;
                assistantMessage.addToolCallsToUIContent();
            }

            this.emitter.emit("updateChatView", assistantMessage);
            this.emitter.emit("updateTokens", promptTokens);


            // Dispatch tool calls

            if (toolCalls.length) {
                await this.toolHandler.dispatch(toolCalls);
            }


            // If there are no more pending tool calls
            // this turn is complete

            if (toolCalls.length === 0) {
                this.emitter.emit("turnComplete");
            }

        } catch (error) {
            this.session.removePendingMessages();
            this.emitter.emit("updateChatView", null);
            this.emitter.emit("turnComplete");
            this.handleError(error);
        }
    }


    //! Helper

    pruneHistory(messages) {

        const limit = this.config.messageLimit || 20;
        const start = Math.max(1, messages.length - limit);

        const systemMessage = messages[0];
        const recentMessages = messages.slice(start);

        const index = recentMessages.findIndex(msg => msg.role === "user");

        if (index < 0) {
            return [systemMessage];
        }

        return [systemMessage, ...recentMessages.slice(index)];
    }

    async parseResponseBody(stream) {

        const reader = stream.getReader();
        const decoder = new TextDecoder();

        const out = [];

        let buffer = "";
        let currentDataLines = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {

            const { value, done } = await reader.read();

            if (done) {
                break;
            }

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split(/\r?\n/);

            buffer = lines.pop() ?? "";

            for (const rawLine of lines) {

                const line = rawLine.trimEnd();

                if (line.startsWith("data:")) {
                    currentDataLines.push(line.slice(5).trimStart());
                }

                if (line === "") { // Blank line -> end of SSE message

                    if (currentDataLines.length) {

                        const payload = currentDataLines.join("\n").trim();
                        currentDataLines = [];

                        if (!payload) {
                            continue;
                        }

                        if (payload === "[DONE]") {
                            reader.releaseLock();
                            return out;
                        }

                        try {

                            const chunk = JSON.parse(payload);

                            out.push(chunk);
                            this.emitter.emit("updatePendingMessage", chunk);

                        } catch (error) {
                            // noop
                        }
                    }

                    continue;
                }
            }
        }

        // Flush any trailing SSE message

        const tail = buffer.trim();
        if (tail) {
            const line = tail.match(/^data:\s*(.+)$/);
            if (line) {
                const payload = line[1].trim();
                if (payload && payload !== "[DONE]") {
                    out.push(JSON.parse(payload));
                }
            }
        }

        reader.releaseLock();
        return out;
    }

    async parseToolCalls(chatCompletionChunks) {

        const toolCalls = [];

        for (const chunk of chatCompletionChunks) {

            const toolCallArray = chunk.choices?.[0]?.delta?.tool_calls;

            if (!Array.isArray(toolCallArray)) {
                continue;
            }

            for (const item of toolCallArray) {

                const { id, function: { name, arguments: args = "" } } = item;

                const toolCall = toolCalls[item.index];

                if (!toolCall) {

                    // Use the provided Tool Call index here
                    // This MAY result in a sparse array, but we clean up on return

                    toolCalls[item.index] = {
                        index: item.index,
                        id: id,
                        type: "function",
                        function: {
                            name: name,
                            arguments: args,
                        }
                    };

                } else {
                    id   && (toolCall.id = id);
                    name && (toolCall.function.name = name);
                    args && (toolCall.function.arguments += args);
                }
            }
        }

        // Array.filter() skips empty slots

        return toolCalls.filter(() => true);
    }

    handleError(error) {
        nova.workspace.showErrorMessage(error.message);
    }
}

module.exports = APIHandler;