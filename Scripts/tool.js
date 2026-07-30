/**
 * tool.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const ToolError = require("toolError.js");

class Tool {

    constructor() {}


    //! Utilities

    getPermission(message) {
        return new Promise(resolve => {
            nova.workspace.showActionPanel(
                message,
                {buttons: ["Deny", "Allow"]},
                (button) => {
                    resolve(button === 1);
                }
            );
        });
    }

    checkArguments(provided, required) {

        // Make sure at least the required arguments are present
        // The LLM might add additional ones, so we're not too strict here

        return required.every(key => Object.hasOwn(provided, key));
    }

    sanitizePathAndCheck(path) {

        // Check if the path is absolute

        if (nova.path.isAbsolute(path)) {
            throw new ToolError("rejected", "Using absolute paths is not allowed by configured policy");
        }

        // Get workspace path

        const workspacePath = nova.workspace.path;
        if (!workspacePath) {
            throw new ToolError("execution_error", "The user has no workspace configured");
        }

        // Join workspace path with provided path

        const fullPath = nova.path.join(workspacePath, path);

        // Canonicalize

        const canonicalPath = nova.path.normalize(fullPath);

        // Prevent escaping the workspace

        if (!canonicalPath.startsWith(workspacePath)) {
            throw new ToolError("rejected", "Security Violation: Attempted to escape workspace");
        }

        // Clean path

        const segments = nova.path.split(canonicalPath);
        const cleanSegments = [];

        for (const segment of segments) {
            if (segment === "." || segment === "") {
                continue;
            } else if (segment === "..") {
                cleanSegments.pop();
            } else {
                cleanSegments.push(segment);
            }
        }

        // Note to self
        // cleanSegments contains "/" for root as first element

        return nova.path.join(...cleanSegments);
    }
}

module.exports = Tool;