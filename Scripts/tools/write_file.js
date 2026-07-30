/**
 * write_file.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const Tool = require("../tool.js");
const ToolError = require("../toolError.js");

class WriteFileTool extends Tool {

    constructor(config) {

        super();

        this.config = config;

        this.name = "write_file";
        this.schema = {
            type: "function",
            function: {
                name: "write_file",
                description: "Overwrites a file with the provided text content. The tool should create the file if it does not exist.",
                parameters: {
                    type: "object",
                    additionalProperties: false,
                    properties: {
                        path: {
                            type: "string",
                            description: "Relative file path within the user's allowed workspace scope."
                        },
                        content: {
                            type: "string",
                            description: "New full file content to write."
                        }
                    },
                    required: ["path", "content"]
                }
            }
        };
    }

    async do(toolCall) {

        // 1. Check permission

        if (!this.config.allowToolUse || this.config.permissionWriteFiles === 0) {
            throw new ToolError("rejected", "The use of `write_file` is blocked by configured policy");
        }

        // 2. Parse arguments

        let args = null;
        try {
            args = JSON.parse(toolCall.function.arguments);
        } catch (error) {
            throw new ToolError("execution_error", `Parsing arguments failed with error "${error.message}"`);
        }

        // 3. Ask, if required

        if (this.config.permissionWriteFiles === 1) {
            const permission = await this.getPermission(`The assistant wants to write to the following file:\n${args.path}`);
            if (!permission) {
                throw new ToolError("user_denied", "The user denied permission for using `write_file`");
            }
        }

        // 4. Check arguments

        const check = this.checkArguments(args, ["path", "content"]);
        if (!check) {
            throw new ToolError("invalid_args", "Required argument missing for `write_file`");
        }

        // 5. Sanitize path and run some checks

        const sanitizedPath = this.sanitizePathAndCheck(args.path);

        // 6. Check if sanitizedPath points to a folder, which wouldn't make sense

        const fileStats = nova.fs.stat(sanitizedPath);
        if (fileStats?.isDirectory()) {
            throw new ToolError("rejected", "The provided `path` points to a folder");
        }

        // 7. Review, if allowed but is overwrite
        // We may additionally implement an undo mechanism some time

        if (this.config.permissionWriteFiles === 2 && fileStats?.isFile()) {
            const permission = await this.getPermission(`The assistant wants to overwrite the following file:\n${args.path}`);
            if (!permission) {
                throw new ToolError("user_denied", "The user denied permission to overwrite the file");
            }
        }

        // 8. Finally do, what this tool is supposed to do: write a file

        try {

            // Note to self
            // Don't try to write a file to the extension bundle
            // while the project itself is activated as extension.
            // This will cause Nova to reset the extension immediately.
            // Silently! No warning, no error, no trace!
            // Took me days to track this "error" :P


            // Write to temporary file first

            const tempdir = nova.fs.tempdir;
            const tempName = nova.crypto.randomUUID();
            const tempPath = nova.path.join(tempdir, tempName);

            const fileObj  = nova.fs.open(tempPath, "w");
            fileObj.write(args.content);
            fileObj.close();

            // Check if a file with this name already exists and rename it

            let oldFile = null;
            if (nova.fs.access(sanitizedPath, nova.fs.F_OK)) {
                const dir = nova.path.dirname(sanitizedPath);
                const name = nova.crypto.randomUUID();
                oldFile = nova.path.join(dir, name);
                nova.fs.move(sanitizedPath, oldFile);
            }

            // Move temporary file to destination

            nova.fs.move(tempPath, sanitizedPath);

            // Delete old file (if any)
            // ... or maybe move to ".assistant/undo/" instead?

            if (oldFile) {
                nova.fs.remove(oldFile);
            }

            // Success Envelope

            const fileStats = nova.fs.stat(sanitizedPath);
            const successEnvelope = {
                id: toolCall.id,
                content: {
                    ok: true,
                    tool: "write_file",
                    result: {
                        path: nova.workspace.relativizePath(sanitizedPath),
                        size: fileStats.size,
                    },
                },
            };

            return successEnvelope;

        } catch (error) {
            throw new ToolError("execution_error", `Writing to file failed with error "${error.message}"`);
        }
    }
}

module.exports = WriteFileTool;