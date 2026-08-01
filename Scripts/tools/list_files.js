/**
 * list_files.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Tool = require("../tool.js");
const ToolError = require("../toolError.js");

class ListFilesTool extends Tool {

    constructor(config) {

        super();

        this.config = config;

        this.name = "list_files";
        this.schema = {
            type: "function",
            function: {
                name: "list_files",
                description: "Lists the immediate children of a directory.",
                parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        path: {
                            type: "string",
                            description: "Relative directory path to list (e.g., 'src', 'test', '.' for the project root). Must be within the user's allowed workspace scope."
                        },
                        includeSubdirectories: {
                            type: "boolean",
                            description: "Whether to include subdirectories in the output.",
                            default: false
                        }
                    },
                    required: ["path", "includeSubdirectories"]
                }
            }
        };
    }

    async do(toolCall) {

        // 1. Check permission

        if (!this.config.allowToolUse || this.config.permissionListFiles === 0) {
            throw new ToolError("rejected", 'The use of "list_files" is blocked by configured policy');
        }

        // 2. Parse arguments

        let args = null;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (error) {
            throw new ToolError("execution_error", `Parsing arguments failed with error "${error.message}"`);
        }

        // 3. Ask, if required

        if (this.config.permissionListFiles === 1) {
            const permission = await this.getPermission(`The assistant wants to see the contents of the following folder:\n${args.path}`);
            if (!permission) {
                throw new ToolError("user_denied", `The user did not give permission to list the contents of "${args.path}"`);
            }
        }

        // 4. Check arguments

        this.checkArguments(this.schema, args);

        // 5. Sanitize path and run some checks

        const sanitizedPath = this.sanitizePathAndCheck(args.path);

        // Check if it exists in workspace

        if (!nova.workspace.contains(sanitizedPath)) {
            throw new ToolError("rejected", "The directory does not exist in the user's current workspace");
        }

        // Check if it's a directory

        const fileStats = nova.fs.stat(sanitizedPath);
        if (!fileStats.isDirectory()) {
            throw new ToolError("rejected", 'The provided "path" is not a directory');
        }

        // 6. Finally do, what this tool is supposed to do: list files in the directory

        try {

            const fileList = this.scanDirectory(sanitizedPath, args.includeSubdirectories);

            // Success Envelope

            const successEnvelope = {
                id: toolCall.id,
                content: {
                    ok: true,
                    tool: "list_files",
                    result: fileList,
                },
            };

            return successEnvelope;

        } catch (error) {
            throw new ToolError("execution_error", `Tool failed with error "${error.message}"`);
        }
    }


    //! Helper

    scanDirectory(currentPath, recursive = false, depth = 0) {

        const paths = [];

        // Don't go too deep

        if (depth > 4) {
            return paths;
        }

        // Get items from currentPath

        const items = nova.fs.listdir(currentPath);
        for (const item of items) {

            // Skip hidden files and folders

            if (item.startsWith(".")) {
                continue;
            }

            // Get absolute & relative file path

            const absolutePath = nova.path.join(currentPath, item);
            const relativePath = nova.workspace.relativizePath(absolutePath);

            // Exclude configured paths

            if (this.config.exclusionFileList.includes(relativePath)) {
                continue;
            }

            try {

                const fileStats = nova.fs.stat(absolutePath);

                if (fileStats.isDirectory()) {

                    paths.push({
                        path: relativePath,
                        type: "dir"
                    });

                    if (recursive) {
                        paths.push(...this.scanDirectory(absolutePath, recursive, depth + 1));
                    }

                } else if (fileStats.isFile()) {

                    paths.push({
                        path: relativePath,
                        type: "file"
                    });
                }
            } catch (error) {
                // Ignore files that can't be accessed
            }
        }

        return paths;
    }
}

module.exports = ListFilesTool;