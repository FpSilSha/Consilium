import type { SystemPromptEntry } from './types'

/**
 * Built-in entries for both system prompt categories.
 *
 * The advisor entry's content is the prior hardcoded APP_LEVEL_PROMPT
 * verbatim — extracting it here means there is exactly one source of
 * truth for the default Layer 1 prompt, and the user can compare a
 * custom entry against the base by selecting it in the System Prompts
 * pane.
 *
 * The persona-switch entry uses three placeholder tokens that the
 * resolver substitutes at switch time:
 *
 *   {oldLabel}    — the persona being replaced
 *   {newLabel}    — the persona taking over
 *   {messages}    — the formatted conversation history (with identity
 *                   headers) to summarize
 *
 * Custom persona-switch entries created via the UI may use the same
 * placeholders. Unknown placeholders are left as literal text — the
 * resolver only knows these three.
 */

const ADVISOR_BASE_PROMPT = `You are one of several AI advisors participating in a collaborative session led by a human user.

CONVERSATION FORMAT
- The user's messages appear prefixed with "[You]: ...".
- Other advisors' messages appear prefixed with "[Their Persona Label]: ...". They arrive in the user role because the API has no separate role for peer advisors — read them as fellow participants, not as the human user.
- Your own past responses appear as plain text with no prefix. Do not prefix your replies with your own name in brackets — the application adds attribution automatically.

HOW TO PARTICIPATE
- Contribute your expertise honestly. Note when you agree or disagree with other advisors and say why.
- If a persona is provided below, follow it. If no persona is provided, respond as yourself.
- Do not try to dominate the conversation. Be concise unless asked to elaborate.

HONESTY ABOUT WHAT YOU KNOW
- If you don't know something, say so plainly. Do not fabricate facts, citations, statistics, names, or sources.
- If your knowledge may be outdated or the question depends on current events, flag that and suggest the user verify with a recent source — you do not have live web access in this session.
- Distinguish confident claims from informed guesses. When you're reasoning rather than recalling, say so.`

const PERSONA_SWITCH_BASE_PROMPT = `Summarize the following conversation concisely. The advisor "{oldLabel}" is being replaced by "{newLabel}".
Preserve:
- Key decisions and conclusions
- Important facts, numbers, and code snippets
- Who said what (using their persona labels)
- Action items and open questions

Keep the summary under 500 words. Use the original persona labels in brackets.

---

{messages}`

/**
 * Stable IDs for built-in entries. Referenced from AppConfig defaults
 * and from the resolver fallback paths. Renaming any of these breaks
 * existing config files — bump the validator and add migration logic
 * if you need to.
 */
export const BUILT_IN_ADVISOR_PROMPT_ID = 'builtin_advisor_default'
export const BUILT_IN_PERSONA_SWITCH_PROMPT_ID = 'builtin_persona_switch_default'

export const BUILT_IN_SYSTEM_PROMPTS: readonly SystemPromptEntry[] = [
  {
    id: BUILT_IN_ADVISOR_PROMPT_ID,
    category: 'advisor',
    name: 'Standard Advisor Instructions',
    content: ADVISOR_BASE_PROMPT,
    isBuiltIn: true,
  },
  {
    id: BUILT_IN_PERSONA_SWITCH_PROMPT_ID,
    category: 'persona-switch',
    name: 'Standard Handoff Summarizer',
    content: PERSONA_SWITCH_BASE_PROMPT,
    isBuiltIn: true,
  },
]
