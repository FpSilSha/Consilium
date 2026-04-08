<p align="center">
  <img src="./assets/hero.png" alt="Consilium — collaborate with multiple AIs in a virtual council" />
</p>

# Consilium

> A multi-agent AI orchestration desktop app where you act as CEO of a virtual boardroom. Multiple AI models from different providers participate in a single conversation, each with its own role and persona, and you direct the discussion.

Consilium is for the kind of decision-making that benefits from more than one perspective: technical design reviews, product strategy debates, security threat-modeling, code reviews, planning sessions. Instead of asking one model and getting one answer, you convene a council of advisors and let them argue, agree, and refine each other's thinking — with you as the human in the loop.

It's a desktop app (Electron + React + TypeScript). Bring your own API keys; nothing is routed through any third party.

---

## What you can do with it

- **Run multiple models in one conversation.** Mix Claude, GPT, Gemini, Grok, DeepSeek, OpenRouter models, and your own custom HTTP adapters in the same thread. Each advisor sees the full conversation including the other advisors' responses.
- **Assign personas.** Each advisor has a persona — Security Engineer, Product Strategist, Devil's Advocate, or any custom persona you create. Personas shape how the model approaches the conversation without changing what model it actually is.
- **Choose how they speak.** Four turn modes: sequential (one after another), parallel (all at once), manual (you pick who responds next), or queue (you stack a planned order).
- **Steer the discussion.** Address advisors by name with `@mentions`, swap personas mid-session (with conversation handoff), call for a vote, or compile the whole discussion into a polished document.
- **Stay in control of cost.** Per-session budget cap with halt-on-exceed. Cost tracking by advisor. Live token usage estimates.
- **Manage context automatically.** Long sessions get summarized (compacted) so you don't blow past model context windows. Compaction is a separate cheap-model call so the main advisors never see truncated history.

---

## How it works

### The shared context bus

All advisors read from and write to a single conversation thread. Each message has an identity header — `[You]: ...` for the human, `[Persona Label]: ...` for an advisor — so models can tell who said what. When an advisor responds, its turn becomes part of the thread that the next advisor sees. This is the "boardroom" metaphor: everyone's listening to the same conversation.

### Turn modes

The shared context is the same regardless of turn mode; the difference is *when* each advisor speaks:

- **Sequential** — advisors take turns in order. After your message, advisor 1 responds, then advisor 2 sees both your message and advisor 1's response, and so on.
- **Parallel** — all advisors respond to your message at the same time, each unaware of the others' responses for that round. Useful for soliciting independent opinions without anchoring.
- **Manual** — you pick who responds next via a queue panel. Good for following up with one specific advisor without triggering everyone.
- **Queue** — you build a planned order ahead of time and the app dispatches it.

### Personas

A persona is a markdown prompt that's prepended to the model's system prompt — defining role, expertise, communication style, and behavior. Consilium ships with a small library of base personas (Security Engineer, Product Strategist, Devil's Advocate, Technical Architect, UX Researcher, Cost-Conscious CFO) and lets you create your own custom personas through the Configuration modal. Custom personas live in your user-data directory; base personas live in `personas/*.md` in this repo and are baked into the app at build time.

### Configuration modal

A single sidebar-tabbed dialog (Edit → Configuration, or Ctrl+,) hosts every settings surface in the app:

- **Personas** — manage built-in and custom advisor personas
- **System Prompts** — customize the Layer-1 advisor instructions and the persona-switch handoff prompt (each independently base / custom / off)
- **Compile Prompts** — manage the templates used by Compile Document, including the 5 built-in presets (Comprehensive Report, Brief Summary, Meeting Minutes, Essay, Q&A Digest) plus your own custom prompts
- **Compact Prompts** — manage the summarization prompt used by both manual compact and auto-compaction
- **Compile** — default model, max output tokens, default style preset for compile document
- **Auto-compaction** — global default for new sessions, threshold, summarization model
- **Advanced** — raw JSON config editor for power users

Each pane saves independently (per-pane Save button) and warns on unsaved changes when switching panes.

### Cost tracking and budget

Every advisor turn records its provider, model, prompt tokens, response tokens, and estimated cost (calculated from OpenRouter's published per-model pricing). The session running cost is shown in the budget bar; clicking it opens a per-advisor cost breakdown. Setting a session budget enforces a halt at 100% so an out-of-control parallel-mode session can't burn through your API credits. Cost figures are estimates and don't guarantee a match with your actual provider invoice.

### Compile Document

Turns the entire conversation into a polished markdown document via a separate model call (you pick which model). Comes with 5 built-in style presets and supports custom prompts you create yourself. Optionally takes a "focus" prompt to steer the compilation toward a specific question or angle. The result lands in a Documents panel for export, re-use, or feeding back into the conversation.

### Auto-compaction

Long conversations eventually exceed the model's context window. Auto-compaction watches each advisor's context usage and, when any advisor crosses 65% of its context limit, summarizes the older portion of the conversation into a compact archive using a separate cheap model (configurable). The archive replaces the older messages in that advisor's view; recent turns stay verbatim. Each advisor manages its own compaction state independently.

### Sessions

Each conversation is a session that auto-saves to disk on every change (atomic writes). You can browse, switch between, rename, and delete sessions from the sidebar. Sessions persist your advisor lineup, conversation history, compacted archives, compiled documents, and per-session settings.

---

## Tech stack

- **Language:** TypeScript (strict mode)
- **Frontend:** React 19
- **State:** Zustand (sliced per feature)
- **Styling:** Tailwind CSS v4
- **Desktop:** Electron with electron-vite
- **Streaming:** SSE / EventSource with AbortController
- **Tokenizer:** char-based estimator (per-provider catalog of pricing + context limits)
- **Tests:** Vitest

API integrations are written as per-provider adapters in `src/services/api/adapters/` plus a generic custom-adapter framework that lets you add any HTTP-based provider via configuration alone (no code changes).

---

## Getting started

### Prerequisites

- Node.js 20+
- npm

### Install and run

```bash
git clone https://github.com/FpSilSha/Consilium.git
cd Consilium
npm install
npm run dev      # launches the Electron app in dev mode
```

### Other scripts

```bash
npm run build      # production build
npm run package    # build a packaged Electron binary (electron-builder)
npm run typecheck  # TypeScript check (main + renderer)
npm test           # vitest suite
```

### First-run setup

On first launch, the onboarding wizard walks you through adding an API key for at least one provider, choosing a model, and picking a persona for your first advisor. From there you can add more advisors via the right sidebar, switch turn modes via the input bar, and start chatting.

---

## Project structure

```
Consilium/
├── electron/
│   ├── main/           # Main process (window, IPC handlers, file I/O)
│   └── preload/        # Context-bridge API surface
├── personas/           # Built-in persona .md files (loaded at build time)
├── src/
│   ├── app/            # App shell, startup hooks, routing
│   ├── store/          # Zustand store (one slice per feature)
│   ├── services/       # API adapters, context bus, tokenizer
│   ├── types/          # Shared TypeScript interfaces
│   └── features/       # Feature modules (chat, advisors, configuration, etc.)
└── tests run via vitest, colocated with source files
```

For a deep dive into architecture, conventions, and how each feature is wired, see [`CLAUDE.md`](./CLAUDE.md).

---

## Bring your own keys

Consilium does not host any AI model. You add your own API keys for whichever providers you want to use. Keys are stored locally via Electron's `safeStorage` (OS-level encryption: Keychain on macOS, DPAPI on Windows, kwallet/gnome-keyring on Linux) and never leave your machine except when making the API call to the provider you configured them for.

Supported providers out of the box:

- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- xAI (Grok)
- DeepSeek
- OpenRouter (single key, hundreds of models)
- Custom adapters (any HTTP-based API — configure request/response templates in the Adapter Builder)

---

## Status

Active development. Expect rough edges. Issues and PRs welcome.
