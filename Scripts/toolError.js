/**
 * toolError.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class ToolError extends Error {

    constructor(kind, message, options) {

        super(message, options);

        this.name = "ToolError";
        this.kind = kind;
        this.message = message;
    }
}

module.exports = ToolError;