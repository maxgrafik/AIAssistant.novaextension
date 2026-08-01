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

    checkArguments(schema, args) {
        this.validate(schema.function.parameters, args);
    }

    validate(schema, value, path = "") {

        if (!schema) {
            throw new ToolError("execution_error", `Schema missing at ${path || "(root)"}`);
        }

        const requiredType = schema.type;

        // Object

        if (requiredType === "object") {

            if (typeof value !== "object" || Array.isArray(value) || value === null) {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "object"`);
            }

            const properties = schema.properties || {};
            const required = schema.required || [];

            // Check required fields

            for (const key of required) {
                if (!Object.hasOwn(value, key)) {
                    throw new ToolError("invalid_args", `Required argument "${key}" missing at ${path || "(root)"}`);
                }
                if (properties[key]) {
                    this.validate(properties[key], value[key], path ? `${path}.${key}` : `${key}`);
                } else {
                    throw new ToolError("execution_error", `No schema for required argument "${key}"`);
                }
            }

            // Optionally: Enforce "additionalProperties: false"

            // if (schema.additionalProperties === false) {
            //     for (const key of Object.keys(value)) {
            //         if (!properties[key]) {
            //             throw new ToolError("invalid_args", `Unexpected argument "${key}" at ${path || "(root)"}`);
            //         }
            //     }
            // }

            return;
        }

        // Array

        if (requiredType === "array") {

            if (!Array.isArray(value)) {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "array"`);
            }

            if (typeof schema.minItems === "number" && value.length < schema.minItems) {
                throw new ToolError("invalid_args", `Array "${path}" must have at least ${schema.minItems} items`);
            }

            if (schema.items) {
                for (const [i, item] of value.entries()) {
                    this.validate(schema.items, item, `${path}[${i}]`);
                }
            } else {
                throw new ToolError("execution_error", `"items" schema missing for "${path}"`);
            }
            return;
        }

        // Primitives

        if (requiredType === "string") {
            if (typeof value !== "string") {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "string"`);
            }
            return;
        }

        if (requiredType === "boolean") {
            if (typeof value !== "boolean") {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "boolean"`);
            }
            return;
        }

        if (requiredType === "integer") {
            if (!Number.isInteger(value)) {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "integer"`);
            }
            return;
        }

        if (requiredType === "number") {
            if (typeof value !== "number" || Number.isNaN(value)) {
                throw new ToolError("invalid_args", `Argument "${path}" must be of type "number"`);
            }
            return;
        }

        throw new ToolError("execution_error", `Unsupported schema type "${requiredType}"`);
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

        // Clean path
        // Can we really rely on "nova.path.normalize" being flawless?

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

        const cleanPath = nova.path.join(...cleanSegments);

        // Prevent escaping the workspace

        if (!cleanPath.startsWith(workspacePath)) {
            throw new ToolError("rejected", "Security Violation: Attempted to escape workspace");
        }

        return cleanPath;
    }
}

module.exports = Tool;