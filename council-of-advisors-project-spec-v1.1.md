# Council of Advisors — Project Specification

**Version:** 1.1 — Iteration 1 (Post-Review)
**Date:** February 28, 2026
**Status:** Pre-Development

---

## 1. Project Overview

### Vision

Council of Advisors is a multi-agent AI orchestration application that enables a user to run simultaneous conversations with multiple AI models in a shared context environment. The user acts as the CEO of a virtual boardroom — directing, questioning, and synthesizing input from a configurable panel of AI advisors, each with its own model, provider, and persona.

### Core Value Proposition

Today, getting a second opinion from another AI means copy-pasting between browser tabs, losing context, and manually synthesizing perspectives. Council of Advisors eliminates that friction entirely. Every advisor sees the full conversation. The user controls who speaks, when, and in what order. The result is a collaborative planning tool that treats AI models as a team, not isolated oracles.

### Target User

Developers, technical leads, architects, and power users who already work with AI tools daily and want to harness multiple models for planning, decision-making, document creation, and review. Users are comfortable with API keys, markdown files, and terminal interfaces. The app is published as a free, downloadable tool — users bring their own API keys and pay their own provider costs.

### Licensing & Distribution

The application is open for anyone to download and use. Users are responsible for their own API keys and must comply with each provider's Terms of Service. The application does not resell, proxy, or redistribute API access. A disclaimer is presented at onboarding.

---

## 2. Connection & Authentication

### API Keys

All AI model access is through official provider APIs using user-supplied API keys. No CLI wrapping, no browser automation, no subscription hooking. This is the only ToS-clean path for a distributed multi-provider orchestration tool.

### Key Auto-Detection

When a user pastes an API key, the app reads the key prefix to auto-detect the provider:

| Provider | Key Prefix | Notes |
|----------|-----------|-------|
| Anthropic | `sk-ant-` | Unambiguous |
| OpenAI | `sk-proj-` | Newer keys; legacy `sk-` keys are shorter than Anthropic's |
| Google (Gemini) | `AIza` | Unambiguous |
| xAI (Grok) | `xai-` | Unambiguous |
| DeepSeek | `sk-` | Ambiguous — requires manual confirmation or base URL pairing |

For ambiguous keys, the app prompts the user to confirm the provider manually.

### Key Storage

Keys are stored in a `.env` file within the application's local data directory. This file is managed programmatically by the app (never by LLMs or external processes) — written when keys are added/removed through the key management UI, read on startup. The `.env` file is excluded from version control by default (`.gitignore`).

This approach is transparent and follows the same pattern used by the Anthropic SDK, OpenAI SDK, and most developer tools. The README documents the file's location and notes that keys are stored in plaintext — users who want additional protection should use OS-level disk encryption.

### Key Security — Hard Rules

Keys are **never** echoed or displayed in full anywhere in the UI. The key management screen shows masked keys only (e.g., `sk-ant-••••••••7x3F` — last 4 characters for identification). Keys are **never** transmitted anywhere except to their respective provider's API endpoint. Keys are **never** written to session files, export files, or logs. Keys are **never** passed to any LLM as part of conversation context. If an LLM response ever contains text matching a key pattern, the app redacts it before rendering (regex filter on all output).

### Key Management Screen

A dedicated settings screen where users can add new keys, remove existing keys, test key validity (a lightweight API call to verify authentication), and see which providers are currently configured. Each key is assigned an internal ID used for session save/resume — the actual key value is never written to session files.

### Multi-Key Usage

A single key can serve multiple advisor windows (e.g., two Claude windows using the same Anthropic key but different models). The app also accepts multiple keys from the same provider for users who want to spread rate limits across accounts. There is no restriction or judgment — the user decides how to organize their keys.

---

## 3. Layout & Window System

### Window Management

The app launches with a configurable number of panes. A "+" button adds new advisor windows. Each new window prompts the user to select a provider (from configured keys), a model, and a persona. An "X" button on each window removes it (see Closing Windows below).

### Splitting

Users can split any window horizontally or vertically. This creates a tiling layout similar to VS Code or tmux. Dividers between panes are draggable and resizable. Nested splits are supported (split a pane that was already created by a split).

### Window Header

Each window displays a persistent header bar showing: provider name (e.g., "Claude"), model name (e.g., "Opus 4.6"), persona name (e.g., "Security Engineer"), running cost for that window, and a close (X) button.

### Closing Windows

Clicking the X button on a window header prompts a confirmation: "Remove this advisor? Their past messages remain in the shared context." Removing a window does not erase that agent's contributions from the shared thread. It only stops that agent from being queried further. If the agent is in a queue, it is automatically removed from the queue.

### Shared Input Bar

A persistent input bar at the bottom of the screen, spanning the full width, is the user's primary way to send messages to the shared context.

---

## 4. UI Modes & Theming

### Dual UI Mode

The app supports two rendering modes, toggled globally:

**Terminal Mode** — monospaced font, dark background, prompt-style prefixes (e.g., `claude-opus >`), code-friendly aesthetic. Designed for users who prefer a CLI feel.

**GUI Mode** — chat bubble layout with distinct user message bubbles and agent message bubbles, similar to Claude.ai or ChatGPT. Designed for users who prefer a visual chat interface.

Both modes render the same underlying data. Switching modes is instant and non-destructive.

### Rendering Performance

Both UI modes must handle simultaneous streaming from multiple agents without layout jitter. Requirements:

**Virtualized list rendering** for the shared context view. Only visible messages are rendered in the DOM; off-screen messages are virtualized.

**Locked dimensions during streaming.** When an agent is actively generating, its content area uses a scroll-to-bottom anchor that only affects its own window. Other windows are not displaced or reflowed by a streaming agent's output.

**Isolated scroll positions.** Each window maintains its own independent scroll position. Streaming in one window never causes scroll jumps in another.

### Color Theming

The app supports full color customization through importable theme files.

**Terminal mode colors:** background, text, code block background, code syntax highlighting (selectable from standard themes like Monokai, Dracula, Solarized, or user-defined).

**GUI mode colors:** text color, user bubble color, agent bubble color, canvas/page background.

**Theme file system:** A `/themes` folder in the install directory. The app ships with defaults (dark, light, high-contrast at minimum). A `THEME_README.md` in the folder documents every mappable property, accepted formats (hex, RGB), and the schema. Users create a JSON or YAML theme file and drop it in. The app scans the folder and populates a theme dropdown. A default theme is always available to revert to if a custom theme has issues.

**Fallback behavior:** Every color property has a hardcoded default. If a user's theme has a malformed or missing value, the app falls back to the default for that specific property. A subtle notification or debug log entry informs the user.

### Per-Agent Accent Colors

Each advisor window is assigned an accent color from a predefined 20-color palette. Colors are assigned sequentially — agent 1 gets color 1, agent 2 gets color 2, etc. At agent 21, the palette wraps. These accent colors tint the agent's messages in the shared context view for easy visual identification.

Per-agent coloring can be toggled off globally. Individual agent colors can be manually overridden. The 20-color palette is defined in the theme file, so custom themes can provide their own palette.

---

## 5. Model Selection

### Per-Window Model Dropdown

Once the app knows the provider (from the API key), each window shows a dropdown of available models for that provider. Examples:

| Provider | Available Models (illustrative) |
|----------|-------------------------------|
| Anthropic | Opus 4.6, Sonnet 4.5, Haiku 4.5 |
| OpenAI | GPT-4o, GPT-4o-mini, o1, o3 |
| Google | Gemini 2.0 Flash, Gemini 2.5 Pro |
| xAI | Grok-3, Grok-3-mini |

The model list should be configurable or periodically updatable as providers release new models.

### Mid-Session Model Switching

The user can change a window's model at any time via the dropdown. This does not trigger context compaction (unlike persona switching). The window header updates immediately. The change is logged in the shared context for export purposes.

---

## 6. Shared Context Bus

### Architecture

A central data structure holds the complete conversation thread. Every message — from the user or any agent — is appended to this shared thread. When any agent is queried, it receives the shared thread (or a compacted version of it) as its conversation history.

### Identity Headers

Every message in the shared context bus is prefixed with the speaker's persona label in square brackets. For example:

```
[You]: What encryption standard should we use for data at rest?
[Security Engineer]: We should use AES-256. It's the industry standard and...
[CFO]: That sounds expensive in terms of compute. What's the cost impact?
[Security Engineer]: The performance overhead is minimal for modern hardware...
```

This allows all agents to understand which perspective a message comes from without exposing full system prompts or persona instructions. The labels are part of the message content, not metadata — they naturally survive context compaction. If an advisor's persona is switched mid-session, new messages simply appear under the new label.

The `@mention` syntax used for agent-to-agent interaction (Section 11) is stripped before messages are sent to any model. The identity headers are the only cross-agent identification mechanism.

### Source of Truth

The shared thread is the authoritative record. Per-agent context compaction produces derived views for each window's API calls, but the shared thread itself retains the full history until the user explicitly compacts it.

### User-Triggered Main Thread Compaction

When the shared thread grows large enough to overpower individual agent windows on every turn (even with per-agent compaction), the user can trigger a main thread compaction via a dedicated button. This runs the full thread through a summarization pass and produces a condensed version that becomes the new working baseline.

**Warning popup:** Before compacting, the app displays: "This will summarize the conversation history. All agents will work from the summarized version going forward. The full original is preserved in your session file." A "Don't show this warning again" checkbox saves the preference to local settings (re-enableable from settings).

**Archival:** The original uncompacted thread is preserved in the session file for export and reference purposes.

---

## 7. Context Compaction (Per-Agent)

### Trigger

Each window tracks its token usage against its model's context limit. When the payload for a given agent reaches approximately 60-70% of that model's maximum context window, compaction is triggered automatically for that agent's view.

### Mechanism — Sliding Window + Summary (Hybrid)

Compaction uses a two-part payload structure:

**The Archive:** A condensed summary of the oldest portion of the conversation, generated by a cheap/fast model (e.g., Claude Haiku, GPT-4o-mini). This provides "fuzzy long-term memory" — the agent knows the broad strokes of what was discussed earlier.

**The Buffer:** The most recent 10-15 messages in their original, raw, unmodified format. This provides "perfect short-term memory" — the agent has full fidelity on the immediate conversation, including exact variable names, specific numbers, code snippets, and edge cases that a summary would lose.

The resulting payload sent to the agent is: [System Prompt] → [Archive summary] → [Buffer of raw recent messages].

**Buffer size is configurable per window,** as some conversations have longer individual turns than others. Default is 15 messages.

### Per-Agent Timing

Different models have different context limits. Compaction triggers at different times for each window. A Claude Opus window with 200k context compacts much later than an 8k-context model. This is handled independently per window.

### Manual Compaction

Each window has a "Compact Now" button for user-initiated compaction. Useful for saving tokens when the user knows early conversation is no longer relevant.

### Visual Indicator

When compaction occurs (automatic or manual), a subtle indicator appears in the window so the user knows that agent is working from a summarized history.

---

## 8. Turn Management

Four modes are available, switchable at any time during a session. All four modes use the queue sidebar (Section 9) and support the user card as a first-class participant.

### Sequential Mode

Round-robin turn order. The user has a card in the rotation. Flow: User → Agent 1 → Agent 2 → Agent 3 → User → Agent 1 → ... The order is fixed unless the user removes or adds agents.

### Parallel Mode

All agents respond simultaneously. The user can type at any time — their message enters the shared context immediately. Agents that haven't started yet will see it; agents already mid-response work from the context snapshot at the time they were queried. A prominent **Stop All** button is always visible in parallel mode.

### Manual Mode

No automatic turn progression. The user clicks on a specific agent's card or window to trigger that agent's response. Full user control over who speaks and when.

### Queue Mode

User-defined turn order using a drag-and-drop sidebar. The user arranges agent cards (and their own user card) in any order. The queue executes top to bottom, then the user rebuilds or the queue loops.

**Duplicate cards:** In sequential, manual, and queue modes, the user can place the same agent card in the queue multiple times. This allows an agent to respond twice in a row — the second response sees the first, enabling a "continue your thought" pattern without the user typing anything. The user card can also be duplicated for multiple interjection points.

**Skip:** A skip button on the card itself sends that agent to the bottom of the queue for the current cycle. For persistent skipping across many turns, the user should remove the agent and re-add later — repeated skipping is not a substitute for removal.

**Pause:** A pause queue button lets the current agent finish its response but prevents the next agent from starting. Resume continues from where it paused.

**Reorder on the fly:** Any agent not currently mid-response can be dragged to a new position at any time.

**Parallel mode exception:** Duplicate cards and queue ordering are disabled in parallel mode, as all agents are active simultaneously.

---

## 9. Queue Sidebar

### Design

A sidebar panel displaying a vertical stack of agent cards. Each card shows: agent name/label, model, persona, and the agent's accent color as a border or tag.

### States

**Active/thinking:** The currently responding agent's card shows a visual indicator (pulsing border, spinner).

**On deck:** Cards below the active card are queued and waiting.

**Errored:** A distinct red-highlighted zone at the bottom of the sidebar titled "Errored." When an agent's API call fails, its card slides into this zone with a brief error label (e.g., "Rate limited," "Network error," "Auth failed"). The agent's main window displays full error details and a retry button. The queue continues without the errored agent. The user can drag the errored card back into the active queue to retry on its next turn, or remove it entirely.

### Utility Across Modes

The sidebar is useful in all four turn modes. In sequential mode, it shows the round-robin order. In manual mode, it's a click-to-activate list. In queue mode, it's the drag-and-drop reorder interface. In parallel mode, all cards show as active.

### User Card

The user has their own card in the sidebar, visually distinct (different style, "You" label). In all non-parallel modes, the user card is part of the turn order. The user can place their card at multiple points in the queue if they want to interject at specific moments in the sequence.

---

## 10. Persona / System Prompt System

### Three-Layer Architecture

Every API call to an advisor includes a system prompt composed of three layers, always in this order:

**Layer 1 — App-Level System Prompt (hidden, hardcoded):**

> "You are one of several AI advisors participating in a collaborative session. A human user is leading the discussion. Other AI models may also be participating — their responses will appear in the conversation with identity headers in square brackets indicating their role. Your role is to contribute your expertise honestly, note when you agree or disagree with other advisors, and follow the persona instructions given to you below. Do not try to dominate the conversation. Be concise unless asked to elaborate."

This is never visible to the user and cannot be edited. It establishes the council dynamic for every advisor.

**Layer 2 — Persona Prompt (from `.md` file):**

Loaded from the user's selected persona file. This defines the advisor's personality, expertise, and behavioral guidelines. Examples: "You are a skeptical senior engineer focused on security and reliability" or "You are a product manager who prioritizes user experience and market fit."

**Layer 3 — Per-Session Instructions (optional, user-entered):**

Free-text instructions the user can add at session start or mid-session. Example: "For this session, focus on healthcare compliance requirements." Appended after the persona prompt.

### Advisor Awareness of Other Advisors

Advisors see identity headers (e.g., `[Security Engineer]`, `[CFO]`) on all messages in the shared context, allowing them to understand which perspective a message comes from and engage with it directly. However, advisors are NOT given the full persona system prompts or detailed instructions of other advisors. They know *who* is speaking by role label, but not *how* that advisor was prompted. This strikes a balance between productive cross-advisor dialogue and avoiding performative behavior.

### Persona File Management

**Location:** A `/personas` folder in the application's install directory.

**Built-in defaults:** The app ships with 5-6 predefined persona files covering common advisory roles (e.g., Skeptical Security Engineer, Product Strategist, Devil's Advocate, Technical Architect, Empathetic UX Researcher, Cost-Conscious CFO).

**Custom personas:** Users drop their own `.md` files into the `/personas` folder (or a `/personas/custom` subfolder).

**Display name:** Parsed from the filename (minus extension) or from the first `# Heading` in the file if present.

**"Open Personas Folder" button:** In the UI, opens the OS-native file explorer to the personas directory.

**Refresh:** A button to rescan the personas folder without restarting the app.

### Mid-Session Persona Switching

When a user changes a window's persona during a session:

1. The agent's prior conversation context is immediately compacted into a summary.
2. The new persona prompt replaces the old one in Layer 2.
3. The compacted context is reframed: "[Summary of prior discussion]. You are now joining this conversation as [new persona]."
4. A subtle UI indicator shows the switch happened in that window.
5. The shared thread retains the full uncompacted history — only that specific agent's API payload is restructured.
6. New messages from this agent appear with the new identity header label.
7. The change is recorded for session export with a visible annotation.

---

## 11. Agent-to-Agent Interaction

### Mechanism

The user can direct one agent to respond to another using an `@mention` syntax (e.g., `@SecurityAdvisor what do you think about the CFO's cost concern?`). The app strips the `@mention` before sending anything to any model. Routing is handled entirely by the orchestration layer. Agents see messages attributed via identity headers only (see Section 6).

### Control Flow

Agent-to-agent interaction is **single-turn by default**. The user issues a directive, it executes once (one agent responds to another), and control returns to the user.

**Repeat button:** A "Repeat Last Agent-to-Agent Command" button appears at the bottom of the input area after an agent-to-agent exchange. One click re-runs the same directive without retyping.

**N-turn mode:** The user can optionally allow two agents to exchange multiple rounds by specifying a turn count. A hard ceiling of 10 rounds is enforced by the app regardless of user input. Cost budget enforcement applies — if the session budget is hit during an exchange, all calls cancel immediately.

**Interrupt:** The Stop All button (also used in parallel mode) cancels any in-flight agent-to-agent exchange at any time.

---

## 12. Voting

### Mechanism

A "Call for Vote" button broadcasts a question to all active advisors with an instruction appended to the prompt: "Respond with only: YAY, NAY, or ABSTAIN, followed by a one-sentence justification."

### Display

Responses are parsed and displayed in a summary panel showing each advisor's vote and justification, plus a tally (e.g., "3 YAY, 1 NAY, 1 ABSTAIN").

---

## 13. Cost Tracking

### Per-Window Cost

Displayed in each window's header bar, prefixed with "~" to indicate estimation. Accumulated across all calls made from that window.

### Dual Tracking Strategy

**Real-time estimation:** A client-side tokenizer runs during streaming to provide a live cost estimate as tokens arrive. This ensures cost visibility even if a stream is aborted before the API returns final metadata. Per-provider tokenizer libraries are used where available (e.g., `tiktoken` for OpenAI). For providers without a public tokenizer, a character-based approximation (characters ÷ 4) is used.

**Post-response reconciliation:** When an API response completes normally and returns token count metadata, the estimate is replaced with the actual cost. If the stream was aborted (Stop All, budget hit, error), the client-side estimate stands as the final figure for that call.

### Session Total

Displayed in the sidebar or top bar. The sum of all per-window costs.

### Pricing Configuration

A pricing config file maps model identifiers to their per-token rates (input price, output price). This file is user-accessible and updatable as providers change pricing.

### Token Budget

The user can set a session spending cap (e.g., "Don't exceed $5"). The app warns at 80% of the budget. At 100%, all API calls are halted — including in-flight parallel or agent-to-agent exchanges. Budget enforcement overrides all other operations.

---

## 14. File I/O & Sandboxing

### Directory Structure

The application enforces strict file I/O boundaries through three dedicated directories inside its data folder:

```
/app-data/
  /input/
    /session-abc123/
      uploaded-diagram.png
      requirements.pdf
    /session-def456/
      api-spec.yaml
  /output/
    /session-abc123/
      tech-spec.md
      architecture-review.md
    /session-def456/
      cost-analysis.md
  /sessions/
    session-abc123.council
    session-def456.council
  /personas/
    security-engineer.md
    product-strategist.md
    /custom/
      my-custom-persona.md
  /themes/
    dark.json
    light.json
    THEME_README.md
  .env
```

### Input Handling

When a user drops a file into a conversation (drag-and-drop or attach button), the app copies the file into `/input/{session-id}/`. The original file remains untouched on the user's system. The LLM receives the file *content* as part of its API payload (base64-encoded for images, text-extracted for documents). The `/input` subfolder preserves the file for session persistence and resume.

### Output Sandboxing

`/output/{session-id}/` is the **only** directory any LLM-generated file can be written to. If an advisor generates a tech spec, code file, or any artifact, it lands here and nowhere else. LLMs have zero write access to any other location. No exceptions.

### Path Privacy

The app **never** passes file paths to LLMs. Only file contents. An LLM never knows where on the user's filesystem anything lives. It receives "here is the content of a file the user shared" — not the full path. Filepath management is internal to the app.

### Session File References

The `.council` session file references input and output files by their relative path within the session subfolder, not by absolute filesystem paths. On resume, the app verifies that referenced files still exist. If an input file is missing, the conversation still loads but that message shows "Referenced file not found: [filename]" instead of the file content.

---

## 15. Session Save & Resume

### File Format

Sessions are saved as `.council` files (JSON with a custom extension) in the `/sessions` directory. The file contains: all window configurations (provider, key reference ID — not the actual key, model, persona filename), the full shared thread (including archived pre-compaction originals), per-agent compacted views (archive + buffer state), the current queue order, cost tallies per window and session total, session-level instructions, and relative references to input/output files in their respective session subfolders.

### Resume Behavior

Each window loads independently on resume. If a persona file referenced in the session no longer exists, that window renders with an error message inside it: "Error loading persona. Please add back the persona [filename/persona name] or pick a new persona." A dropdown is provided to select a replacement. If an API key ID referenced in the session isn't found in the user's current key store, the window shows: "API key not found. Please configure a key for [provider]." with a button to open key settings. Other windows that can load do so normally. The session does not fail entirely because one window has a configuration issue.

---

## 16. Export

### Full Session Log

The entire conversation is exportable as markdown or PDF. Each message in the export includes: timestamp, agent name/label (matching the identity header), model used at the time of that message, persona active at the time of that message.

### Change Annotations

When a structural change occurred during the session (persona switch, model switch, context compaction), the export inserts a visible divider:

```
═══════════════════════════════════════════
⚠ CHANGE: Window 3 — "Security Engineer"
  Model changed from Claude Sonnet 4.5 → Claude Opus 4.6
  Persona switched from "Security Engineer" → "Regulatory Compliance"
  Context was compacted at this point
═══════════════════════════════════════════
```

All applicable changes are combined into a single annotation block per event to minimize token overhead if the export is ever fed back into an AI session.

### Tech Spec Generation

At any point, the user can select one advisor and instruct it to generate a document (e.g., "Write a tech spec based on everything above"). That output becomes a distinct artifact in the shared context and is saved to `/output/{session-id}/`. The user can then broadcast it to all other advisors for review. The artifact is included in the session export.

---

## 17. Onboarding & First Launch

### Setup Wizard

On first launch, a lightweight wizard guides the user through: adding at least one API key (with auto-detection), selecting a model, selecting a persona (or using a default), and a brief feature overview — what the shared context is, how turn modes work, where to find personas.

### ToS Disclaimer

During onboarding, a disclaimer is presented: "You are responsible for your own API keys and must comply with each provider's Terms of Service. This application does not store, proxy, or redistribute your API access."

### Replay

A "Getting Started" or "Replay Tour" option in the settings or help menu reruns the onboarding wizard and feature walkthrough at any time.

---

## 18. Error Handling

### Per-Window Independence

API failures are handled per-window. If one agent's API call fails (rate limit, network error, auth failure, provider outage), that window displays the error inline with a retry button. Other windows continue operating normally.

### Queue Integration

In queue mode, a failed agent's card moves to the "Errored" zone in the sidebar (red-highlighted section). The queue skips it and proceeds to the next agent. The user can drag the errored card back into the queue to retry, or remove it.

### Parallel Mode

In parallel mode, if one agent fails while others succeed, the successful responses are displayed normally. The failed window shows its error. The Stop All button cancels all remaining in-flight calls if needed.

### Budget Overrun

If a token budget is hit mid-operation, all in-flight API calls are cancelled via abort signals (AbortController). A notification informs the user that the budget has been reached and no further calls will be made until the budget is increased or reset.

---

## 19. Distribution & Platform Support

### Two Distribution Formats

**Electron (primary):** Desktop application (~150-200MB) bundling Chromium for maximum rendering consistency across all platforms. Published as downloadable binaries per platform — Windows (.exe/.msi), macOS (.dmg), Linux (.AppImage/.deb). Chromium bundling ensures identical behavior for the complex UI requirements (tiling windows, simultaneous streaming, drag-and-drop, virtualized scroll) regardless of OS. This is the primary distribution path.

**Docker (secondary):** A `docker-compose.yml` for users who prefer containerized deployment. The app runs as a web server and is accessed at `localhost` in the user's browser. Ideal for developers, home server setups, remote access, and contributors who want to run the project without installing Electron's toolchain. Nearly zero additional maintenance cost since it serves the same frontend.

Both share the same frontend codebase. Electron wraps it in a native window with Node.js. Docker serves it via a lightweight web server.

**Future option — Tauri:** A lightweight (~10-20MB) Tauri build may be offered in the future once the UI is proven stable and cross-platform webview consistency can be validated against the app's rendering requirements.

### Cross-Platform Handling

**Distribution:** Separate compiled binaries per OS, built via CI/CD (e.g., GitHub Actions). The download page or releases page offers platform-specific downloads. No OS detection needed at install time — the user selects their platform.

**Runtime:** Minimal OS-specific logic handled through Electron's built-in APIs (process.platform). File paths, native file explorer commands (for "Open Personas Folder"), and keyboard shortcuts (Ctrl vs Cmd on macOS) are handled via platform detection.

**Styling:** The UI is identical across platforms thanks to Chromium bundling. Custom title bar recommended for visual consistency across OSes.

---

## 20. Suggested Tech Stack

Resolved from the open questions in v1.0, informed by external technical review:

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Language | TypeScript (strict mode) | Type safety across the full codebase |
| Frontend Framework | React | Largest ecosystem for tiling window libraries (react-mosaic), drag-and-drop, streaming UI |
| State Management | Zustand | Lightweight, supports selective re-renders — critical for streaming tokens across multiple windows without full-layout re-renders |
| Styling | Tailwind CSS | Utility-first approach simplifies dual UI mode implementation |
| Streaming | EventSource / Server-Sent Events | Standard for consuming streaming API responses |
| Cancellation | AbortController | Native browser API for aborting in-flight requests (Stop All, budget enforcement) |
| Tiling Layout | react-mosaic or similar | Handles horizontal/vertical splits, draggable dividers, nested panes |
| Desktop Shell | Electron | Chromium consistency, mature ecosystem |
| Token Estimation | tiktoken (OpenAI), per-provider libs | Client-side cost tracking during streams |

---

## 21. Stretch Goals (Post Iteration 1)

### Conversation Branching / Forking

The ability to "fork" the conversation at any point, explore an alternative direction, and compare outcomes. The user could rewind to a specific turn and branch into a parallel timeline. Powerful for decision-making but architecturally complex. Planned as a stretch goal after iteration 1 ships, not a formal iteration 2 item.

### Pinned Context

Messages or decisions the user marks as "pinned" that are always included in full for every agent, regardless of compaction. Ensures critical requirements or constraints stay in every advisor's awareness even as older context is summarized. Requires careful integration with the compaction system. Planned alongside conversation branching.

### Tauri Distribution

Lightweight alternative to Electron for users who prefer smaller binary size and lower memory usage. Requires validation of cross-platform webview rendering consistency against the app's UI requirements.

---

## 22. Open Questions for Development

These items need resolution during the architecture and technical spec phase:

1. **Compaction model** — Should the app default to using the cheapest model available in the user's configured keys for summarization, or should the user explicitly designate a "compaction model"?
2. **Model list updates** — How to keep the per-provider model dropdowns current as providers release new models? Hardcoded list with manual updates, a remote config file, or an API call to each provider's model listing endpoint?
3. **Session file versioning** — As features evolve, `.council` file schema will change. How to handle backward compatibility for older session files?
4. **Accessibility** — Screen reader support, keyboard navigation for all queue operations, high-contrast theme as a default option.
5. **Localization** — Is multi-language support for the UI a consideration, or English-only for iteration 1?

---

## Appendix A: Revision History

### v1.0 → v1.1 Changes

Changes incorporated from external technical review and subsequent discussion:

- **Identity Headers (Section 6):** Added persona-labeled message prefixes in the shared context bus so advisors can see who said what by role label, without exposing full persona system prompts.
- **Sliding Window + Summary (Section 7):** Refined compaction to a hybrid Archive + Buffer model with configurable buffer size (default 15 raw messages), replacing the vague "compacted summary + recent turns" description.
- **Rendering Performance (Section 4):** Added virtualized list rendering, locked dimensions during streaming, and isolated scroll positions as core frontend requirements.
- **State Management (Section 20):** Resolved in favor of Zustand over Redux for efficient partial updates during streaming.
- **Key Storage (Section 2):** Changed from "encrypted locally" to transparent `.env` file approach. Added comprehensive key security hard rules including output redaction.
- **Cost Tracking (Section 13):** Added dual tracking strategy — client-side tokenizer estimation during streams with post-response reconciliation from API metadata.
- **Distribution (Section 19):** Narrowed from three formats (Tauri/Electron/Docker) to two (Electron/Docker) for iteration 1. Electron chosen as primary for rendering consistency. Tauri moved to stretch goals.
- **File I/O & Sandboxing (Section 14):** New section. Defined `/input`, `/output`, and `/sessions` directory structure with per-session subfolders. Strict output sandboxing — LLMs can only write to `/output`. Path privacy — LLMs never see filesystem paths.
- **Tech Stack (Section 20):** New section resolving previously open questions about framework, state management, styling, and streaming approach.
- **Advisor Awareness (Section 10):** Updated from "advisors know nothing about each other" to "advisors see identity headers but not full persona prompts."
- **App-Level System Prompt (Section 10):** Updated to reference identity headers in the prompt text.

---

*This document is the foundation for the technical specification and architecture design phase. It defines what the application does and how the user experiences it, not how it is built internally.*
