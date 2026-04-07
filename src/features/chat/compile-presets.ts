/**
 * Compile Document presets.
 *
 * Each preset is a full prompt template that shapes the document the
 * model produces. The user picks one per compile (or sets a global
 * default via Edit → Compile Document Settings). The preset prompt
 * replaces the prior hardcoded `DEFAULT_COMPILE_PROMPT` — presets are
 * the new source of compile instructions.
 *
 * Design principles applied across all presets:
 * - Sections are SUGGESTED, not mandatory. Models are told to skip
 *   sections that don't apply to the actual conversation. This kills
 *   the "forced empty section" problem from the old prompt.
 * - Attribution is OPT-IN and context-dependent. Models are told to
 *   attribute specific points only when attribution is meaningful to
 *   understanding them, and to synthesize otherwise. This kills the
 *   "quote-the-minutes" feel on casual chats.
 * - Each preset has its own tone and length hint, so the "length
 *   setting" concept is folded into the preset choice (a brief preset
 *   is short by construction, an essay preset is long by construction).
 * - No fabrication. Every preset ends with a reminder to stay within
 *   what the conversation actually contains, so the COMPILE_SYSTEM_PROMPT
 *   honesty rules are reinforced at the instruction layer too.
 */

export interface CompilePreset {
  readonly id: string
  /** Short label for the dropdown ("Comprehensive Report"). */
  readonly label: string
  /** One-line description shown below the dropdown selection. */
  readonly description: string
  /**
   * The full instruction text sent as the final user message in the
   * compile API call. Does NOT include the conversation itself — the
   * conversation arrives as the preceding messages in the API payload.
   */
  readonly prompt: string
}

export const COMPILE_PRESETS: readonly CompilePreset[] = [
  {
    id: 'comprehensive',
    label: 'Comprehensive Report',
    description: 'Structured document covering all substantive topics from the conversation.',
    prompt: `Produce a comprehensive markdown document capturing the substance of the conversation above.

Use these sections AS SUGGESTIONS — include any that apply to the actual conversation, skip any that don't. Do not invent content to fill sections the conversation didn't touch:

- Executive summary (2-4 sentences)
- Key decisions or conclusions reached
- Action items or next steps (if any)
- Technical details, specifications, or code (if discussed)
- Disagreements or open questions (if any)
- Other notable points that don't fit the above

Format with clear markdown headings, lists where appropriate, and fenced code blocks for any code. Tables when comparing options.

Attribution: attribute specific points to a participant ONLY when knowing who raised them is important to understanding the point (e.g., a named recommendation, a dissenting view, a claim tied to a person's expertise). Otherwise synthesize the content directly without "[X said]" framing.

Stay strictly within what the conversation actually contains. Do not introduce new facts, claims, or conclusions.`,
  },
  {
    id: 'brief',
    label: 'Brief Summary',
    description: 'Short narrative summary — a few paragraphs, no headings or sections.',
    prompt: `Produce a brief narrative summary of the conversation above in markdown.

Target length: 3 to 6 short paragraphs. No section headings, no bullet lists unless a list is the only way to convey something clearly. Write in flowing prose.

Capture:
- What the conversation was about
- The main points of substance (decisions, insights, conclusions)
- Any significant disagreement or unresolved question, briefly noted

Do not attribute specific points to participants. Synthesize the content into a single coherent narrative. Do not introduce information the conversation didn't contain.

Optimize for a reader who wants the gist in under a minute, not a complete record.`,
  },
  {
    id: 'minutes',
    label: 'Meeting Minutes',
    description: 'Structured minutes with attributed decisions, action items, and open questions.',
    prompt: `Produce meeting-minutes-style markdown from the conversation above.

Use these sections (include only those that apply — skip empty ones):

## Participants
List the human user and the AI advisors who contributed, by the names that appear in the conversation's identity headers.

## Topics Discussed
Bullet list of the substantive topics covered, in the order they appeared.

## Decisions
Numbered list of concrete decisions reached. Attribute each decision to the participant(s) who proposed or agreed to it.

## Action Items
Numbered list of next steps. For each, note who (if anyone) owns it.

## Open Questions
Unresolved questions or points of disagreement, with who raised them.

## Notes
Anything substantive that doesn't fit the sections above.

Attribution IS important in this preset — this is a record-keeping format. Reference participants by their exact identity header names. Stay strictly within what the conversation actually contains.`,
  },
  {
    id: 'essay',
    label: 'Essay',
    description: 'Long-form flowing prose — a single synthesized piece, no sections or attribution.',
    prompt: `Produce a long-form essay in markdown that synthesizes the substance of the conversation above into a single coherent piece.

Format:
- Start with a title (# level)
- Body as flowing paragraphs — no subheadings unless the material genuinely requires structural breaks
- Code blocks ONLY if the conversation contained code that belongs in the essay
- No bullet lists unless one is the only way to convey a specific point

Voice: third-person, neutral, essayistic. Write as if you are an author distilling a transcript into an essay for a reader who was not present. Do NOT attribute points to participants — merge their contributions into a single synthesized voice.

Include:
- The central theme or question the conversation explored
- The strongest insights, arguments, or conclusions that emerged
- Nuance where the participants disagreed or where the question remained open

Stay strictly within what the conversation contains. Do not add external context, examples, or citations. Do not invent a resolution to disagreements that didn't resolve.

Length should be proportional to the conversation's substance, not its raw length.`,
  },
  {
    id: 'qa-digest',
    label: 'Q&A Digest',
    description: 'Question-and-answer format, preserving the conversational back-and-forth.',
    prompt: `Produce a Q&A-format digest in markdown from the conversation above.

For each substantive question or topic the user raised:

## <rephrase the question as a clear heading>
<distilled answer synthesized from the participants' responses>

Guidelines:
- Group related back-and-forth into a single Q&A even if the conversation touched the topic multiple times.
- Drop questions that were never substantively answered, OR note them briefly in a final "Open Questions" section.
- Distill and clean up the answers — do NOT copy responses verbatim. Remove tangents and filler.
- Attribute a specific answer to a participant ONLY when multiple advisors gave different answers and the distinction matters.
- Preserve code, specific numbers, and named technical terms exactly.

Skip chitchat, meta-discussion about the conversation itself, or off-topic exchanges. Focus on substance. Stay strictly within what the conversation actually contains.`,
  },
]

/**
 * Canonical default preset ID. Imported by `documentsSlice.ts` for the
 * Zustand initial value.
 *
 * IMPORTANT: this value is also DUPLICATED as a literal string in
 * `electron/main/index.ts` (`DEFAULT_CONFIG.compilePresetId = 'comprehensive'`)
 * because the main process cannot import from the renderer module tree.
 * If you rename this constant, update the main-process default too. The
 * startup validator in `useStartupAutoCompaction.ts` catches mismatches by
 * rejecting unknown preset IDs and falling back to the default + cleaning
 * up disk, so a stale value self-corrects on the first launch — but the
 * one-launch divergence is avoidable by updating both sites at once.
 */
export const DEFAULT_PRESET_ID = 'comprehensive'

/**
 * Look up a preset by ID. Returns the default preset if the ID is unknown
 * (e.g., a stale value from config.json after presets are renamed or
 * removed in a future release — graceful degradation, no crash).
 */
export function getPresetById(id: string): CompilePreset {
  const found = COMPILE_PRESETS.find((p) => p.id === id)
  if (found != null) return found
  // Fallback: the default preset is guaranteed to exist.
  const fallback = COMPILE_PRESETS.find((p) => p.id === DEFAULT_PRESET_ID)
  if (fallback == null) {
    // Shouldn't happen — DEFAULT_PRESET_ID is hardcoded and the array
    // is a frozen readonly const. If it does, return the first preset.
    return COMPILE_PRESETS[0]!
  }
  return fallback
}

/**
 * True if the given string matches a known preset ID. Used by config
 * validation — rejects unknown strings rather than silently mapping
 * them to the default, so corrupted config.json is visible to the
 * startup loader.
 */
export function isKnownPresetId(id: unknown): id is string {
  return typeof id === 'string' && COMPILE_PRESETS.some((p) => p.id === id)
}
