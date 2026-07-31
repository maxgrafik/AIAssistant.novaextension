/**
 * session.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Message = require("message.js");

class Session {

    constructor(config, emitter) {

        this.config = config;
        this.emitter = emitter;

        this.ID = null;
        this.serverURL = null; // Only for overrides!
        this.modelID = null;
        this.messages = [];

        this.promptTokens = 0;

        this.filePath = null;
        this.createdAt = null;
        this.hasUnsavedChanges = false;

        this.hasAutoSaveFailed = false;
        this.toolCallFails = new Map();
    }

    getMessages() {
        return this.messages.map(msg => {
            return {
                role: msg.role,
                content: msg.content,
                ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}),
                ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
            };
        });
    }

    getMessage(id) {
        try {
            return this.messages[id];
        } catch (error) {
            return null;
        }
    }

    getMessageIDs() {

        let lastUserMessageIndex;
        const messageIDs = [];

        for (let i = 0; i < this.messages.length; i++) {

            const role = this.messages[i].role;

            if (role === "user" || role === "assistant") {
                messageIDs.push(i);
            }

            if (role === "user") {
                lastUserMessageIndex = i;
            }
        }

        if (this.config.showLastTurnOnly && lastUserMessageIndex) {
            return messageIDs.filter(id => id >= lastUserMessageIndex);
        } else {
            return messageIDs;
        }
    }

    addMessage(message) {

        this.messages.push(
            new Message(this.config, message)
        );

        // Track tool call fails
        // Used to provide more info for failed tool calls in the UI.
        // The RegExp is a quick 'n dirty search for "ok":false
        // Avoids parsing the whole message.content JSON for no reason.
        // False positives are okay. We check again after parsing.

        if (
            message.role === "tool" &&
            /"ok"\s*:\s*false/.test(message.content)
        ) {
            const content = JSON.parse(message.content);
            if (!content.ok){
                this.toolCallFails.set(message.tool_call_id, {
                    kind: content.kind,
                    error: content.error,
                });
            }
        }

        // Auto save only when the turn is complete
        // role = "assistant" && no pending tool_calls

        if (
            this.config.autoSave &&
            message.role === "assistant" &&
            message.tool_calls === undefined
        ) {
            this.saveChat(/* isAutoSave */ true);
        }
    }

    addTokens(promptTokens) {
        this.promptTokens += promptTokens;
        if (this.promptTokens > 0) {
            this.emitter.emit("updateSessionInfoView");
        }
    }


    //! Server override

    updateServer(serverURL) {
        if (serverURL && serverURL !== this.config.serverURL) {
            this.serverURL = serverURL;
        } else {
            this.serverURL = null;
        }
        this.hasUnsavedChanges = true;
        if (this.config.autoSave) {
            this.saveChat(/* isAutoSave */ true);
        }
    }

    //! Model update

    updateModel(modelID) {
        this.modelID = modelID;
        this.hasUnsavedChanges = true;
        if (this.config.autoSave) {
            this.saveChat(/* isAutoSave */ true);
        }
    }


    //! Open/Save/Clear/New

    openChat() {
        return new Promise((resolve) => {
            this.showOpenDialog().then((filePath) => {
                if (filePath) {
                    this.open(filePath);
                    resolve(/* userCancelled */ false);
                } else {
                    resolve(/* userCancelled */ true);
                }
            });
        });
    }

    saveChat(isAutoSave) {
        return new Promise((resolve) => {

            if (!isAutoSave) {

                const workspaceName = this.getWorkspaceName();

                let defaultName = workspaceName ? `${workspaceName.trim()} Chat.json` : "Chat.json";
                let defaultLocation = null;

                if (this.filePath) {
                    defaultName = nova.path.basename(this.filePath);
                    defaultLocation = nova.path.dirname(this.filePath);
                }

                this.showSaveDialog(defaultName, defaultLocation).then((filePath) => {
                    if (filePath) {
                        this.filePath = filePath;
                        this.save();
                        resolve(/* userCancelled */ false);
                    } else {
                        resolve(/* userCancelled */ true);
                    }
                });
            }

            if (isAutoSave && !this.hasAutoSaveFailed) {
                try {

                    if (this.filePath === null) {

                        let path = nova.workspace.path;
                        if (!path) {
                            return; // No auto save for non-workspace files
                        }

                        path = nova.path.join(path, ".assistant");

                        if (!nova.fs.access(path, nova.fs.F_OK)) {
                            nova.fs.mkdir(path);
                        }

                        this.filePath = nova.path.join(path, "autosave.json");
                    }

                    this.save();

                } catch (error) {
                    this.hasAutoSaveFailed = true;
                    nova.workspace.showErrorMessage(`Auto save failed and is disabled for this session\n${error.message}`);
                }
            }
        });
    }

    exportMarkdown() {

        const workspaceName = this.getWorkspaceName();

        let defaultName = workspaceName ? `${workspaceName.trim()} Chat.md` : "Chat.md";

        if (this.filePath) {
            const splitext = nova.path.splitext(this.filePath);
            defaultName = `${nova.path.basename(splitext[0] || defaultName)}.md`;
        }

        this.showSaveDialog(defaultName, null).then((filePath) => {
            if (filePath) {
                this.saveMarkdown(filePath);
            }
        });
    }

    clearChat() {

        const ID = this.ID;
        const serverURL = this.serverURL;
        const modelID = this.modelID;
        const filePath = this.filePath;
        const createdAt = this.createdAt;

        this.newChat();

        this.ID = ID;
        this.serverURL = serverURL;
        this.modelID = modelID;
        this.filePath = filePath;
        this.createdAt = createdAt;

        this.hasUnsavedChanges = true;

        if (this.config.autoSave) {
            this.saveChat(/* isAutoSave */ true);
        }

        this.emitter.emit("updateSessionInfoView");
    }

    newChat() {

        this.toolCallFails.clear();

        this.ID = `Nova.${nova.crypto.randomUUID()}`;
        this.serverURL = null;
        // this.modelID = null; // <- Maybe we should preserve the modelID
        this.messages = [];
        this.addMessage({
            role: "system",
            content: this.config.systemPrompt,
        });

        this.promptTokens = 0;

        this.filePath = null;
        this.createdAt = new Date().toISOString();
        this.hasUnsavedChanges = false;

        this.emitter.emit("updateSessionInfoView");
    }


    //! File operations

    open(path) {
        try {

            const fileObj  = nova.fs.open(path, "r");
            const content  = fileObj.read();
            fileObj.close();

            const chat = JSON.parse(content);

            if (
                chat.type !== "chat history" ||
                chat.messages === undefined ||
                chat.messages.length === 0
            ) {
                throw new Error("Wrong chat format");
            }

            this.toolCallFails.clear();

            this.ID = chat.sessionID || `Nova.${nova.crypto.randomUUID()}`;
            this.serverURL = chat.serverURL || null;
            this.modelID = chat.modelID || null;
            this.messages = [];
            for (const message of chat.messages) {
                this.addMessage(message);
            }

            this.promptTokens = chat.promptTokens || 0;

            this.filePath = path;
            this.createdAt = chat.createdAt || null;
            this.hasUnsavedChanges = false;

            this.emitter.emit("updateSessionInfoView");

        } catch (error) {
            nova.workspace.showErrorMessage(`Error opening chat\n${error.message}`);
        }
    }

    save() {
        try {

            if (this.filePath === null) {
                throw new Error("No file path");
            }

            const chat = {
                type: "chat history",
                sessionID: this.ID,
                ...(this.serverURL ? { serverURL: this.serverURL } : {}),
                modelID: this.modelID,
                createdAt: this.createdAt,
                updatedAt: new Date().toISOString(),
                promptTokens: this.promptTokens,
                messages: this.messages.map(msg => ({
                    role: msg.role,
                    content: msg.content,
                    ...(msg.tool_calls.length ? { tool_calls: msg.tool_calls } : {}),
                    ...(msg.tool_call_id ? { tool_call_id: msg.tool_call_id } : {}),
                }))
            };

            const fileObj  = nova.fs.open(this.filePath, "w");
            fileObj.write(JSON.stringify(chat));
            fileObj.close();

            this.hasUnsavedChanges = false;

        } catch (error) {
            nova.workspace.showErrorMessage(`Error saving chat\n${error.message}`);
        }
    }

    saveMarkdown(path) {
        try {

            let markdown = "";
            let addSeparatorForNextTurn = false;

            // Frontmatter

            markdown += "---\n";

            const workspaceName = this.getWorkspaceName();
            if (workspaceName) {
                markdown += `workspace: ${workspaceName}\n`;
            }

            markdown += `createdAt: ${this.createdAt}\n`;
            markdown += `server: ${this.serverURL || this.config.serverURL}\n`;
            markdown += `model: ${this.modelID}\n`;
            markdown += "---\n\n";

            // Messages

            for (const message of this.messages) {

                if (message.role === "user") {

                    if (addSeparatorForNextTurn) {
                        markdown += "---\n\n";
                    }

                    markdown += "**You:**  \n";
                    markdown += `${message.content.trim()}\n\n`;

                    addSeparatorForNextTurn = true;
                }

                if (message.role === "assistant") {

                    markdown += "**Assistant:**  \n";

                    if (message.content) {
                        markdown += `${message.content.trim()}\n\n`;
                    }

                    if (message.tool_calls && message.tool_calls.length) {
                        for (const toolCall of message.tool_calls) {

                            markdown += "```\n";
                            markdown += `Tool Call: ${toolCall.function.name}\n`;

                            if (this.toolCallFails.has(toolCall.id)) {
                                const toolCallFail = this.toolCallFails.get(toolCall.id);
                                markdown += `[${toolCallFail.kind}] ${toolCallFail.error}\n`;
                            } else {
                                markdown += `Arguments: ${toolCall.function.arguments}\n`;
                            }

                            markdown += "```\n\n";
                        }
                    }
                }
            }

            const fileObj  = nova.fs.open(path, "w");
            fileObj.write(markdown);
            fileObj.close();

        } catch (error) {
            nova.workspace.showErrorMessage(`Error exporting Markdown\n${error.message}`);
        }
    }


    //! Helper

    getWorkspaceName() {

        try {

            const workspacePath = nova.workspace.path;
            if (!workspacePath) {
                return null;
            }

            const configurationPath = nova.path.join(workspacePath, ".nova", "Configuration.json");
            if (!nova.fs.access(configurationPath, nova.fs.F_OK + nova.fs.R_OK)) {
                return null;
            }

            const fileObj  = nova.fs.open(configurationPath, "r");
            const content  = fileObj.read();
            fileObj.close();

            const configuration = JSON.parse(content);

            return configuration["workspace.name"] || null;

        } catch (error) {
            return null;
        }
    }

    showOpenDialog() {
        return new Promise((resolve) => {
            nova.workspace.showFileChooser(
                "",
                {prompt: "Open Chat", allowFiles: true, allowMultiple: false, filetype: "json"},
                (files) => {
                    if (files && files.length > 0) {
                        resolve(files[0]);
                    } else {
                        resolve(null);
                    }
                }
            );
        });
    }

    showSaveDialog(defaultName, defaultLocation) {
        return new Promise((resolve) => {
            try {

                // Nova has a showFileChooser, but no dialog for saving files
                // so we're using AppleScript to get a "choose file name" dialog
                // It's macOS so chances are high there's "/usr/bin/osascript"

                let osascript = "";
                osascript += "tell application \"Nova\"\n";

                if (defaultLocation !== null) {
                    osascript += `set theLocation to POSIX file "${defaultLocation}" as alias\n`;
                    osascript += `set theFile to choose file name default name "${defaultName}" default location theLocation\n`;
                } else {
                    osascript += `set theFile to choose file name default name "${defaultName}"\n`;
                }
                osascript += "POSIX path of theFile\n";
                osascript += "end";

                const options = {
                    args: ["-e", osascript]
                };

                const process = new Process("/usr/bin/osascript", options);

                process.onStdout((path) => {
                    resolve(path.trim());
                });

                process.onStderr((error) => {
                    if (!error.trim().endsWith("(-128)")) { // (-128) = User cancelled
                        console.log(`[showSaveDialog] Error: ${error}`);
                    }
                    resolve(null);
                });

                process.start();

            } catch (error) {
                console.error(error);
                resolve(null);
            }
        });
    }
}

module.exports = Session;