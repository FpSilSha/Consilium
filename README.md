<p align="center">
  <img src="./assets/hero.png" alt="Consilium — a human and holographic advisors Claude, Grok, Gemini, Llama, and GPT gather around a council table overlooking Earth" />
</p>

# Consilium

> A multi-agent AI orchestration desktop app where you act as CEO of a virtual boardroom. Multiple AI models from different providers participate in a single conversation, each with its own role and persona, and you direct the discussion.

Consilium is for the kind of decision-making that benefits from more than one perspective: technical design reviews, product strategy debates, security threat-modeling, code reviews, planning sessions. Instead of asking one model and getting one answer, you convene a council of advisors and let them argue, agree, and refine each other's thinking — with you as the human in the loop.

It's a desktop app (Electron + React + TypeScript). Bring your own API keys, or use your own supported personal subscription under the provider's terms. Claude subscription access through your locally installed Claude Code is currently supported. Requests go to your configured providers; Consilium does not operate a hosted model service.

---

## What you can do with it

- **Run multiple models in one conversation.** Mix Claude, GPT, Gemini, Grok, DeepSeek, OpenRouter models, and your own custom HTTP adapters in the same thread. Each advisor sees the full conversation including the other advisors' responses.
- **Use your own Claude subscription.** Add a Claude subscription advisor alongside API-key advisors, using your own Claude Code installation and sign-in. See [personal subscriptions and permitted use](#personal-subscriptions-and-permitted-use) for setup and restrictions.
- **Refresh the available models.** Discover models from supported providers, retain manually added model IDs, and use bundled fallback lists when discovery is unavailable. Pricing distinguishes unknown costs from known free models.
- **Assign personas.** Each advisor has a persona — Security Engineer, Product Strategist, Devil's Advocate, or any custom persona you create. Personas shape how the model approaches the conversation without changing what model it actually is.
- **Choose how they speak.** Four turn modes: sequential (one after another), parallel (all at once), manual (you pick who responds next), or queue (you stack a planned order).
- **Steer the discussion.** Address advisors by name with `@mentions`, swap personas mid-session (with conversation handoff), call for a vote, or compile the whole discussion into a polished document.
- **Track API spending.** View estimated costs by advisor and set a session budget that stops further turns when reached. In-flight requests can exceed that budget. Subscription usage is labeled separately and is governed by the provider's plan limits.
- **Save and resume discussions.** Sessions preserve the advisor lineup, transcript, document references, existing summaries, budget, and loop settings. Autosave and session-switch guards help keep conversations separate.
- **Manage context automatically.** Long sessions get summarized (compacted) so you don't blow past model context windows. Compaction is a separate cheap-model call so the main advisors never see truncated history.

---

## How it works

### The shared context bus

All advisors read from and write to a single conversation thread. Each message has an identity header — `[You]: ...` for the human, `[Persona Label]: ...` for an advisor — so models can tell who said what. When an advisor responds, its turn becomes part of the thread that the next advisor sees. This is the "boardroom" metaphor: everyone's listening to the same conversation.

### Turn modes

The shared context is the same regardless of turn mode; the difference is *when* each advisor speaks:

- **Sequential** — advisors take turns in order. After your message, advisor 1 responds, then advisor 2 sees both your message and advisor 1's response, and so on. A lone advisor gets a user turn so it waits for you instead of repeatedly answering itself.
- **Parallel** — all advisors respond to your message at the same time, each unaware of the others' responses for that round. Useful for soliciting independent opinions without anchoring.
- **Manual** — you pick who responds next via a queue panel. Good for following up with one specific advisor without triggering everyone.
- **Queue** — you build a planned order ahead of time and the app dispatches it.

You can stop a run, retry a failed advisor, or skip/remove a queued turn. Failed advisors remain available to retry after a run ends. A round with no advisor replies stops instead of looping indefinitely.

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

API turns use reported token usage and available model pricing to estimate cost. Provider pricing takes precedence, with reference estimates where available; unknown pricing is not treated as a known zero price. The budget bar opens a per-advisor cost breakdown. A session budget can stop further turns when reached, but it is not a hard billing limit: in-flight requests and incomplete usage accounting can exceed the displayed amount. Provider invoices remain authoritative.

Claude subscription turns are labeled as subscription usage, not priced as API calls. Consilium does not calculate your remaining subscription allowance or control provider-side extra-usage charges. Check usage, limits, and billing in your provider account.

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

### First-run setup

For API access, the onboarding wizard walks you through adding a provider key, choosing a model, and picking a persona. For Claude subscription access, you can skip API-key setup and follow the steps below. Add advisors in the right sidebar, select a turn mode, and send your first message.

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

## Connect your own accounts

### API keys

Consilium does not host any AI model. You add your own API keys for whichever providers you want to use. Keys are stored locally via Electron's `safeStorage` (OS-level encryption: Keychain on macOS, DPAPI on Windows, kwallet/gnome-keyring on Linux) and never leave your machine except when making the API call to the provider you configured them for.

Supported providers out of the box:

- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- xAI (Grok)
- DeepSeek
- OpenRouter (single key, hundreds of models)
- Custom adapters (any HTTP-based API — configure request/response templates in the Adapter Builder)

### Personal subscriptions and permitted use

**Personal subscriptions may be used only where the respective provider permits the integration, only by the subscription owner for their own use, and in accordance with that provider's current Terms of Service, usage policies, and plan limits.** Do not share credentials, pool or resell subscription access, or use one person's subscription to serve other users. Each person must use their own eligible account.

**Currently supported: Claude subscription through Claude Code in the desktop app.** The other providers listed above currently require API credentials; listing an API provider does not imply support for its consumer subscription.

To connect your own Claude subscription:

1. Install the unmodified Claude Code using [Anthropic's installation instructions](https://code.claude.com/docs/en/setup). Consilium currently requires version **2.1.284 or newer**. On Windows, use the native installer; the npm command shim is not supported by this integration.
2. Run `claude` in a terminal and sign in to your own eligible Claude account through Anthropic's sign-in flow. Consilium does not provide a Claude login form or collect your subscription credentials.
3. In Consilium, add an advisor and select **Claude subscription (Claude Code)**, then a model and persona. Check the displayed sign-in status; use **Recheck** after installing or signing in if needed.
4. Start a text conversation. You can mix subscription advisors with advisors using your own API keys.

Subscription advisors use your local Claude Code installation and never automatically fall back to paid API-key access. They currently support text conversations only: conversations containing file attachments are rejected for these advisors. Compaction model selection currently requires an API-key provider.

Anthropic's current guidance states that `claude -p` and Agent SDK usage draw from subscription limits; eligibility, usage allowances, and billing rules can change. Review the current [Claude plan guidance](https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan), [Claude Code authentication and usage rules](https://code.claude.com/docs/en/legal-and-compliance), and [Anthropic Terms of Service](https://www.anthropic.com/legal/consumer-terms) before connecting. Consilium's integration does not override a provider's terms or authorize unsupported uses.

---

## Status

Active development. Expect rough edges. Issues and PRs welcome.
