<img src="https://raw.githubusercontent.com/tprouvot/Salesforce-Inspector-reloaded/main/addon/icon128.png" align="right">

# Salesforce Inspector Reloaded Desktop

[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey.svg)](https://github.com)
[![Built with](https://img.shields.io/badge/built%20with-Electron%20%2B%20Vite%20%2B%20React-61dafb.svg)](https://electronjs.org)

**Salesforce Inspector Reloaded Desktop** is an open-source, standalone desktop port of [Salesforce Inspector Reloaded](https://github.com/tprouvot/Salesforce-Inspector-reloaded). It liberates the powerhouse Salesforce administration and development suite from the browser extension sandbox, delivering a dedicated desktop workspace with multi-org session isolation, encrypted credential vaulting, and native performance.

---

## 🌟 Acknowledgements & Full Credits

This desktop project is built upon the incredible foundational work of the Salesforce open-source community:

1. **[Salesforce Inspector Reloaded](https://github.com/tprouvot/Salesforce-Inspector-reloaded)** — Maintained and spearheaded by **[Thomas Prouvot (@tprouvot)](https://github.com/tprouvot)** and its generous open-source contributors. The extension revolutionized modern Salesforce administration with REST Explorer, Event Monitoring, Field Creator, Flow Scanner, and dark mode.
2. **Original Salesforce Inspector** — Created by **[Søren Krabbe (@sorenkrabbe)](https://github.com/sorenkrabbe)** and **[Jesper Kristensen](https://github.com/sorenkrabbe/Chrome-Salesforce-inspector)**. Their groundbreaking vision made browser-based Salesforce inspection an indispensable daily tool for hundreds of thousands of Trailblazers.

All credit for the core Salesforce inspection tools, UI layouts, and domain workflows belongs to Thomas Prouvot, Søren Krabbe, and their contributors. This desktop application is an appreciative port dedicated to expanding that functionality to a standalone desktop environment.

---

## 🖥️ About the Desktop Port

The Desktop port bridges the gap for administrators, developers, and consultants who manage multiple Salesforce environments and need a focused, persistent desktop tool without relying on browser tab permissions or session cookies.

### Key Desktop Capabilities:
- 🏢 **Multi-Org Workspaces**: Connect and switch across multiple Salesforce Production, Sandbox, and Scratch Orgs simultaneously.
- 🔒 **Encrypted Local Vault**: Session IDs, tokens, and instance hostnames are securely stored locally using OS-level secure storage primitives.
- ⚡ **Scoped Session Architecture**: Each tab maintains isolated `sfConn` session state and metadata Describe caches, preventing cross-org query pollution.
- 🚀 **Modern Tech Stack**: Powered by **Electron**, **Vite**, **React**, and **TypeScript**, bundling the upstream web app seamlessly via Electron IPC bridges.
- 🛠️ **Full Feature Parity**: Direct access to SOQL Data Export, Data Import, Object Limits, REST Explorer, Event Monitor, Field Creator, and Metadata Explorer.

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm or yarn

### Installation
```bash
git clone https://github.com/<your-username>/salesforce-inspector-reloaded-desktop.git
cd salesforce-inspector-reloaded-desktop
npm install
```

### Running Locally
```bash
# Start desktop application in development mode with live reload
npm run dev

# Build the desktop application for production
npm run build

# Preview the production build
npm run preview
```

---

## 📚 Upstream Documentation & Features

> Upstream user guides and tutorials created by the Salesforce Inspector Reloaded team:

[![view - Documentation](https://img.shields.io/badge/view-Documentation-blue?style=for-the-badge)](https://tprouvot.github.io/Salesforce-Inspector-reloaded/ "Go to extension documentation")

- Salesforce Developers Blog [Improve Your Productivity with Salesforce Inspector Reloaded](https://developer.salesforce.com/blogs/2024/07/improve-your-productivity-with-salesforce-inspector-reloaded)
- SalesforceBen :
  - [Salesforce Inspector Reloaded](https://www.salesforceben.com/salesforce-inspector-reloaded/)
  - [Video](https://youtu.be/dvYp5mKxxzM?si=hBCIaGOyqAJlerea)
  - [Explore REST API With Salesforce Inspector Reloaded](https://www.salesforceben.com/explore-rest-api-with-salesforce-inspector-reloaded/)
  - [Inspector Reloaded Update: Salesforce Event Monitor, Field Creator, and Export Config](https://www.salesforceben.com/inspector-reloaded-update-salesforce-event-monitor-field-creator-and-export-config/)
- ApexHours [article](https://www.apexhours.com/salesforce-inspector-reloaded/)
- SalesforceWay [podcast](https://salesforceway.com/podcast/salesforce-inspector-reloaded/)

## New features compared to original SF Inspector

### New Pages & Features

- **[REST Explorer](https://tprouvot.github.io/Salesforce-Inspector-reloaded/rest-explorer/)**: Interact with Salesforce REST APIs directly from the extension with request templates, query history, and auto-completion
- **[Dependencies Explorer](https://tprouvot.github.io/Salesforce-Inspector-reloaded/dependencies-explorer/)**: Analyze Salesforce metadata dependencies to understand what depends on your metadata and what your metadata depends on
- **[Field Manager](https://tprouvot.github.io/Salesforce-Inspector-reloaded/field-manager/)**: Create and edit fields for standard objects, custom objects, platform events, and custom metadata types with bulk import support
- **[Flow Scanner](https://tprouvot.github.io/Salesforce-Inspector-reloaded/flow-scanner/)**: Analyze Salesforce Flows for best practices, errors, and potential issues with comprehensive rule checking
- **[Object Scanner](https://tprouvot.github.io/Salesforce-Inspector-reloaded/object-scanner/)**: Load and export a customizable data model, search objects and fields (`Account.Name`), and optionally run hygiene analysis
- **[Debug Logs Viewer](https://tprouvot.github.io/Salesforce-Inspector-reloaded/logs-viewer/)**: View, filter, analyze, and manage Salesforce debug logs with Agentforce-powered analysis and grep-like filtering
- **[Event Monitor](https://tprouvot.github.io/Salesforce-Inspector-reloaded/event-monitor/)**: Subscribe to and display Salesforce Platform Events in real-time, including Change Events and custom channels
- **[Metadata Retrieve](https://tprouvot.github.io/Salesforce-Inspector-reloaded/download-metadata/)**: Retrieve and deploy metadata from Salesforce with package.xml generation and deployment options
- **[API Statistics](https://tprouvot.github.io/Salesforce-Inspector-reloaded/api-statistics/)**: Track and monitor all REST and SOAP API calls with performance metrics and error tracking
- **[Options](https://tprouvot.github.io/Salesforce-Inspector-reloaded/how-to/)**: Configure extension settings including favicon color picker, export/import configuration, custom shortcuts, default popup tab, and hide buttons options

### Enhanced Features

- **Show All Data** (Inspect page):
  - Agentforce Helper for formula fields to analyze and generate improvements
  - Analyze field usage by showing percentage of records that have a value for each field
  - Save fields selection to persist across sessions
  - Keyboard shortcut to save edited record values
  - Back to record button for easy navigation

- **Popup**:
  - New **Org tab** to display org and instance information
  - New **Shortcuts tab** to accelerate setup navigation with search functionality
  - **Reset Password** button in User tab
  - **Unfreeze User** button in User tab
  - **Copy Id** icon in User tab

- **Data Export** - [Documentation](https://tprouvot.github.io/Salesforce-Inspector-reloaded/data-export/):
  - Multiple query tabs support with drag & drop reordering and editable tab names
  - Agentforce SOQL generation from natural language descriptions
  - Auto-populate SOQL editor from Salesforce List View context
  - Query performance metrics with batch statistics
  - Filter result by column for easier data analysis

- **Data Import** - [Documentation](https://tprouvot.github.io/Salesforce-Inspector-reloaded/data-import/):
  - Configure SOAP headers for assignment rules, duplicate rules, and owner change options
  - Automatically detect SObject based on Id field
  - Grey out columns that were not imported
  - Guess file format on paste (CSV, JSON, Excel)
  - Undelete records support

- **Org Limits**:
  - Refresh button to update limits in real-time
  - Persist filter in URL for easy bookmarking
  - Restyled Org Limits UI with improved readability
  - Fix gauge display and text when limits are exceeded

### Other Improvements

- Favicon and banner customization for each org
- Allow users to update API Version [feature 58](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues/58)
- Add new "Shortcuts" tab to accelerate setup navigation [feature 42](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues/42)
- Add shortcuts links to (list of record types, current SObject RecordType and object details, show all data from user tab) from popup [feature 34](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues/34)
- Control access to Salesforce Inspector reloaded with profiles / permissions (Implement OAuth2 flow to generate access token for connected App) [how to](https://github.com/tprouvot/Salesforce-Inspector-reloaded/wiki/How-to#use-sf-inspector-with-a-connected-app)
- Update manifest version from [v2](https://developer.chrome.com/docs/extensions/mv3/mv2-sunset/) to v3 (extensions using manifest v2 will be removed from the store)

## Security and Privacy

The Salesforce Inspector Reloaded browser extension/plugin communicates directly between the user's web browser and the Salesforce servers. No data is sent to other parties.

We are saving some info in the browser localStorage to avoid redundant queries and save user extension's preferences. None of the saved elements are related to Salesforce SObject data (Account, Contact etc.)

You can find the list of all the localStorage saved [here](https://github.com/search?q=repo:tprouvot/Salesforce-Inspector-reloaded+"localStorage"+path:addon&type=code) and inspect what is stored by following [this tutorial](https://developer.chrome.com/docs/devtools/storage/localstorage)

The extension communicates via the official Salesforce webservice APIs on behalf of the currently logged in user. This means the extension will be capable of accessing nothing but the data and features the user has been granted access to in Salesforce.

All Salesforce API calls from the Inspector re-uses the access token/session used by the browser to access Salesforce (or the generated on if API Access Control is enabled). To acquire this access token the Salesforce Inspector requires permission to read browser cookie information for Salesforce domains.

To validate the accuracy of this description, inspect the source code, monitor the network traffic in your browser or take my word.

## Use Salesforce Inspector with a Connected App

Follow steps described in [how-to documentation](https://tprouvot.github.io/Salesforce-Inspector-reloaded/how-to/#use-sf-inspector-with-a-connected-app). Note: you must complete these steps to use the extension in orgs where "API Access Control" is enabled.

## Installation

### Browser Stores

- [Chrome Web Store](https://chrome.google.com/webstore/detail/salesforce-inspector-relo/hpijlohoihegkfehhibggnkbjhoemldh)
- [Firefox Browser Add-ons](https://addons.mozilla.org/en-US/firefox/addon/salesforce-inspector-reloaded/)
- [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/salesforce-inspector-relo/noclfopoifgfgnflgkakofglfeeambpd)

### Beta Version

Welcome to the beta testing phase! Your input is crucial for refining our extension. Here's why we need you:

Why Beta Testing?

- Diverse Testing: Identify issues across various setups.
- Real-World Scenarios: Discover unforeseen issues in different user contexts.

Report Bugs: If you discover a bug, please fill in an issue [here](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues/new?assignees=tprouvot&labels=bug,beta&projects=&template=bug_report.md&title=[BETA]). Detailed bug reports help us address issues quickly.

To become a beta tester, [install the beta version](https://chromewebstore.google.com/detail/salesforce-inspector-relo/lopjgjcglnncikiocpacfdbkmpbfmkcf).
Thank you for shaping our extension's future! Your feedback makes it better.

### Local Installation

1. Download or clone the repo.
2. Checkout the `releaseCandidate` branch.
3. Open `chrome://extensions/`.
4. Enable `Developer mode`.
5. Click `Load unpacked`.
6. Select the **`addon`** subdirectory of this repository.

## Troubleshooting

- If Salesforce Inspector is not available after installation, the most likely issue is that your browser is not up to date. See [instructions for Google Chrome](https://productforums.google.com/forum/#!topic/chrome/YK1-o4KoSjc).
- When you enable the My Domain feature in Salesforce, Salesforce Inspector may not work until you have restarted your browser (or until you have deleted the "sid" cookie for the old Salesforce domain by other means).

## Contributions

Contributions are welcome!

**Before starting developments**, create a feature request and explain the goal of it and the uses cases that it addresses. Let's discuss the implementation first, then you can start the development.

You can check for the [open issues](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues) and [check if any help is wanted](https://github.com/tprouvot/Salesforce-Inspector-reloaded/issues?q=state%3Aopen%20label%3A%22help%20wanted%22)

**Project Structure**

- `addon/`: Contains the extension source code.
- `addon/inspector.js`: Handles Salesforce connection and API calls.
- `addon/utils.js`: Common utility functions.
- `addon/components/`: React components.

**Component Development**

- **SLDS Usage**: When creating new components, use Salesforce Design System (SLDS) classes and structure.
  - Styles are defined in `addon/styles/slds/slds.css`.
- **Location**: Save new components under the `addon/components/` folder to promote reusability (e.g., see existing components like `PageHeader.js`, `ConfirmModal.js`).

**Code Reuse**

- **Check Existing**: Before creating new functions, search the codebase (especially `addon/utils.js`) to see if existing logic can be reused to avoid duplication.

**General Guidelines**

- When modifying the UI, check both Chrome and Firefox compatibility if possible.
- Use `browser` namespace for WebExtension APIs (polyfill provided or checked).

### Submitting a Pull Request

To submit a PR, please create a branch from `releaseCandidate` which is the work in progress next version.
This branch will be merged into beta and then master when the new version is published on web store.

1. **Update CHANGES.md**: Describe the improvement / bugfix you realized (latest contributions on top of the file).
2. **Update Documentation**: In order to make sure everyone who reads documentation is aware of your improvement, update the 'how-to' page to document / expose this new functionality.
3. **Linting**: To assure indentation, formatting and best practices coherence, please install ESLint extension.

## Development

1. Install Node.js with npm
2. `npm install`

### Chrome

1. Open `chrome://extensions/`.
2. Enable `Developer mode`.
3. Click `Load unpacked`.
4. Select the `addon` subdirectory of this repository.

### Firefox

1. Generate the Firefox add-on with `npm run firefox-release-build`. This copies `addon/manifest-firefox.json` to `target/firefox/dist/manifest.json` (see `scripts/release-build.js`).
2. In Firefox, open `about:debugging`.
3. Select `This Firefox` at the top left.
4. Click `Load Temporary Add-on…`.
5. Select the file `target/firefox/dist/manifest.json`.

### Unit tests

See [How to run tests](tests/HOW_TO_RUN_TESTS.md).

### Linting

1. `npm run eslint`

## Design Principles

(we don't live up to all of them. pull requests welcome)

- Stay completely inactive until the user explicitly interacts with it. The tool has the potential to break Salesforce functionality when used, since we rely on monkey patching and internal APIs. We must ensure that you cannot break Salesforce just by having the tool installed or enabled. For example, we won't fix the setup search placeholder bug.
- For manual ad-hoc tasks only. The tool is designed to help administrators and developers interact with Salesforce in the browser. It is after all a browser add-on. Enabling automation is a non-goal.
- User experience is important. Features should be intuitive and discoverable, but efficiency is more important than discoverability. More advanced features should be hidden, and primary features should be central. Performance is key.
- Automatically provide as much contextual information as possible, without overwhelming the user. Information that is presented automatically when needed is a lot more useful than information you need to explicitly request. For example, provide autocomplete for every input.
- Provide easy access to the raw Salesforce API. Enhance the interaction in a way that does not break the core use case, if our enhancements fails. For example, ensure we can display the result of a data export even if we cannot parse the SOQL query.
- It is fine to implement features that are already available in the core Salesforce UI, if we can make it easier, smarter or faster.
- Ensure that it works for as many users as possible. (for system administrators, for standard users, with person accounts, with multi currency, with large data volumes, with professional edition, on a slow network etc.)
- Be conservative about the number and complexity of Salesforce API requests we make, but don't sacrifice the other principles to do so.
- Focus on system administrators, developers and integrators.

## About

- **Desktop Port**: Salesforce Inspector Reloaded Desktop
- **Salesforce Inspector Reloaded**: [Thomas Prouvot (@tprouvot)](https://github.com/tprouvot/Salesforce-Inspector-reloaded)
- **Original Salesforce Inspector**: Forked originally from [Søren Krabbe and Jesper Kristensen](https://github.com/sorenkrabbe/Chrome-Salesforce-inspector)

## Third-Party Libraries

This extension uses the following third-party libraries:

- [Lightning Flow Scanner Core](https://github.com/Flow-Scanner/lightning-flow-scanner) - A lightweight engine for Flow metadata analysis in Node.js and browser environments (MIT License)
- [PrismJS](https://prismjs.com/) - Lightweight, extensible syntax highlighter (MIT License)

For full license details, see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)

## License

[MIT](./LICENSE)
