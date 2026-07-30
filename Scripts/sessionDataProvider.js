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
            return [
                "server",
                "model",
            ];
        } else {
            return [];
        }
    }

    getTreeItem(element) {

        let itemName = ""

        switch (element) {
        case "server":
            itemName = "Server:"
            break;
        case "model":
            itemName = "Model:"
            break;
        }

        let item = new TreeItem(itemName, TreeItemCollapsibleState.None);

        switch (element) {
        case "server":
            item.descriptiveText = this.session.serverURL || this.config.serverURL || "Not configured"
            item.identifier = element;
            item.command = "maxgrafik.AIAssistant.cmd.overrideServerURL";
            item.image = "sidebar-server";
            break;
        case "model":
            item.descriptiveText = this.session.modelID || "None (Double click to select)"
            item.identifier = element;
            item.command = "maxgrafik.AIAssistant.cmd.selectModel";
            item.image = "sidebar-model";
            break;
        }

        return item;
    }


    //! Helper

    update(identifier) {
        if (this.treeView) {

            // TreeView.reload([element]) seems to be broken in Nova
            // so we unfortunately need to reload the whole tree

            this.treeView.reload();
        }
    }
}

module.exports = SessionDataProvider;