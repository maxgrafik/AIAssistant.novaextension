/**
 * message.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

const UITextLine = require("textline.js");
const UICodeBlock = require("codeblock.js");
const UIToolCall = require("toolcall.js");

class Message {

    constructor(config, message) {

        this.config = config;

        this.isPending = message.isPending !== undefined ? message.isPending : false;

        this.role = message.role;
        this.content = message.content || null;
        this.tool_calls = message.tool_calls || [];
        this.tool_call_id = message.tool_call_id || null;

        this.UIContent = [];


        // If this is a pending message (assistant only),
        // pre-fill with 50 empty lines so we can update
        // without flickering when streaming

        if (this.isPending) {
            for (let i = 0; i < 50; i++) {
                this.UIContent.push(new UITextLine(""));
            }
        }

        // If not pending, just wrap contents

        if (!this.isPending && (this.role === "user" || this.role === "assistant")) {
            this.UIContent = this.wrapContent();
        }

        // Add tool calls to UIContent

        if (this.role === "assistant" && this.tool_calls.length) {
            this.addToolCallsToUIContent();
        }
    }

    wrapContent() {

        if (!this.content) {
            return [];
        }

        const lines = [];
        const codeBlocks = [];

        // Extract fenced code blocks

        let content = this.content.replace(/```[\s\S]*?```/g, (match) => {
            codeBlocks.push(new UICodeBlock(match));
            return `~~CODEBLOCK~${codeBlocks.length-1}~~`;
        });


        // Remove Markdown syntax

        if (this.config.plainText) {
            content = content

                // # Headings
                .replace(/^(#{1,6})\s+/gm, "▍")

                // - Bullet points
                .replace(/^(\s*)\*\s/gm, "$1▪ ")
                .replace(/^(\s*)-\s/gm, "$1▪ ")

                // [Links](http://...)
                .replace(/\[[^\]]+\]\(([^\s)]+)\)/g, "➜ $1")

                // **Bold** | __Bold__
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/__([^_]+)__/g, "$1")

                // *Italic* | _Italic_
                .replace(/(^|\s)\*([^*\n]+)\*(?=\s)/g, (m, p1, p2) => `${p1}${p2}`)
                .replace(/(^|\s)_([^_\n]+)_(?=\s)/g, (m, p1, p2) => `${p1}${p2}`)

                // $Math$ Notation
                .replace(/\$([^$\n]+)\$/g, "⌈$1⌋")

                // `Code`
                .replace(/`([^`\n]+)`/g, "⌈$1⌋")

                // Escapes
                .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1");
        }


        // Wrap text

        const regexLeading = /^\s+/;
        const regexOrdinal = /^\d+\.\s/;
        const regexCodeBlock = /~~CODEBLOCK~(\d+)~~/;

        content.split(/\r?\n/).forEach(paragraph => {

            const paragraphText = paragraph.trim();

            if (!paragraphText) {
                return lines.push(new UITextLine(""));
            }

            const match = regexCodeBlock.exec(paragraphText);
            if (match) {
                return lines.push(codeBlocks[match[1]]);
            }

            const leading = regexLeading.exec(paragraph)?.[0] || "";
            const ordinal = regexOrdinal.exec(paragraphText) ? "    " : "";
            const bullet = paragraphText.startsWith("▪") ? "    " : "";
            const prefix = leading + ordinal + bullet;

            let currentLine = leading;
            let currentLineLength = currentLine.length;

            const words = paragraphText.split(/(?<!➜)\s+/); // spaces, except before url
            words.forEach(word => {

                const wordLength = word.length;
                const combinedLength = currentLineLength + wordLength;

                if (combinedLength <= this.config.chatWrapWidth) {
                    currentLine += word + " ";
                    currentLineLength = combinedLength + 1;
                } else {
                    lines.push(new UITextLine(currentLine.trimEnd()));
                    currentLine = prefix + word + " ";
                    currentLineLength = currentLine.length;
                }
            });

            lines.push(new UITextLine(currentLine));
        });

        return lines;
    }

    addToolCallsToUIContent() {
        for (const toolCall of this.tool_calls) {
            this.UIContent.push(new UIToolCall(toolCall));
        }
    }
}

module.exports = Message;