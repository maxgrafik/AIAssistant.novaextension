/**
 * chatDataProvider.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Message = require("chat/message.js");

class ChatDataProvider {

    constructor(config, emitter, session) {

        this.config = config;
        this.emitter = emitter;


        //! Session

        this.session = session;


        //! Chat

        this.currentTurnIndex = null;
        this.showLastTurnOnly = this.config.showLastTurnOnly;

        this.intermediateMessage = null;
        this.updateTimer = null;


        //! TreeView

        this.treeView = new TreeView("maxgrafik.AIAssistant.sidebar.chat", {
            dataProvider: this
        });
        nova.subscriptions.add(this.treeView);


        //! Events

        emitter.on("addIntermediateMessage", () => {

            this.intermediateMessage = new Message(
                this.config,
                { role: "IntermediateMessage", content: " " }
            );

            if (this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }

            this.update();
        });

        emitter.on("removeIntermediateMessage", () => {

            this.intermediateMessage = null;

            if (this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }

            this.update();
        });

        emitter.on("updateIntermediateMessage", (chunk) => {

            const content = chunk.choices?.[0]?.delta?.content;
            if (!content) {
                return;
            }

            this.intermediateMessage.content += content;

            if (!this.config.showStream) {
                return;
            }


            const newLines = this.intermediateMessage.wrapContent();
            const currentLines = this.intermediateMessage.UIContent;
            const i = currentLines.length - 1;


            // Quick reject

            if (newLines.length === 0) {
                return;
            }


            // Only the last line changed

            if (newLines.length === currentLines.length) {
                const newLine = newLines[i];
                const curLine = currentLines[i];
                if (newLine?.text !== undefined && newLine.text !== curLine.text) {
                    curLine.text = newLine.text;
                    this.scheduleUpdate(curLine);
                }
                return;
            }


            // Find the first point of divergence

            const searchEnd = Math.min(i, newLines.length - 1);

            let diffIndex = -1;
            for (let j = searchEnd; j >= 0; j--) {
                if (currentLines[j].text !== newLines[j].text) {
                    diffIndex = j;
                    break;
                }
            }

            if (diffIndex === -1) {
                diffIndex = searchEnd + 1;
            }

            currentLines.splice(diffIndex, currentLines.length - diffIndex,...newLines.slice(diffIndex));

            this.scheduleUpdate(this.intermediateMessage);
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

        emitter.on("showPrevTurn", () => {
            this.currentTurnIndex -= 1;
            this.update();
        });

        emitter.on("showLastTurn", () => {
            this.currentTurnIndex = null;
            this.update();
        });

        emitter.on("newChat", () => {
            this.session.newChat();
            this.reset();
            this.update();
        });

        emitter.on("openChat", () => {
            this.session.openChat().then((userCancelled) => {
                if (!userCancelled) {
                    this.reset();
                    this.update();
                }
            });
        });

        emitter.on("clearChat", () => {
            this.session.clearChat();
            this.reset();
            this.update();
        });

        emitter.on("saveChat", (nextEvent) => {
            this.session.saveChat(/* isAutoSave */ false).then((userCancelled) => {
                if (userCancelled) {
                    return;
                }
                if (nextEvent === "newChat") {
                    this.session.newChat();
                    this.reset();
                    this.update();
                } else if (nextEvent === "openChat") {
                    this.session.openChat().then((userCancelled) => {
                        if (!userCancelled) {
                            this.reset();
                            this.update();
                        }
                    });
                }
            });
        });

        emitter.on("exportMarkdown", () => {
            this.session.exportMarkdown();
        });

        emitter.on("copyCode", () => {
            this.copyCode();
        });

        emitter.on("copyMessage", () => {
            this.copyMessage();
        });

        emitter.on("rewrapMessages", () => {
            for (const message of this.session.messages) {
                if (message.role === "user" || message.role === "assistant") {
                    message.UIContent = message.wrapContent();
                }
            }
            this.reset();
            this.update();
        });
    }

    copyCode() {

        const selection = this.treeView.selection;
        if (selection.length === 0) {
            return;
        }

        const element = selection[0];
        const elementType = element.constructor.name;
        if (elementType === "UICodeBlock") {
            nova.clipboard.writeText(element.code.join("\n"));
        }
    }

    copyMessage() {

        const selection = this.treeView.selection;
        if (selection.length === 0) {
            return;
        }

        const element = selection[0];
        const elementType = element.constructor.name;
        if (elementType === "Message") {
            nova.clipboard.writeText(element.content);
        }
    }


    //! TreeDataProvider required methods

    getChildren(element) {

        if (element === null) {

            // Only user & assistant messages

            const messages = this.session.messages
                .filter(msg => msg.role === "user" || msg.role === "assistant");

            let children = [];

            if (!this.showLastTurnOnly) {
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPrevTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                this.currentTurnIndex = null;
                children = [...messages];
            } else {

                const turnIndices = messages
                    .map((msg, i) => msg.role === "user" ? i : null)
                    .filter(msg => msg !== null);

                if (this.currentTurnIndex === null) {
                    this.currentTurnIndex = turnIndices.length - 1;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                }

                if (this.currentTurnIndex >= turnIndices.length - 1) {
                    this.currentTurnIndex = turnIndices.length - 1;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                } else if (this.currentTurnIndex < turnIndices.length - 1) {
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", true);
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", false);
                }

                if (this.currentTurnIndex <= 0) {
                    this.currentTurnIndex = 0;
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPrevTurn", false);
                } else if (this.currentTurnIndex > 0) {
                    nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPrevTurn", true);
                }

                // We set currentTurnIndex above, so it is a valid index here

                const start = turnIndices[this.currentTurnIndex];
                const end = turnIndices[this.currentTurnIndex+1] || messages.length;

                children = [...messages.slice(start, end)];
            }

            if (this.intermediateMessage !== null) {
                children.push(this.intermediateMessage);
            }

            return children;
        }


        const elementType = element.constructor.name;

        if (elementType === "Message") {
            return element.UIContent;
        }

        if (elementType === "UICodeBlock") {
            return element.code;
        }

        if (elementType === "UIToolCall") {
            return []; // <- Tool calls have no children
        }


        // None of the above
        return [];
    }

    getTreeItem(element) {

        const elementType = element.constructor.name;

        if (elementType === "Message") {
            const item = new TreeItem("", TreeItemCollapsibleState.Expanded);
            item.name = (element.role === "user") ? "You" : "Assistant";
            item.contextValue = (element.content !== null) ? "isMessage" : "";
            item.image = (element.role === "user") ? "sidebar-user" : "sidebar-assistant";

            if (element.role === "IntermediateMessage") {
                item.descriptiveText = "working …";
            }
            return item;
        }

        if (elementType === "UICodeBlock") {
            const item = new TreeItem("", TreeItemCollapsibleState.Collapsed);
            item.descriptiveText = element.language;
            item.tooltip = element.code.join("\n");
            item.contextValue = "isCodeSnippet";
            item.image = "sidebar-code";
            return item;
        }

        if (elementType === "UIToolCall") {
            const item = new TreeItem(element.name, TreeItemCollapsibleState.None);
            item.image = "sidebar-tools";

            if (!element.ok) {

                // If the tool has failed, show the reason

                item.descriptiveText = `[${element.kind}]`;
                item.tooltip = element.error;

            } else {

                // If the tool call has a "path" argument, include it

                item.descriptiveText = element.args?.path || "";
            }
            return item;
        }

        if (elementType === "UITextLine") {
            const item = new TreeItem(element.text, TreeItemCollapsibleState.None);
            item.image = "sidebar-text";
            return item;
        }

        if (elementType === "String") {
            const item = new TreeItem(element, TreeItemCollapsibleState.None);
            item.image = "sidebar-codeline";
            return item;
        }


        // None of the above
        return null;
    }


    //! Helper

    reset() {
        this.currentTurnIndex = null;
        this.showLastTurnOnly = this.config.showLastTurnOnly;
        this.intermediateMessage = null;
        this.updateTimer = null;
    }

    scheduleUpdate(element) {

        if (this.updateTimer) {
            return;
        }

        this.updateTimer = setTimeout(() => {

            this.update(element);
            this.updateTimer = null;

        }, 60);
    }

    update(element) {
        if (this.treeView) {
            this.treeView.reload(element);
        }
    }
}

module.exports = ChatDataProvider;