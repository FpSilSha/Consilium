import { describe, it, expect } from 'vitest'
import { computeDisplayLabels, getDisplayLabel } from './display-labels'
import type { AdvisorWindow } from '@/types'

// ---------------------------------------------------------------------------
// Fixture helper
// ---------------------------------------------------------------------------

function makeWindow(id: string, personaLabel: string): AdvisorWindow {
  return {
    id,
    personaLabel,
    provider: 'anthropic',
    keyId: 'key1',
    model: 'claude-opus-4-6',
    personaId: 'p1',
    accentColor: '#fff',
    runningCost: 0,
    isStreaming: false,
    streamContent: '',
    error: null,
    isCompacted: false,
    compactedSummary: null,
    bufferSize: 10,
  }
}

// ---------------------------------------------------------------------------
// computeDisplayLabels
// ---------------------------------------------------------------------------

describe('computeDisplayLabels', () => {
  describe('single advisor per persona', () => {
    it('returns the bare persona label when no duplicates exist', () => {
      const windows = {
        w1: makeWindow('w1', 'Security Engineer'),
        w2: makeWindow('w2', 'Finance Advisor'),
        w3: makeWindow('w3', 'Legal'),
      }
      const order = ['w1', 'w2', 'w3']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('w1')).toBe('Security Engineer')
      expect(labels.get('w2')).toBe('Finance Advisor')
      expect(labels.get('w3')).toBe('Legal')
    })
  })

  describe('multiple advisors with the same persona', () => {
    it('numbers both entries sequentially when two windows share a persona label', () => {
      const windows = {
        w1: makeWindow('w1', 'Security Engineer'),
        w2: makeWindow('w2', 'Security Engineer'),
      }
      const order = ['w1', 'w2']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('w1')).toBe('Security Engineer 1')
      expect(labels.get('w2')).toBe('Security Engineer 2')
    })

    it('numbers three duplicate entries 1, 2, 3 in panel order', () => {
      const windows = {
        a: makeWindow('a', 'CTO'),
        b: makeWindow('b', 'CTO'),
        c: makeWindow('c', 'CTO'),
      }
      const order = ['a', 'b', 'c']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('a')).toBe('CTO 1')
      expect(labels.get('b')).toBe('CTO 2')
      expect(labels.get('c')).toBe('CTO 3')
    })
  })

  describe('mixed: some duplicates, some unique', () => {
    it('numbers only the duplicate personas, leaving unique ones unsuffixed', () => {
      const windows = {
        w1: makeWindow('w1', 'Security Engineer'),
        w2: makeWindow('w2', 'Finance Advisor'),
        w3: makeWindow('w3', 'Security Engineer'),
        w4: makeWindow('w4', 'Legal'),
      }
      const order = ['w1', 'w2', 'w3', 'w4']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('w1')).toBe('Security Engineer 1')
      expect(labels.get('w2')).toBe('Finance Advisor')
      expect(labels.get('w3')).toBe('Security Engineer 2')
      expect(labels.get('w4')).toBe('Legal')
    })
  })

  describe('panel order determines numbering', () => {
    it('assigns numbers based on window order, not insertion order of the windows record', () => {
      const windows = {
        w1: makeWindow('w1', 'Analyst'),
        w2: makeWindow('w2', 'Analyst'),
      }
      // Reversed order: w2 first means w2 becomes "Analyst 1"
      const order = ['w2', 'w1']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('w2')).toBe('Analyst 1')
      expect(labels.get('w1')).toBe('Analyst 2')
    })
  })

  describe('renumbering after deletion', () => {
    it('renumbers remaining windows as if the deleted one never existed', () => {
      // Start with three "CTO" windows; simulate deleting the middle one
      const windows = {
        w1: makeWindow('w1', 'CTO'),
        w3: makeWindow('w3', 'CTO'),
      }
      // w2 has been deleted — only w1 and w3 remain in the order
      const order = ['w1', 'w3']
      const labels = computeDisplayLabels(order, windows)

      // There are now only two CTOs — numbered 1 and 2, not 1 and 3
      expect(labels.get('w1')).toBe('CTO 1')
      expect(labels.get('w3')).toBe('CTO 2')
    })
  })

  describe('empty window order', () => {
    it('returns an empty map when window order is empty', () => {
      const windows = { w1: makeWindow('w1', 'Security Engineer') }
      const labels = computeDisplayLabels([], windows)
      expect(labels.size).toBe(0)
    })
  })

  describe('window order references an id not present in the windows record', () => {
    it('skips missing ids gracefully without throwing', () => {
      const windows = { w1: makeWindow('w1', 'Strategist') }
      // w2 is in the order but not in the windows record
      const order = ['w1', 'w2']
      const labels = computeDisplayLabels(order, windows)

      expect(labels.get('w1')).toBe('Strategist')
      expect(labels.has('w2')).toBe(false)
    })
  })
})

// ---------------------------------------------------------------------------
// getDisplayLabel
// ---------------------------------------------------------------------------

describe('getDisplayLabel', () => {
  it('returns the correct numbered label for a window with duplicate personas', () => {
    const windows = {
      w1: makeWindow('w1', 'Finance Advisor'),
      w2: makeWindow('w2', 'Finance Advisor'),
    }
    const order = ['w1', 'w2']

    expect(getDisplayLabel('w1', order, windows)).toBe('Finance Advisor 1')
    expect(getDisplayLabel('w2', order, windows)).toBe('Finance Advisor 2')
  })

  it('returns the bare persona label when the window has a unique persona', () => {
    const windows = {
      w1: makeWindow('w1', 'CTO'),
      w2: makeWindow('w2', 'CFO'),
    }
    const order = ['w1', 'w2']

    expect(getDisplayLabel('w1', order, windows)).toBe('CTO')
    expect(getDisplayLabel('w2', order, windows)).toBe('CFO')
  })

  it('falls back to personaLabel from the windows record when windowId is not in the order', () => {
    const windows = { w1: makeWindow('w1', 'Strategist') }
    // w1 is not in the order — computeDisplayLabels won't include it,
    // so getDisplayLabel falls back to windows[windowId].personaLabel
    const order: string[] = []

    expect(getDisplayLabel('w1', order, windows)).toBe('Strategist')
  })

  it('returns "Unknown" when the windowId is absent from both the order and the windows record', () => {
    const windows = { w1: makeWindow('w1', 'Strategist') }
    const order = ['w1']

    expect(getDisplayLabel('missing-id', order, windows)).toBe('Unknown')
  })
})
