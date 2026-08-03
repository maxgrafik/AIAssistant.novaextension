/**
 * toolcall.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

class UIToolCall {

    constructor(content) {

        this.id = content.id;
        this.name = content.function.name;

        this.ok = true;
        this.kind = null;
        this.error = null;

        try {
            this.args = JSON.parse(content.function.arguments);
        } catch (error) {
            this.args = null;
        }
    }

    setFailed(toolResponse) {
        try {
            const content = JSON.parse(toolResponse);
            if (!content.ok){
                this.ok = false;
                this.kind = content.kind;
                this.error = content.error;
            }
        } catch (error) {
            // noop
        }
    }
}

module.exports = UIToolCall;