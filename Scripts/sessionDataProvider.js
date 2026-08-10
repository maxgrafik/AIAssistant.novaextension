/**
 * sessionDataProvider.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const UISessionInfo = require("chat/sessioninfo.js");

class SessionDataProvider {

    constructor(config, emitter, session) {

        this.config = config;
        this.emitter = emitter;


        //! Session

        this.session = session;


        //! Info

        this.serverInfo = new UISessionInfo("server", this.config.serverURL);
        this.modelInfo = new UISessionInfo("model", null);
        this.tokenInfo = new UISessionInfo("tokens", 0);


        //! TreeView

        this.treeView = new TreeView("maxgrafik.AIAssistant.sidebar.session", {
            dataProvider: this
        });
        nova.subscriptions.add(this.treeView);


        //! Events

        emitter.on("updateServer", (serverURL) => {
            this.session.updateServer(serverURL);
            this.serverInfo.value = this.session.serverURL || this.config.serverURL;
            this.update(this.serverInfo);
        });

        emitter.on("updateModel", (modelID) => {
            this.session.updateModel(modelID);
            this.modelInfo.value = this.session.modelID;
            this.update(this.modelInfo);
        });

        emitter.on("updateTokens", (tokens) => {
            this.session.updateTokens(tokens);
            this.tokenInfo.value = this.session.promptTokens + this.session.completionTokens;
            this.update(this.tokenInfo);
        });

        emitter.on("updateSessionInfoView", () => {
            this.serverInfo.value = this.session.serverURL || this.config.serverURL;
            this.modelInfo.value = this.session.modelID;
            this.tokenInfo.value = this.session.promptTokens;
            this.update();
        });
    }


    //! TreeDataProvider required methods

    getChildren(element) {
        if (element === null) {
            return [
                this.serverInfo,
                this.modelInfo,
                this.tokenInfo
            ];
        } else {
            return [];
        }
    }

    getTreeItem(element) {

        let itemName = "";

        switch (element.identifier) {
        case "server":
            itemName = "Server:";
            break;
        case "model":
            itemName = "Model:";
            break;
        case "tokens":
            itemName = "Usage:";
            break;
        }

        const item = new TreeItem(itemName, TreeItemCollapsibleState.None);

        switch (element.identifier) {
        case "server":
            item.descriptiveText = element.value || "Not configured";
            item.command = "maxgrafik.AIAssistant.cmd.overrideServerURL";
            item.image = "sidebar-server";
            break;
        case "model":
            item.descriptiveText = element.value || "None (Double click to select)";
            item.command = "maxgrafik.AIAssistant.cmd.selectModel";
            item.image = "sidebar-model";
            break;
        case "tokens":
            item.descriptiveText = element.value ? `${element.value.toLocaleString()} tokens` : "No data available";
            item.image = "sidebar-tokens";
            break;
        }

        return item;
    }


    //! Helper

    update(element) {
        if (this.treeView) {
            this.treeView.reload(element);
        }
    }
}

module.exports = SessionDataProvider;