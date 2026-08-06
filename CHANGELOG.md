## Version 0.5.0

Added basic - I mean ***very basic*** - MCP support. Don't expect too much.


## Version 0.4.1

Minor performance tweaks


## Version 0.4.0

- Refactored code for `chatDataProvider`/`sessionDataProvider`
- It’s now possible to stream assistant responses in the chat view (can be configured). Experimental, because this has issues with flickering and scrolling. It’s the best I can do, given the limitations of Nova’s sidebar
- Improved plain text conversion and readability
- Improved code block readability
- **Breaking change:** I’ve updated some internal IDs, so you may need to add **AI Assistant** to your sidebar again. Sorry for that ...


## Version 0.3.0

Added `Show Previous`/`Show Next`/`Show Last` to chat view context menu


## Version 0.2.1

- Improved `parseToolCalls` logic in `apiHandler.js`
- Improved tool logic and argument validation


## Version 0.2.0

Added Token Tracking (if server provides usage data)


## Version 0.1.0

Initial release