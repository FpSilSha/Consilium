# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**Consilium (Council of Advisors)** — A multi-agent AI orchestration desktop app (Electron) where the user acts as CEO of a virtual boardroom. Multiple AI models participate simultaneously in a shared context, each with configurable provider, model, and persona. Users bring their own API keys.

### Core Concepts

- **Shared Context Bus**: Central conversation thread all agents read/write to, with identity headers (`[Persona Label]: ...`)
- **Turn Modes**: Sequential, Parallel, Manual, Queue — switchable at runtime
- **Personas**: Markdown files defining advisor personality/expertise, 3-layer system prompt architecture
- **Context Compaction**: Hybrid archive+buffer per-agent, auto-triggered at 60-70% context usage
- **Cost Tracking**: Dual strategy — client-side tokenizer estimation + post-response API reconciliation

## Tech Stack

- **Language**: TypeScript (strict mode)
- **Frontend**: React
- **State**: Zustand (partitioned slices per feature)
- **Styling**: Tailwind CSS
- **Desktop**: Electron (primary), Docker (secondary)
- **Streaming**: EventSource / SSE + AbortController
- **Layout**: Three-column dashboard (sidebar, unified chat, advisor panel)
- **Tokenizer**: tiktoken (OpenAI) + per-provider libs

## Architecture — 5-Phase Build

Development follows the decomposition in `council-of-advisors-orchestrator-decomposition.md`:

| Phase | Packages | Description |
|-------|----------|-------------|
| 1 | 1A, 1B, 1C | Foundation — scaffold, keys, persona/theme loaders |
| 2 | 2A, 2B | Core — shared context bus, API orchestration |
| 3 | 3A, 3B, 3C | UI — tiling windows, chat rendering, input bar |
| 4 | 4A, 4B, 4C | Advanced — turn management, compaction, agent interaction |
| 5 | 5A, 5B, 5C | Polish — sessions, export, onboarding |

### Collision Rules

- File ownership is exclusive per work package
- Zustand store partitioned by slice — no cross-slice writes
- `/src/types/` is append-only during a phase
- Shared interfaces frozen at phase gates
- Integration testing at phase gates, unit tests within packages

## Key Directories

```
Consilium/
├── CLAUDE.md
├── council-of-advisors-project-spec-v1.1.md
├── council-of-advisors-orchestrator-decomposition.md
├── electron/              # Electron main process
├── src/
│   ├── app/               # React app shell, routing
│   ├── store/             # Zustand store (sliced by feature)
│   ├── types/             # Shared TypeScript interfaces
│   ├── services/          # API adapters, tokenizer
│   └── features/          # Feature modules
│       ├── keys/          # 1B: Key management
│       ├── personas/      # 1C: Persona loader
│       ├── themes/        # 1C: Theme loader
│       ├── windows/       # 3A: Tiling window manager
│       ├── chat/          # 3B: Chat rendering
│       ├── input/         # 3C: Input bar
│       ├── modelSelector/ # 3C: Model selector
│       ├── turnManager/   # 4A: Turn modes
│       ├── queueSidebar/  # 4A: Queue sidebar
│       ├── compaction/    # 4B: Context compaction
│       ├── agentInteraction/ # 4C: Agent-to-agent
│       ├── voting/        # 4C: Voting
│       ├── sessions/      # 5A: Session save/resume
│       ├── fileIO/        # 5A: File I/O sandbox
│       ├── export/        # 5B: Export
│       ├── onboarding/    # 5C: Onboarding wizard
│       ├── errorHandling/ # 5C: Error handling
│       └── budget/        # 5C: Budget enforcement
├── personas/              # Built-in persona .md files
├── themes/                # Theme JSON files
└── public/                # Static assets
```

## Conventions

- Immutability — never mutate objects or arrays
- Many small files (200-400 lines, 800 max)
- Conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`
- TDD: write tests first, 80%+ coverage target
- Validate inputs at system boundaries
- Keys NEVER in logs, exports, LLM context, or displayed in full
