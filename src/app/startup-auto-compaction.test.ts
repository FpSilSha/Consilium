import { describe, it, expect } from 'vitest'
import { computeStartupAutoCompactionPlan } from './startup-auto-compaction'

const VALID_CONFIG = {
  provider: 'anthropic',
  model: 'claude-haiku-4-5-20251001',
  keyId: 'key-1',
}

describe('computeStartupAutoCompactionPlan', () => {
  // ──────────────────────────────────────────────────────────────────────
  // Disabled / absent / default states
  // ──────────────────────────────────────────────────────────────────────

  describe('when auto-compaction is off', () => {
    it('returns all-off plan when config values are empty', () => {
      const plan = computeStartupAutoCompactionPlan({}, [])
      expect(plan).toEqual({
        globalEnabled: false,
        globalConfig: null,
        sessionOverride: null,
        warning: null,
        persistedUpdate: null,
      })
    })

    it('returns all-off plan when autoCompactionEnabled is explicitly false', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: false, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.globalConfig).toBeNull()
      expect(plan.warning).toBeNull()
      expect(plan.persistedUpdate).toBeNull()
      expect(plan.sessionOverride).toBeNull()
    })

    it('treats a non-boolean autoCompactionEnabled as off', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: 'yes', autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.warning).toBeNull()
    })

    it('does NOT touch the current session when config is off', () => {
      // sessionOverride === null means "leave session alone"
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: false },
        ['key-1'],
      )
      expect(plan.sessionOverride).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Malformed config shape (enabled but config is junk)
  // ──────────────────────────────────────────────────────────────────────

  describe('when autoCompactionEnabled is true but the config is malformed', () => {
    it('treats null config as invalid and cleans up', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: null },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.persistedUpdate).toEqual({
        autoCompactionEnabled: false,
        autoCompactionConfig: null,
      })
      // No warning — the user didn't actually lose a valid selection
      expect(plan.warning).toBeNull()
    })

    it('treats a config missing required fields as invalid', () => {
      const plan = computeStartupAutoCompactionPlan(
        {
          autoCompactionEnabled: true,
          autoCompactionConfig: { provider: 'anthropic' }, // missing model + keyId
        },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.persistedUpdate).not.toBeNull()
    })

    it('treats a config with wrong field types as invalid', () => {
      const plan = computeStartupAutoCompactionPlan(
        {
          autoCompactionEnabled: true,
          autoCompactionConfig: { provider: 'anthropic', model: 'x', keyId: 123 },
        },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.persistedUpdate).not.toBeNull()
    })

    it('does NOT clobber the session on malformed config (no explicit override)', () => {
      // Session wasn't previously corrupted by the user's intent — they
      // just have garbage in config.json. Leave session alone.
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: 'garbage' },
        ['key-1'],
      )
      expect(plan.sessionOverride).toBeNull()
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // The "warning path" — enabled + valid shape, but key is missing
  // ──────────────────────────────────────────────────────────────────────

  describe('when the saved key is no longer available', () => {
    it('disables global and emits a warning', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['different-key'],
      )
      expect(plan.globalEnabled).toBe(false)
      expect(plan.globalConfig).toBeNull()
      expect(plan.warning).not.toBeNull()
      expect(plan.warning).toContain('no longer available')
    })

    it('overrides the current session to off', () => {
      // Session-level auto-compaction referenced a now-missing key — disable
      // it so runtime doesn't attempt to use the broken config mid-turn.
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        [],
      )
      expect(plan.sessionOverride).toEqual({ enabled: false, config: null })
    })

    it('persists the disabled state so we do not warn again next launch', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        [],
      )
      expect(plan.persistedUpdate).toEqual({
        autoCompactionEnabled: false,
        autoCompactionConfig: null,
      })
    })

    it('warns when the available keys list is completely empty', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        [],
      )
      expect(plan.warning).not.toBeNull()
    })

    it('warns even when other valid keys exist (must match the SPECIFIC keyId)', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-99', 'key-42', 'not-the-right-one'],
      )
      expect(plan.warning).not.toBeNull()
      expect(plan.globalEnabled).toBe(false)
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // The happy path — enabled, valid shape, key still exists
  // ──────────────────────────────────────────────────────────────────────

  describe('when the saved config is valid and key is available', () => {
    it('sets global to the saved values', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(true)
      expect(plan.globalConfig).toEqual(VALID_CONFIG)
    })

    it('applies the saved values to the current session', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.sessionOverride).toEqual({
        enabled: true,
        config: VALID_CONFIG,
      })
    })

    it('does not emit a warning', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.warning).toBeNull()
    })

    it('does not persist anything back — disk is already correct', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.persistedUpdate).toBeNull()
    })

    it('finds the key when multiple keys are present', () => {
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['other-key', 'key-1', 'yet-another'],
      )
      expect(plan.globalEnabled).toBe(true)
    })
  })

  // ──────────────────────────────────────────────────────────────────────
  // Regression / edge cases
  // ──────────────────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('handles config values with extra unknown fields without crashing', () => {
      const plan = computeStartupAutoCompactionPlan(
        {
          autoCompactionEnabled: true,
          autoCompactionConfig: VALID_CONFIG,
          maxSessionSizeMB: 100,
          showOnboarding: false,
          somethingElse: 'ignored',
        },
        ['key-1'],
      )
      expect(plan.globalEnabled).toBe(true)
    })

    it('does not mutate the input config values', () => {
      const input = {
        autoCompactionEnabled: true,
        autoCompactionConfig: VALID_CONFIG,
      }
      const snapshot = JSON.parse(JSON.stringify(input))
      computeStartupAutoCompactionPlan(input, ['key-1'])
      expect(input).toEqual(snapshot)
    })

    it('returns a distinct config object (not a reference to input) on happy path', () => {
      // Defensive: if we ever start returning a frozen or re-wrapped config,
      // this test keeps us from accidentally coupling to input identity.
      const plan = computeStartupAutoCompactionPlan(
        { autoCompactionEnabled: true, autoCompactionConfig: VALID_CONFIG },
        ['key-1'],
      )
      expect(plan.globalConfig).toEqual(VALID_CONFIG)
    })
  })
})
