/**
 * sessionDataProvider.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class SessionDataProvider {

    constructor(config, emitter, session) {

        this.config = config;
        this.emitter = emitter;
        this.treeView = null;

        this.session = session;


        //! Events

        emitter.on("updateServer", (serverURL) => {
            this.session.updateServer(serverURL);
            this.update("server");
        });

        emitter.on("updateModel", (modelID) => {
            this.session.updateModel(modelID);
            this.update("model");
        });

        emitter.on("updateSessionInfoView", () => {
            this.update();
        });
    }


    //! TreeDataProvider required methods

    getChildren(element) {
        if (element === null) {
            const elements = ["server", "model"];
            if (this.session.promptTokens > 0) {
                elements.push("tokens");
            }
            return elements;
        } else {
            return [];
        }
    }

    getTreeItem(element) {

        let itemName = "";

        switch (element) {
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

        switch (element) {
        case "server":
            item.descriptiveText = this.session.serverURL || this.config.serverURL || "Not configured";
            item.identifier = element;
            item.command = "maxgrafik.AIAssistant.cmd.overrideServerURL";
            item.image = "sidebar-server";
            break;
        case "model":
            item.descriptiveText = this.session.modelID || "None (Double click to select)";
            item.identifier = element;
            item.command = "maxgrafik.AIAssistant.cmd.selectModel";
            item.image = "sidebar-model";
            break;
        case "tokens":
            item.descriptiveText = `${this.session.promptTokens.toLocaleString()} tokens`;
            item.identifier = element;
            item.image = "sidebar-tokens";
            break;
        }

        return item;
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

module.exports = SessionDataProvider;