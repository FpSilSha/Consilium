# Council of Advisors — Orchestrator / Subagent Decomposition Analysis

**Date:** March 11, 2026  
**Source:** `council-of-advisors-project-spec-v1_1.md`  
**Purpose:** Determine whether the spec is structured for orchestrator-driven parallel development by subagents, and if not, propose a decomposition that avoids phase collisions.

---

## Assessment: Is This Spec Already Decomposed for Subagents?

**No.** The spec is written as a monolithic product requirements document organized by *feature area* (22 sections), not by *work unit* or *build phase*. It's excellent as a human-readable PRD, but an orchestrator assigning this to subagents would face several problems:

1. **Cross-cutting dependencies are implicit.** For example, the Shared Context Bus (§6) is referenced by Turn Management (§8), Agent-to-Agent Interaction (§11), Voting (§12), Context Compaction (§7), and Export (§16) — but no dependency graph is stated.
2. **No build order or phase gates.** There's no indication of what must exist before something else can start. A subagent assigned "Voting" (§12) would need the Shared Context Bus, the Queue Sidebar, and the API layer to already be in place.
3. **Shared surface areas create collision risk.** Multiple features touch the same files/components: the window header, the sidebar, the input bar, the Zustand store, and the API orchestration layer. Two subagents working simultaneously on Turn Management and Agent-to-Agent Interaction would likely produce merge conflicts.

---

## Proposed Decomposition: 5 Phases, 12 Work Packages

The strategy below groups work into **phases with hard gates** — no phase starts until its predecessor is accepted. Within each phase, work packages are assigned to subagents that can run **in parallel without file collisions**, because they touch different directories/components.

---

### Phase 1 — Foundation (No UI, No API Calls)

Everything in this phase is infrastructure that every later feature depends on. No parallelism risk because each package owns distinct files.

| Package | Spec Sections | Scope | Output (files/modules) |
|---------|--------------|-------|----------------------|
| **1A: Project Scaffold & Config** | §19, §20 | Electron shell, React + TypeScript + Tailwind skeleton, Zustand store boilerplate, directory structure (`/input`, `/output`, `/sessions`, `/personas`, `/themes`), `.env` loader | `/electron/`, `/src/app/`, `/src/store/`, `package.json`, `tsconfig.json` |
| **1B: Key Management** | §2 | Key auto-detection (prefix parser), key CRUD in `.env`, masked display, key test (lightweight API ping), key security rules (redaction regex) | `/src/features/keys/` |
| **1C: Persona & Theme Loaders** | §10 (file management only), §4 (theme file system only) | Persona `.md` file scanner/parser, theme JSON/YAML loader, folder watch/refresh, fallback defaults, "Open Folder" OS bridge | `/src/features/personas/`, `/src/features/themes/` |

**Collision risk:** None. 1A owns the shell; 1B owns `/features/keys/`; 1C owns `/features/personas/` and `/features/themes/`. No shared surfaces.

**Phase gate:** The app launches, loads keys from `.env`, scans personas and themes, and renders an empty shell window. No API calls yet.

---

### Phase 2 — Core Communication Layer

This phase builds the two systems everything else depends on: the Shared Context Bus and the API call pipeline. These two packages are tightly related but can be split if their interface contract is defined upfront.

| Package | Spec Sections | Scope | Output |
|---------|--------------|-------|--------|
| **2A: Shared Context Bus** | §6 | Central thread data structure (Zustand slice), message append/read, identity header formatting (`[Persona Label]: ...`), `@mention` stripping, source-of-truth rules | `/src/store/contextBus.ts`, `/src/types/message.ts` |
| **2B: API Orchestration Layer** | §2 (key usage), §5 (model selection), §13 (cost tracking basics) | Per-provider API adapters (Anthropic, OpenAI, Google, xAI, DeepSeek), streaming via SSE/EventSource, AbortController integration, token counting (tiktoken + character fallback), cost accumulation per call | `/src/services/api/`, `/src/services/tokenizer/` |

**Collision risk:** Low, but these two must agree on a message format interface (`Message` type with role, content, identity header, timestamp, cost metadata). Define the `Message` type in Phase 1A's types directory and both subagents consume it.

**Phase gate:** A hardcoded test can send a user message, route it through the context bus, call one provider's API with streaming, and append the response back to the bus with cost metadata.

---

### Phase 3 — Window System & Basic UI

Now the visual layer. This phase builds what the user actually sees and interacts with, on top of the Phase 2 data layer.

| Package | Spec Sections | Scope | Output |
|---------|--------------|-------|--------|
| **3A: Tiling Window Manager** | §3 | react-mosaic (or equivalent) integration, add/remove/split panes, draggable dividers, window header (provider, model, persona, cost, close button), close confirmation dialog | `/src/features/windows/` |
| **3B: Chat Rendering (Dual Mode)** | §4 (rendering modes), §4 (rendering performance) | Terminal mode renderer, GUI mode renderer, mode toggle, virtualized list (react-window or similar), locked dimensions during streaming, isolated scroll positions per window, per-agent accent colors | `/src/features/chat/` |
| **3C: Shared Input Bar & Model Selector** | §3 (input bar), §5 (per-window dropdown) | Full-width input bar, message submission to context bus, per-window model dropdown (populated from key ↔ provider mapping), mid-session model switching | `/src/features/input/`, `/src/features/modelSelector/` |

**Collision risk:** Moderate — 3A and 3B both render inside window panes. Resolution: 3A owns the window *shell* (header, chrome, split controls). 3B owns the window *content area* (message list). 3A exposes a `<WindowContent />` slot; 3B fills it. They never edit the same component file.

**Phase gate:** The user can open multiple advisor windows, select models, type messages, see them appear in all windows, get streamed responses rendered in both UI modes, and resize/split panes.

---

### Phase 4 — Turn Management & Advanced Features

This is where the interaction model gets complex. These packages build on the Phase 3 UI but each owns distinct behavior and UI surfaces.

| Package | Spec Sections | Scope | Output |
|---------|--------------|-------|--------|
| **4A: Turn Modes & Queue Sidebar** | §8, §9 | All four turn modes (sequential, parallel, manual, queue), queue sidebar (drag-and-drop card list, active/on-deck/errored states), user card, duplicate cards, skip/pause/reorder, Stop All button | `/src/features/turnManager/`, `/src/features/queueSidebar/` |
| **4B: Context Compaction** | §7, §6 (main thread compaction) | Per-agent compaction trigger (60-70% context usage), archive + buffer hybrid mechanism, configurable buffer size, manual "Compact Now" button, main thread compaction with warning dialog, visual indicator | `/src/features/compaction/` |
| **4C: Agent-to-Agent & Voting** | §11, §12 | `@mention` routing logic, single-turn and N-turn exchanges, repeat button, 10-round hard ceiling, "Call for Vote" broadcast, vote parsing (YAY/NAY/ABSTAIN), tally display panel | `/src/features/agentInteraction/`, `/src/features/voting/` |

**Collision risk:** 4A and 4C both affect *when* and *how* API calls are dispatched, but they control different triggers. 4A manages the queue execution loop; 4C hooks into it for agent-to-agent routing. To avoid collision: 4A exposes a `dispatchTurn(agentId)` function and an `onTurnComplete` callback. 4C calls `dispatchTurn` with its own routing logic. Neither subagent modifies the API orchestration layer directly — they both go through the Phase 2B interface.

4B is fully isolated — it only reads from the context bus and writes compacted views back to per-agent state.

**Phase gate:** A user can run a full multi-agent session using all four turn modes, trigger compaction, run an agent-to-agent exchange, and call a vote.

---

### Phase 5 — Persistence, Export & Polish

Everything that wraps up the experience. These are fully independent.

| Package | Spec Sections | Scope | Output |
|---------|--------------|-------|--------|
| **5A: Session Save/Resume & File I/O** | §14, §15 | `.council` file schema (JSON), save/load cycle, per-session `/input` and `/output` subdirectories, file drop handling (copy to `/input/{session-id}/`), output sandboxing, resume with graceful degradation (missing persona, missing key), path privacy enforcement | `/src/features/sessions/`, `/src/features/fileIO/` |
| **5B: Export** | §16 | Markdown and PDF export, message metadata (timestamp, agent, model, persona), change annotations (dividers for model/persona switches, compaction events), tech spec generation artifact flow | `/src/features/export/` |
| **5C: Onboarding, Error Handling & Budget** | §17, §18, §13 (budget enforcement) | Setup wizard (first-launch key + model + persona), ToS disclaimer, replay tour, per-window error rendering + retry, errored queue zone integration, token budget (80% warning, 100% halt with AbortController), budget UI | `/src/features/onboarding/`, `/src/features/errorHandling/`, `/src/features/budget/` |

**Collision risk:** None. Each package owns distinct feature directories and distinct UI surfaces.

**Phase gate:** The user can save a session, quit, relaunch, resume it, export a full log, and experience the onboarding flow. Budget limits correctly halt all API calls.

---

## Dependency Graph (Summary)

```
Phase 1 ─── 1A (Scaffold) ─┐
         ├─ 1B (Keys)       ├──▶ Phase Gate 1
         └─ 1C (Personas)  ─┘
                                    │
Phase 2 ─── 2A (Context Bus) ─┐    │
         └─ 2B (API Layer)   ─┤◀───┘
                               ├──▶ Phase Gate 2
                               │
Phase 3 ─── 3A (Windows)    ─┐│
         ├─ 3B (Chat UI)     ├┤◀───┘
         └─ 3C (Input/Model) ─┘
                               ├──▶ Phase Gate 3
                               │
Phase 4 ─── 4A (Turn Mgmt)  ─┐│
         ├─ 4B (Compaction)   ├┤◀───┘
         └─ 4C (Agent Intxn) ─┘
                               ├──▶ Phase Gate 4
                               │
Phase 5 ─── 5A (Sessions)   ─┐│
         ├─ 5B (Export)       ├┤◀───┘
         └─ 5C (Onboarding)  ─┘
                               └──▶ Phase Gate 5 (Ship)
```

---

## Collision Prevention Rules for the Orchestrator

1. **File ownership is exclusive.** Each work package lists its output directories. No two packages in the same phase may write to the same directory. If a subagent needs to modify a file outside its directory, it must declare the dependency and the orchestrator serializes that work.

2. **Shared interfaces are defined at the phase gate, not mid-phase.** Before Phase N+1 starts, the orchestrator freezes the TypeScript interfaces exposed by Phase N packages. Subagents in Phase N+1 code against those interfaces, not against implementation details.

3. **The Zustand store is partitioned by slice.** Each feature owns its own slice (e.g., `contextBusSlice`, `windowSlice`, `queueSlice`, `compactionSlice`). The root store composes slices. No subagent directly modifies another feature's slice — it dispatches actions through the owning slice's API.

4. **The `/src/types/` directory is append-only during a phase.** Any subagent can add new types. No subagent can modify an existing type without orchestrator approval (which triggers a cross-package review).

5. **Integration testing happens at phase gates, not within phases.** Individual subagents write unit tests for their package. The orchestrator runs integration tests at each gate to verify cross-package contracts.

---

## What Each Subagent Receives

For each work package, the orchestrator should provide:

- The relevant spec sections (extracted verbatim, not summarized)
- The frozen interfaces from prior phases (TypeScript `.d.ts` files)
- The directory it owns (and a rule: do not write outside it)
- The phase gate acceptance criteria (what must be demonstrably working)
- A list of what it can import from other packages (read-only dependencies)

---

## Sections Not Assigned to Subagents

These spec sections are **orchestrator-level concerns**, not subagent work:

| Section | Why It's Orchestrator-Level |
|---------|---------------------------|
| §19 Distribution (Electron/Docker builds) | CI/CD pipeline configuration, not feature code |
| §20 Tech Stack | Already resolved — informs all packages, not a build task |
| §21 Stretch Goals | Post-iteration-1, excluded from this decomposition |
| §22 Open Questions | Must be resolved by the orchestrator before assigning Phase 2+ |

---

*This decomposition turns a 22-section monolithic PRD into 15 parallelizable work packages across 5 sequential phases, with explicit collision boundaries and gate criteria.*
