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


        //! Session

        this.session = session;


        //! Chat

        this.currentTurnIndex = null;
        this.showLastTurnOnly = this.config.showLastTurnOnly;

        this.updateItems = [];
        this.updateTimer = null;


        //! TreeView

        this.treeView = new TreeView("maxgrafik.AIAssistant.sidebar.chat", {
            dataProvider: this
        });
        nova.subscriptions.add(this.treeView);


        //! Events

        emitter.on("updateChatView", (message) => {
            if (this.showLastTurnOnly) {
                this.currentTurnIndex = null;
            }
            this.update(message);
        });

        emitter.on("updatePendingMessage", (chunk) => {

            const content = chunk.choices?.[0]?.delta?.content;
            if (!content) {
                return;
            }

            const pendingMessage = this.session.messages.findLast(msg => msg.isPending);
            if (!pendingMessage) {
                return;
            }

            if (pendingMessage.content === null) {
                pendingMessage.content = "";
            }

            pendingMessage.content += content;

            if (!this.config.showStream) {
                return;
            }

            const curLines = pendingMessage.UIContent;
            const newLines = pendingMessage.wrapContent();

            const curLength = curLines.length;
            const newLength = newLines.length;

            const startIndex = Math.min(newLength, curLength) - 1;

            for (let i = startIndex; i >= 0; i--) {

                const curLine = curLines[i];
                const newLine = newLines[i];
                const curLineType = curLine.constructor.name;
                const newLineType = newLine.constructor.name;

                if (
                    newLineType === "UITextLine" &&
                    newLine.text === curLine.text &&
                    newLine.text !== ""
                ) {
                    break;
                }

                if (
                    newLineType === "UITextLine" &&
                    newLine.text !== curLine.text
                ) {
                    curLine.text = newLine.text;
                    this.scheduleUpdate(curLine);
                    continue;
                }

                if (
                    newLineType === "UICodeBlock" &&
                    curLineType !== "UICodeBlock"
                ) {

                    // When replacing the current UITextLine with UICodeBlock
                    // we would need to update the entire message = flickering

                    // pendingMessage.UIContent[i] = newLine;
                    // for (let j = i+1; j < curLength; j++) {
                    //     curLines[j].text = "";
                    // }
                    // this.update(pendingMessage);
                    // return;


                    // This is faster and smoother, but the actual
                    // code is not available until streaming is done

                    curLine.text = `❯  [${newLine.language}]`;
                    this.scheduleUpdate(curLine);
                    break;
                }
            }

            for (let i = newLength; i < curLength; i++) {
                if (curLines[i]?.text !== "") {
                    curLines[i].text = "";
                    this.scheduleUpdate(curLines[i]);
                }
            }

            if (newLength > curLength) {
                const i = curLength - 1;
                curLines[i].text = "[Please wait ...]";
                this.scheduleUpdate(curLines[i]);
            }
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

        emitter.on("openURL", () => {
            this.openURL();
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

    openURL() {

        const selection = this.treeView.selection;
        if (selection.length === 0) {
            return;
        }

        const element = selection[0];
        const url = element.text.match(/➜\s([a-z]+:\/\/[^\s]+)/)?.[1];
        if (url) {
            nova.openURL(url);
        }
    }


    //! TreeDataProvider required methods

    getChildren(element) {

        if (element === null) {

            // Only user & assistant messages

            const messages = this.session.messages
                .filter(msg => msg.role === "user" || msg.role === "assistant");

            if (!this.showLastTurnOnly) {
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasPrevTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.hasNextTurn", false);
                nova.workspace.context.set("maxgrafik.AIAssistant.chat.isLastTurn", true);
                this.currentTurnIndex = null;
                return messages;
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

                return messages.slice(start, end);
            }
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
            item.name = element.role === "user" ? "You" : "Assistant";
            item.descriptiveText = element.isPending ? "working …" : "";
            item.contextValue = element.content !== null ? "isMessage" : "";
            item.image = element.role === "user" ? "sidebar-user" : "sidebar-assistant";
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
            item.contextValue = /➜\s[a-z]+:\/\/[^\s]+/.test(element.text) ? "isURL" : "";
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
        this.updateItems = [];
        this.updateTimer = null;
    }

    scheduleUpdate(element) {

        this.updateItems.push(element);

        if (this.updateTimer) {
            return;
        }

        this.updateTimer = setTimeout(() => {

            while (this.updateItems.length) {
                this.update(this.updateItems.shift());
            }

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