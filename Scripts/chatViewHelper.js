/**
 * chatViewHelper.js
 * AI Assistant
 *
 * @copyright 2026 Hendrik Meinl
 */

exports.expandChatView = function() {

    let osascript = "";
    osascript += "tell application \"System Events\"\n";
    osascript += "tell process \"Nova\"\n";
    osascript += "set mainSplitGroup to first UI element of window 1 whose role is \"AXSplitGroup\"\n";
    osascript += "set allSideBars to every UI element of mainSplitGroup whose role is \"AXGroup\"\n";
    osascript += "repeat with sideBar in allSideBars\n";
    osascript += "try\n";
    osascript += "set sidebarMainSplitGroup to (first UI element of sideBar whose role is \"AXSplitGroup\")\n";
    osascript += "set firstSplitGroup to (first UI element of sidebarMainSplitGroup whose role is \"AXSplitGroup\")\n";
    osascript += "set chatHeader to (first UI element of firstSplitGroup whose name is \"Chat\")\n";
    osascript += "if chatHeader is not missing value then\n";
    osascript += "set theSplitter to (first UI element of firstSplitGroup whose role is \"AXSplitter\")\n";
    osascript += "set maxValue to maximum value of theSplitter\n";
    osascript += "set value of theSplitter to maxValue\n";
    osascript += "return\n";
    osascript += "end if\n";
    osascript += "end try\n";
    osascript += "end repeat\n";
    osascript += "end tell\n";
    osascript += "end tell";

    const options = {
        args: ["-e", osascript]
    };

    const process = new Process("/usr/bin/osascript", options);

    process.start();
};
