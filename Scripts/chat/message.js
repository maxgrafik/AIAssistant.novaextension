/**
 * message.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class Message {

    constructor(config, message) {

        this.config = config;

        this.role = message.role;
        this.content = message.content || null;
        this.tool_calls = message.tool_calls || [];
        this.tool_call_id = message.tool_call_id || null;

        this.lines = [];
        this.codeBlocks = [];

        if (this.role === "user" || this.role === "assistant") {
            this.wrapContent(this.content);
        }
    }

    getLine(id) {
        try {
            return this.lines[id];
        } catch (error) {
            return null;
        }
    }

    getLineIDs() {
        return this.lines.map((_, i) => i);
    }

    wrapContent(content) {

        if (!content) {
            return;
        }

        // Extract fenced code blocks

        content = content.replace(/```[\s\S]*?```/g, (match) => {
            const lines = match.split("\n");
            const language = lines[0].replace("```", "").trim();
            const code = lines.slice(1, -1).join("\n").trim();
            this.codeBlocks.push({
                language: language,
                code: code.split("\n"),
            });
            return `~~CODEBLOCK~${this.codeBlocks.length-1}~~`;
        });


        // Remove Markdown syntax

        if (this.config.plainText) {
            content = content
                .replace(/^(#{1,6})\s+/gm, "▍")
                .replace(/\*\*([^*]+)\*\*/g, "$1")
                .replace(/__([^_]+)__/g, "$1")
                // .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, (m, p1, p2) => `${p1}${p2}`)
                // .replace(/(^|[^_])_([^_\n]+)_(?!_)/g, (m, p1, p2) => `${p1}${p2}`) // <- removes too much
                .replace(/`([^`\n]+)`/g, "⌈$1⌋")
                .replace(/\\([\\`*_{}[\]()#+\-.!])/g, "$1")
                .replace(/^(\s*)\*/gm, "$1•");
        }


        // Set "__code index" markers

        content = content.replace(/[ \t]*~~CODEBLOCK~(\d+)~~[ \t]*/g, (_, i) => `__code ${i}`);


        // Wrap text

        const paragraphs = content.trim().split("\n");
        for (const p of paragraphs) {

            if (p.length === 0) {
                this.lines.push("");
                continue;
            }

            let remaining = p;

            while (remaining.length > this.config.chatWrapWidth) {

                let breakAt = remaining.lastIndexOf(" ", this.config.chatWrapWidth);

                if (breakAt <= 0) {
                    breakAt = this.config.chatWrapWidth;
                }

                this.lines.push(remaining.substring(0, breakAt));

                remaining = remaining.substring(breakAt).trimStart();
            }

            if (remaining) {
                this.lines.push(remaining);
            }
        }
    }
}

module.exports = Message;