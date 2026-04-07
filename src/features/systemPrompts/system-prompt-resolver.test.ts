import { describe, it, expect } from 'vitest'
import {
  resolveAdvisorSystemPrompt,
  resolvePersonaSwitchPromptTemplate,
  substitutePersonaSwitchPlaceholders,
  isValidSystemPromptsState,
  DEFAULT_SYSTEM_PROMPTS_STATE,
} from './system-prompt-resolver'
import {
  BUILT_IN_SYSTEM_PROMPTS,
  BUILT_IN_ADVISOR_PROMPT_ID,
  BUILT_IN_PERSONA_SWITCH_PROMPT_ID,
} from './built-in-system-prompts'
import type { SystemPromptEntry, SystemPromptsState } from './types'

/**
 * Tests for the pure resolution functions that drive the System
 * Prompts pane. These functions decide what string the user's choice
 * (mode + customId) should produce — they're the contract between the
 * pane UI and the rest of the app.
 *
 * No React, no IPC, no store — just inputs and outputs. The full
 * branching matrix (3 modes × 2 reference states × 2 categories) is
 * exercised so a future change to one branch can't silently break
 * another.
 */

const customAdvisor: SystemPromptEntry = {
  id: 'custom_advisor_test',
  category: 'advisor',
  name: 'Test Custom Advisor',
  content: 'CUSTOM ADVISOR CONTENT',
  isBuiltIn: false,
}

const customPersonaSwitch: SystemPromptEntry = {
  id: 'custom_switch_test',
  category: 'persona-switch',
  name: 'Test Custom Switch',
  content: 'CUSTOM SWITCH TEMPLATE: {oldLabel} -> {newLabel}\n{messages}',
  isBuiltIn: false,
}

const builtInAdvisorContent = BUILT_IN_SYSTEM_PROMPTS.find(
  (e) => e.id === BUILT_IN_ADVISOR_PROMPT_ID,
)!.content
const builtInSwitchContent = BUILT_IN_SYSTEM_PROMPTS.find(
  (e) => e.id === BUILT_IN_PERSONA_SWITCH_PROMPT_ID,
)!.content

describe('resolveAdvisorSystemPrompt', () => {
  describe('mode: base', () => {
    it('returns the built-in advisor content', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'base',
      }
      expect(resolveAdvisorSystemPrompt(config, [])).toBe(builtInAdvisorContent)
    })

    it('ignores customId when mode is base', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'base',
        advisorCustomId: customAdvisor.id,
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe(builtInAdvisorContent)
    })
  })

  describe('mode: custom', () => {
    it('returns the custom entry content when found', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'custom',
        advisorCustomId: customAdvisor.id,
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe('CUSTOM ADVISOR CONTENT')
    })

    it('falls back to base when customId is null', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'custom',
        advisorCustomId: null,
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe(builtInAdvisorContent)
    })

    it('falls back to base when customId references a missing entry', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'custom',
        advisorCustomId: 'custom_does_not_exist',
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe(builtInAdvisorContent)
    })

    it('does NOT match an entry from a different category by id', () => {
      // The customs array can hold both categories — make sure the
      // resolver only matches advisor entries when resolving advisor.
      const switchEntryWithSameId: SystemPromptEntry = {
        ...customPersonaSwitch,
        id: 'shared_id',
        category: 'persona-switch',
        content: 'WRONG CATEGORY',
      }
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'custom',
        advisorCustomId: 'shared_id',
      }
      // Only the persona-switch entry exists with this id — must NOT
      // match for advisor resolution. Falls back to base.
      expect(resolveAdvisorSystemPrompt(config, [switchEntryWithSameId])).toBe(builtInAdvisorContent)
    })
  })

  describe('mode: off', () => {
    it('returns empty string', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'off',
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe('')
    })

    it('returns empty string even when a custom entry exists', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        advisorMode: 'off',
        advisorCustomId: customAdvisor.id,
      }
      expect(resolveAdvisorSystemPrompt(config, [customAdvisor])).toBe('')
    })
  })
})

describe('resolvePersonaSwitchPromptTemplate', () => {
  describe('mode: base', () => {
    it('returns the built-in persona-switch template', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        personaSwitchMode: 'base',
      }
      expect(resolvePersonaSwitchPromptTemplate(config, [])).toBe(builtInSwitchContent)
    })
  })

  describe('mode: custom', () => {
    it('returns the custom template when found', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        personaSwitchMode: 'custom',
        personaSwitchCustomId: customPersonaSwitch.id,
      }
      expect(resolvePersonaSwitchPromptTemplate(config, [customPersonaSwitch])).toBe(
        customPersonaSwitch.content,
      )
    })

    it('falls back to base when the custom is missing', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        personaSwitchMode: 'custom',
        personaSwitchCustomId: 'custom_missing',
      }
      expect(resolvePersonaSwitchPromptTemplate(config, [customPersonaSwitch])).toBe(
        builtInSwitchContent,
      )
    })
  })

  describe('mode: off', () => {
    it('returns null', () => {
      const config: SystemPromptsState = {
        ...DEFAULT_SYSTEM_PROMPTS_STATE,
        personaSwitchMode: 'off',
      }
      expect(resolvePersonaSwitchPromptTemplate(config, [customPersonaSwitch])).toBeNull()
    })
  })
})

describe('substitutePersonaSwitchPlaceholders', () => {
  it('substitutes all three placeholders', () => {
    const template = '{oldLabel} -> {newLabel}\n\n{messages}'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: 'Architect',
      newLabel: 'Strategist',
      messages: 'msg1\nmsg2',
    })
    expect(result).toBe('Architect -> Strategist\n\nmsg1\nmsg2')
  })

  it('replaces multiple occurrences of the same placeholder', () => {
    const template = '{oldLabel}: x\n{oldLabel}: y'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: 'A',
      newLabel: 'B',
      messages: '',
    })
    expect(result).toBe('A: x\nA: y')
  })

  it('leaves unknown placeholders as literal text', () => {
    const template = '{oldLabel} {unknownToken} {newLabel}'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: 'A',
      newLabel: 'B',
      messages: '',
    })
    expect(result).toBe('A {unknownToken} B')
  })

  it('handles empty values without crashing', () => {
    const template = '{oldLabel}|{newLabel}|{messages}'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: '',
      newLabel: '',
      messages: '',
    })
    expect(result).toBe('||')
  })

  it('handles a template with no placeholders', () => {
    const template = 'plain text with no tokens'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: 'A',
      newLabel: 'B',
      messages: 'C',
    })
    expect(result).toBe('plain text with no tokens')
  })

  it('does NOT cascade when a value contains another placeholder token', () => {
    // Regression test: a persona named "{newLabel}" used to cause the
    // sequential .replaceAll() implementation to substitute the literal
    // "{newLabel}" produced by the first pass during the second pass.
    // The single-pass regex implementation visits each template token
    // exactly once and never re-scans values.
    const template = 'old={oldLabel}, new={newLabel}'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: '{newLabel}',
      newLabel: 'ActualNew',
      messages: 'irrelevant',
    })
    // The literal "{newLabel}" injected by the oldLabel substitution
    // must survive into the output unchanged — NOT be re-substituted.
    expect(result).toBe('old={newLabel}, new=ActualNew')
  })

  it('does not cascade for {messages} value containing other placeholder tokens', () => {
    const template = '{oldLabel}|{messages}|{newLabel}'
    const result = substitutePersonaSwitchPlaceholders(template, {
      oldLabel: 'A',
      newLabel: 'B',
      messages: '{oldLabel} and {newLabel} both appear',
    })
    expect(result).toBe('A|{oldLabel} and {newLabel} both appear|B')
  })
})

describe('isValidSystemPromptsState', () => {
  it('accepts the default state', () => {
    expect(isValidSystemPromptsState(DEFAULT_SYSTEM_PROMPTS_STATE)).toBe(true)
  })

  it('accepts custom mode with a string id', () => {
    expect(
      isValidSystemPromptsState({
        advisorMode: 'custom',
        advisorCustomId: 'custom_test',
        personaSwitchMode: 'base',
        personaSwitchCustomId: null,
      }),
    ).toBe(true)
  })

  it('rejects unknown mode strings', () => {
    expect(
      isValidSystemPromptsState({
        advisorMode: 'invalid',
        advisorCustomId: null,
        personaSwitchMode: 'base',
        personaSwitchCustomId: null,
      }),
    ).toBe(false)
  })

  it('rejects non-string customId (not null)', () => {
    expect(
      isValidSystemPromptsState({
        advisorMode: 'base',
        advisorCustomId: 42,
        personaSwitchMode: 'base',
        personaSwitchCustomId: null,
      }),
    ).toBe(false)
  })

  it('rejects null/undefined input', () => {
    expect(isValidSystemPromptsState(null)).toBe(false)
    expect(isValidSystemPromptsState(undefined)).toBe(false)
  })

  it('rejects missing fields', () => {
    expect(isValidSystemPromptsState({ advisorMode: 'base' })).toBe(false)
  })
})
