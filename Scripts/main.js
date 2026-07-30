/**
 * main.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const ChatDataProvider = require("chatDataProvider.js");
const SessionDataProvider = require("sessionDataProvider.js");
const APIHandler = require("apiHandler.js");
const Session = require("chat/session.js");

const config = {
    serverURL: "",
    APIKey: null,
    chatWrapWidth: 60,
    plainText: true,
    showLastTurnOnly: true,
    autoSave: false,
    autoLoad: false,
    systemPrompt: "",
    maxTokens: 2048,
    temperature: "0.2",
    topP: "0.9",
    allowToolUse: false,
    permissionListFiles: 0,
    permissionReadFiles: 0,
    permissionWriteFiles: 0,
    exclusionFileList: [],
    contextStrategy: 1,
    messageLimit: 20,
};

const emitter = new Emitter();
const session = new Session(config, emitter);


//! Activate

exports.activate = function() {

    nova.subscriptions.add(emitter);


    //! Get Config

    Object.keys(config).forEach(key => {

        // Get workspace config - if none is set, get current from global

        config[key] = nova.workspace.config.get("maxgrafik.AIAssistant.workspace."+key);
        if (config[key] === null || config[key] === undefined) {
            config[key] = nova.config.get("maxgrafik.AIAssistant.config."+key);
        }

        // Register listeners for config changes

        const cfgSub1 = nova.workspace.config.onDidChange("maxgrafik.AIAssistant.workspace."+key, updateConfigFromWorkspace, key);
        const cfgSub2 = nova.config.onDidChange("maxgrafik.AIAssistant.config."+key, updateConfigFromGlobal, key);

        nova.subscriptions.add(cfgSub1);
        nova.subscriptions.add(cfgSub2);
    });


    //! Create Chat TreeView

    const chatDataProvider = new ChatDataProvider(config, emitter, session);
    const chatTreeView = new TreeView("assistant-chat", {
        dataProvider: chatDataProvider
    });
    chatDataProvider.treeView = chatTreeView;

    nova.subscriptions.add(chatTreeView);


    //! Create Session Info TreeView

    const sessionDataProvider = new SessionDataProvider(config, emitter, session);
    const sessionTreeView = new TreeView("assistant-session", {
        dataProvider: sessionDataProvider
    });
    sessionDataProvider.treeView = sessionTreeView;

    nova.subscriptions.add(sessionTreeView);


    //! API Handler

    const apiHandler = new APIHandler(config, emitter, session);


    //! Session Info View Commands

    nova.commands.register("maxgrafik.AIAssistant.cmd.overrideServerURL", () => {
        nova.workspace.showInputPanel(
            "Enter URL to override server for this session",
            {value: session.serverURL || config.serverURL, placeholder: session.serverURL || config.serverURL},
            (serverURL) => {
                if (serverURL) {
                    emitter.emit("updateServer", serverURL);
                }
            }
        );
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.selectModel", () => {
        apiHandler.getModelList().then(models => {
            if (models && models.length > 0) {
                nova.workspace.showChoicePalette(
                    models,
                    {placeholder: "Select a model"},
                    (modelID) => {
                        if (modelID) {
                            emitter.emit("updateModel", modelID);
                        }
                    }
                );
            } else if (models && models.length === 0) {
                nova.workspace.showErrorMessage("The model list is empty");
            }
        });
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.openHelp", () => {
        nova.extension.openHelp();
    });


    //! Chat View Commands

    nova.commands.register("maxgrafik.AIAssistant.cmd.newChat", () => {

        const messageCount = session.messages.length;
        const hasUnsavedChanges = session.hasUnsavedChanges;

        // There will always be a message[0] (system prompt)

        if (messageCount > 1 && hasUnsavedChanges) {
            nova.workspace.showActionPanel(
                "Do you want to save the current chat first?",
                {buttons: ["Save Chat", "Cancel", "Don’t Save"]},
                (button) => {
                    if (button === 0) {
                        emitter.emit("saveChat", /* next event */ "newChat");
                    } else if (button === 1) {
                        // Cancel
                    } else if (button === 2) {
                        emitter.emit("newChat");
                    }
                }
            );
        } else {
            emitter.emit("newChat");
        }
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.clearChat", () => {

        const messageCount = session.messages.length;

        // There will always be a message[0] (system prompt)

        if (messageCount > 1) {
            nova.workspace.showActionPanel(
                "Are you sure you want to clear this chat?\nYou will lose all current context!",
                {buttons: ["Clear Chat", "Cancel"]},
                (button) => {
                    if (button === 0) {
                        emitter.emit("clearChat");
                    }
                }
            );
        } else {
            // emitter.emit("clearChat"); <- not needed, chat is already empty
        }
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.openChat", () => {

        const messageCount = session.messages.length;
        const hasUnsavedChanges = session.hasUnsavedChanges;

        // There will always be a message[0] (system prompt)

        if (messageCount > 1 && hasUnsavedChanges) {
            nova.workspace.showActionPanel(
                "Do you want to save the current chat first?",
                {buttons: ["Save Chat", "Cancel", "Don’t Save"]},
                (button) => {
                    if (button === 0) {
                        emitter.emit("saveChat", /* next event */ "openChat");
                    } else if (button === 1) {
                        // Cancel
                    } else if (button === 2) {
                        emitter.emit("openChat");
                    }
                }
            );
        } else {
            emitter.emit("openChat");
        }
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.saveChat", () => {

        const messageCount = session.messages.length;

        // There will always be a message[0] (system prompt)

        if (messageCount <= 1) {
            nova.workspace.showInformativeMessage("There’s nothing to save");
            return;
        }

        emitter.emit("saveChat", /* next event */ null);
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.exportMarkdown", () => {

        const messageCount = session.messages.length;

        // There will always be a message[0] (system prompt)

        if (messageCount <= 1) {
            nova.workspace.showInformativeMessage("There’s nothing to export");
            return;
        }

        emitter.emit("exportMarkdown");
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.toggleView", () => {
        config.showLastTurnOnly = !config.showLastTurnOnly;
        emitter.emit("toggleView");
    });


    //! Chat view context menu

    nova.commands.register("maxgrafik.AIAssistant.ctx.copyCode", () => {
        emitter.emit("copyCode", chatTreeView.selection);
    });

    nova.commands.register("maxgrafik.AIAssistant.ctx.copyMessage", () => {
        emitter.emit("copyMessage", chatTreeView.selection);
    });


    //! Editor Commands

    nova.commands.register("maxgrafik.AIAssistant.cmd.askAssistant", () => {

        // First check, if a model is selected!
        // It's annoying to lose your well-formed prompt,
        // just because you forgot to select a model first
        //
        // Not that this ever happened to me :P

        if (!session.modelID) {
            nova.workspace.showErrorMessage("Select a model first");
            return;
        }

        // Make sure we have a system promt
        // ... because there will always be ...

        if (session.messages.length === 0) {

            // Don't use emitter.emit("newChat") here!
            // We don't know when the event will fire

            session.newChat();
        }

        nova.workspace.showInputPalette(
            "",
            {placeholder: "Ask Assistant"},
            (prompt) => {
                if (prompt) {
                    apiHandler.sendMessage(prompt);
                }
            }
        );
    });

    nova.commands.register("maxgrafik.AIAssistant.cmd.askAssistantWithSelection", (editor) => {

        if (!session.modelID) {
            nova.workspace.showErrorMessage("Select a model first");
            return;
        }

        if (session.messages.length === 0) {
            session.newChat();
        }

        nova.workspace.showInputPalette(
            "",
            {placeholder: "Ask Assistant"},
            (prompt) => {
                if (prompt) {

                    const language = editor.document.syntax || "text";
                    const selection = editor.selectedText
                        .split(editor.document.eol)
                        .join("\n");

                    let promptWithSelection = "";
                    promptWithSelection += prompt + "\n\n";
                    promptWithSelection += "```" + language + "\n";
                    promptWithSelection += selection + "\n";
                    promptWithSelection += "```";

                    apiHandler.sendMessage(promptWithSelection);
                }
            }
        );
    });


    // Load autosave file

    if (config.autoLoad) {

        const workspacePath = nova.workspace.path;
        if (!workspacePath) {
            return; // No workspace
        }

        const autoSaveFile = nova.path.join(workspacePath, ".assistant", "autosave.json");
        if (nova.fs.access(autoSaveFile, nova.fs.F_OK + nova.fs.R_OK)) {
            session.open(autoSaveFile);
        }
    }
};


//! Deactivate

exports.deactivate = function() {
    //
};


//! Helper

function updateConfigFromWorkspace(newVal) {

    const key = this.trim(); // Yup! "this" should be the key, but here it's not what we put in

    if (newVal === null) {
        config[key] = nova.config.get("maxgrafik.AIAssistant.config."+key);
    } else {
        config[key] = newVal;
    }

    signalConfigChanges(key);
}

function updateConfigFromGlobal(newVal) {

    const key = this.trim();

    const workspaceConfig = nova.workspace.config.get("maxgrafik.AIAssistant.workspace."+key);
    if (workspaceConfig === null || workspaceConfig === undefined) {
        config[key] = newVal;
    }

    signalConfigChanges(key);
}

function signalConfigChanges(key) {

    // Emit events for config changes which should update the UI

    switch (key) {
    case "serverURL":

        // Updates sessionTreeView
        emitter.emit("updateServer", config[key]);
        break;

    case "chatWrapWidth":
    case "plainText":

        // Re-wrap all messages
        emitter.emit("rewrapMessages", config[key]);
        break;

    case "showLastTurnOnly":

        // Updates chatTreeView
        emitter.emit("toggleView");
        break;

    default:
        break;
    }
}