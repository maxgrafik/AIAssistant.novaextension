/**
 * chatDataProvider.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class ChatDataProvider {

    constructor(config, emitter, session) {

        this.config = config;
        this.emitter = emitter;
        this.treeView = null;

        this.session = session;

        this.currentTurnIndex = null;
        this.showLastTurnOnly = this.config.showLastTurnOnly;
        this.showIntermediateMessage = false;


        //! Events

        emitter.on("addIntermediateMessage", () => {
            this.showIntermediateMessage = true;
            if (this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }
            this.update("__pending");
        });

        emitter.on("removeIntermediateMessage", () => {
            this.showIntermediateMessage = false;
            if (this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }
            this.update("__pending");
        });

        emitter.on("toggleView", (state) => {
            if (state !== undefined) {
                this.showLastTurnOnly = state;
            } else {
                this.showLastTurnOnly = !this.showLastTurnOnly;
            }
            if (!this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }
            this.update();
        });

        emitter.on("showNextTurn", () => {
            this.currentTurnIndex += 1;
            this.update();
        });

        emitter.on("showPreviousTurn", () => {
            this.currentTurnIndex -= 1;
            this.update();
        });

        emitter.on("showLastTurn", () => {
            this.currentTurnIndex = null;
            this.update();
        });

        emitter.on("newChat", () => {
            this.session.newChat();
            this.currentTurnIndex = null;
            this.showLastTurnOnly = this.config.showLastTurnOnly;
            this.showIntermediateMessage = false;
            this.update();
        });

        emitter.on("openChat", () => {
            this.session.openChat().then((userCancelled) => {
                if (!userCancelled) {
                    this.currentTurnIndex = null;
                    this.showLastTurnOnly = this.config.showLastTurnOnly;
                    this.showIntermediateMessage = false;
                    this.update();
                }
            });
        });

        emitter.on("clearChat", () => {
            this.session.clearChat();
            this.currentTurnIndex = null;
            // this.showLastTurnOnly = this.config.showLastTurnOnly; // <- Probably not
            this.showIntermediateMessage = false;
            this.update();
        });

        emitter.on("saveChat", (nextEvent) => {
            this.session.saveChat(/* isAutoSave */ false).then((userCancelled) => {
                if (userCancelled) {
                    return;
                }
                if (nextEvent === "newChat") {
                    this.session.newChat();
                    this.currentTurnIndex = null;
                    this.showLastTurnOnly = this.config.showLastTurnOnly;
                    this.showIntermediateMessage = false;
                    this.update();
                } else if (nextEvent === "openChat") {
                    this.session.openChat().then((userCancelled) => {
                        if (!userCancelled) {
                            this.currentTurnIndex = null;
                            this.showLastTurnOnly = this.config.showLastTurnOnly;
                            this.showIntermediateMessage = false;
                            this.update();
                        }
                    });
                }
            });
        });

        emitter.on("exportMarkdown", () => {
            this.session.exportMarkdown();
        });

        emitter.on("copyCode", (treeItems) => {
            this.copyCode(treeItems, null);
        });

        emitter.on("copyMessage", (treeItems) => {
            this.copyMessage(treeItems);
        });

        emitter.on("rewrapMessages", () => {
            for (const message of this.session.messages) {
                if (message.role === "user" || message.role === "assistant") {
                    message.lines = [];
                    message.codeBlocks = [];
                    message.wrapContent(message.content);
                }
            }
            this.update();
        });
    }

    copyCode(element) {

        const id = element[0].split("-");

        const message = this.session.getMessage(id[0]);
        if (!message) {
            return;
        }

        const line = message.getLine(id[1]);
        if (line === undefined) {
            return;
        }

        const codeBlockIndex = line.replace(/__code (\d+)/, "$1");
        const codeBlock = message.codeBlocks[codeBlockIndex];

        nova.clipboard.writeText(codeBlock.code.join("\n"));
    }

    copyMessage(element) {

        const message = this.session.getMessage(element);
        if (!message) {
            return;
        }

        nova.clipboard.writeText(message.content);
    }


    //! TreeDataProvider required methods

    getChildren(element) {

        // element = root
        // Return message indices

        if (element === null) {

            let children = [];

            const [ messageIDs, userMessageIDs ] = this.session.getMessageIDs();

            if (!this.showLastTurnOnly) {
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPreviousTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", false);
                this.currentTurnIndex = userMessageIDs.length - 1;
                children = [...messageIDs];
            } else {

                if (this.currentTurnIndex === null) {
                    this.currentTurnIndex = userMessageIDs.length - 1;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                }

                if (this.currentTurnIndex >= userMessageIDs.length - 1) {
                    this.currentTurnIndex = userMessageIDs.length - 1;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                } else if (this.currentTurnIndex < userMessageIDs.length - 1) {
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", true);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", false);
                }

                if (this.currentTurnIndex <= 0) {
                    this.currentTurnIndex = 0;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPreviousTurn", false);
                } else if (this.currentTurnIndex > 0) {
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPreviousTurn", true);
                }

                // We set currentTurnIndex above, so it is a valid index here

                const userMessageIDForCurrentTurn = userMessageIDs[this.currentTurnIndex];
                const userMessageIDForNextTurn = userMessageIDs[this.currentTurnIndex+1];

                const start = messageIDs.findIndex(id => id === userMessageIDForCurrentTurn);

                let end = messageIDs.length;
                if (userMessageIDForNextTurn !== undefined) {
                    end = messageIDs.findIndex(id => id === userMessageIDForNextTurn);
                }

                children = [...messageIDs.slice(start, end)];
            }

            if (this.showIntermediateMessage) {
                children.push("__pending");
            }

            return children;
        }


        // element = <msgIndex>
        // Return line & tool_call indices of message[<msgIndex>]

        if (/^\d+$/.test(element)) {
            const message = this.session.getMessage(element);
            if (message) {
                const lineIDs = message.getLineIDs().map(i => `${element}-${i}`);
                const toolIDs = message.tool_calls.map((_, i) => `__tool ${element}-${i}`);
                return [].concat(lineIDs, toolIDs);
            }
        }


        // element = <msgIndex>-<lineIndex>
        // Return codeBlock line indices of message[<msgIndex>].lines[<lineIndex>]

        if (/^\d+-\d+$/.test(element)) {

            const id = element.split("-");

            const message = this.session.getMessage(id[0]);
            if (!message) {
                return [];
            }

            const line = message.getLine(id[1]);
            if (line === undefined) {
                return [];
            }

            const codeBlockIndex = line.replace(/__code (\d+)/, "$1");
            const codeBlock = message.codeBlocks[codeBlockIndex];

            return codeBlock.code.map((_, i) => `__code ${id[0]}-${codeBlockIndex}-${i}`);
        }


        // None of the above
        return [];
    }

    getTreeItem(element) {

        // Chat message codeBlock line
        // element = __code <msgIndex>-<codeBlockIndex>-<codeBlockLineIndex>

        if (/__code \d+-\d+-\d+/.test(element)) {

            const id = element.replace(/__code (\d+-\d+-\d+)/, "$1").split("-");

            const message = this.session.getMessage(id[0]);
            if (!message) {
                return null;
            }

            const codeBlock = message.codeBlocks[id[1]];
            if (!codeBlock) {
                return null;
            }

            const codeLine = codeBlock.code[id[2]];

            const item = new TreeItem(codeLine, TreeItemCollapsibleState.None);
            // item.collapsibleState =
            // item.descriptiveText =
            // item.tooltip =
            // item.identifier =
            // item.contextValue =
            // item.command =
            item.image = "sidebar-text";

            return item;
        }


        // Tool call
        // element = __tool <msgIndex>-<toolCallIndex>

        if (/__tool \d+-\d+/.test(element)) {

            const id = element.replace(/__tool (\d+-\d+)/, "$1").split("-");

            const message = this.session.getMessage(id[0]);
            if (!message) {
                return null;
            }

            const toolCall = message.tool_calls[id[1]];
            if (!toolCall) {
                return null;
            }

            const toolName = toolCall.function.name;
            const item = new TreeItem(toolName, TreeItemCollapsibleState.None);
            item.image = "sidebar-tools";

            if (this.session.toolCallFails.has(toolCall.id)) {

                // If the tool has failed, show the reason

                const toolCallFail = this.session.toolCallFails.get(toolCall.id);
                item.descriptiveText = `[${toolCallFail.kind}]`;
                item.tooltip = `${toolCallFail.error}`;

            } else {

                // If the tool call has a "path" argument, include it

                try {
                    const args = JSON.parse(toolCall.function.arguments);
                    if (args.path) {
                        item.descriptiveText = args.path;
                    }
                } catch (error) {
                    // noop
                }
            }

            return item;
        }


        // Chat message line
        // element = <msgIndex>-<lineIndex>

        if (/\d+-\d+/.test(element)) {

            const id = element.split("-");

            const message = this.session.getMessage(id[0]);
            if (!message) {
                return null;
            }

            const line = message.getLine(id[1]);
            if (line === undefined) {
                return null;
            }

            const item = new TreeItem(line);

            if (line.startsWith("__code")) {
                const codeBlockIndex = line.replace(/__code (\d+)/, "$1");
                const codeBlock = message.codeBlocks[codeBlockIndex];
                item.name = "";
                item.collapsibleState = TreeItemCollapsibleState.Collapsed;
                item.descriptiveText = codeBlock.language;
                item.tooltip = codeBlock.code.join("\n");
                item.contextValue = "isCodeSnippet";
                item.image = "sidebar-code";
            } else {
                item.collapsibleState = TreeItemCollapsibleState.None;
                item.identifier = element;
                item.image = "sidebar-text";
            }

            return item;
        }


        // Chat message header (You, Assistant)
        // element = <msgIdx>

        if (/\d+/.test(element)) {

            const message = this.session.getMessage(element);
            if (!message) {
                return null;
            }

            const name = (message.role === "user") ? "You" : "Assistant";

            const item = new TreeItem(name, TreeItemCollapsibleState.Expanded);
            item.identifier = element;
            item.contextValue = (message.content !== null) ? "isMessage" : "";
            item.image = (message.role === "user") ? "sidebar-user" : "sidebar-assistant";

            return item;
        }


        // Pending response from assistant
        // element = __pending

        if (element === "__pending") {
            const item = new TreeItem("Assistant", TreeItemCollapsibleState.None);
            item.descriptiveText = "working …";
            item.identifier = "__pending";
            item.image = "sidebar-assistant";
            return item;
        }


        // None of the above
        return null;
    }


    //! Helper

    // eslint-disable-next-line no-unused-vars
    update(identifier) {
        if (this.treeView) {

            // TreeView.reload([element]) seems to be broken in Nova
            // so we unfortunately need to reload the whole tree

            this.treeView.reload();
        }
    }
}

module.exports = ChatDataProvider;