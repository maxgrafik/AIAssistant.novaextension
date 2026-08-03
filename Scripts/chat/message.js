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

        this.role = message.role;
        this.content = message.content || null;
        this.tool_calls = message.tool_calls || [];
        this.tool_call_id = message.tool_call_id || null;

        this.UIContent = [];

        if (this.role === "user" || this.role === "assistant") {
            this.UIContent = this.wrapContent();
        }

        if (this.role === "assistant" && message.tool_calls) {
            for (const toolCall of message.tool_calls) {
                this.UIContent.push(new UIToolCall(toolCall));
            }
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
                .replace(/^(#{1,6})\s+/gm, "▍")
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/__([^_]+)__/g, "$1")
                // .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (m, p1, p2) => `${p1}${p2}`)
                // .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, (m, p1, p2) => `${p1}${p2}`) // <- removes too much
                .replace(/\$([^$\n]+)\$/g, "⌈$1⌋") // <- Markdown Math Notation $...$
                .replace(/`([^`\n]+)`/g, "⌈$1⌋")
                .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")
                .replace(/^(\s*)\*\s/gm, "$1▪ ")
                .replace(/^(\s*)-\s/gm, "$1▪ ");
        }


        // Wrap text

        content.split(/\r?\n/).forEach(paragraph => {

            const paragraphText = paragraph.trim();

            if (!paragraphText) {
                return lines.push(new UITextLine(""));
            }

            const match = /~~CODEBLOCK~(\d+)~~/.exec(paragraphText);
            if (match) {
                return lines.push(codeBlocks[match[1]]);
            }

            const leading = paragraph.match(/^\s+/)?.[0] || "";
            const ordinal = paragraphText.match(/^\d+\.\s/) ? "    " : "";
            const bullet = paragraphText.startsWith("▪") ? "    " : "";

            let currentLine = leading;
            let currentLineLength = currentLine.length;

            const words = paragraphText.split(/\s+/);
            words.forEach(word => {

                const wordLength = word.length;
                const combinedLength = currentLineLength + wordLength;

                if (combinedLength <= this.config.chatWrapWidth) {
                    currentLine += word + " ";
                    currentLineLength = combinedLength + 1;
                } else {
                    lines.push(new UITextLine(currentLine.trimEnd()));
                    currentLine = leading + ordinal + bullet + word + " ";
                    currentLineLength = currentLine.length;
                }
            });

            lines.push(new UITextLine(currentLine));
        });

        return lines;
    }
}

module.exports = Message;