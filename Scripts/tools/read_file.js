/**
 * read_file.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Tool = require("../tool.js");
const ToolError = require("../toolError.js");

class ReadFileTool extends Tool {

    constructor(config) {

        super();

        this.config = config;

        this.name = "read_file";
        this.schema = {
            type: "function",
            function: {
                name: "read_file",
                description: "Reads a file from the workspace and returns its full text content as a string. For analyzing, debugging or refactoring code.",
                parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        path: {
                            type: "string",
                            description: "Relative file path within the user's allowed workspace scope."
                        }
                    },
                    required: ["path"]
                }
            }
        };
    }

    async do(toolCall) {

        // 1. Check permission

        if (!this.config.allowToolUse || this.config.permissionReadFiles === 0) {
            throw new ToolError("rejected", "The use of `read_file` is blocked by configured policy");
        }

        // 2. Parse arguments

        let args = null;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (error) {
            throw new ToolError("execution_error", `Parsing arguments failed with error "${error.message}"`);
        }

        // 3. Ask, if required

        if (this.config.permissionReadFiles === 1) {
            const permission = await this.getPermission(`The assistant wants to read the following file:\n${args.path}`);
            if (!permission) {
                throw new ToolError("user_denied", "The user denied permission for using `read_file`");
            }
        }

        // 4. Check arguments

        const check = this.checkArguments(args, ["path"]);
        if (!check) {
            throw new ToolError("invalid_args", "Required argument missing for `read_file`");
        }

        // 5. Sanitize path and run some checks

        const sanitizedPath = this.sanitizePathAndCheck(args.path);

        // Check if it exists in workspace

        if (!nova.workspace.contains(sanitizedPath)) {
            throw new ToolError("execution_error", "The file does not exist in the user's current workspace");
        }

        // Check if it's a file

        const fileStats = nova.fs.stat(sanitizedPath);
        if (!fileStats.isFile()) {
            throw new ToolError("execution_error", "The provided `path` does not point to a file");
        }

        // Check if the file is readable

        if (!nova.fs.access(sanitizedPath, nova.fs.F_OK + nova.fs.R_OK)) {
            throw new ToolError("execution_error", "The file does not exist or can not be read");
        }

        // Limit file size to 500 KB (recommended by GPT-5.4 nano)

        if (fileStats.size > 500 * 1024) {
            throw new ToolError("rejected", "File too large to read. Max allowed is 500 KB. Please request specific functions/classes (code blocks) to proceed.");
        }


        // 6. Finally do, what this tool is supposed to do: read a file

        try {

            const fileObj = nova.fs.open(sanitizedPath, "r");
            const content = fileObj.read();
            fileObj.close();

            // Success Envelope

            const successEnvelope = {
                id: toolCall.id,
                content: {
                    ok: true,
                    tool: "read_file",
                    text: content,
                }
            };

            return successEnvelope;

        } catch (error) {
            throw new ToolError("execution_error", `Reading file failed with error "${error.message}"`);
        }
    }
}

module.exports = ReadFileTool;