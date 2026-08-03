/**
 * codeblock.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class UICodeBlock {

    constructor(text) {

        const lines = text.split(/\r?\n/);

        if (lines.length) {
            this.language = lines[0].replace("```", "").trim();
            this.code = lines.slice(1, -1);
        } else {
            this.language = "[empty]";
            this.code = [];
        }
    }
}

module.exports = UICodeBlock;