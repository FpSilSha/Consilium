import { describe, it, expect } from 'vitest'
import { createRedactor, emailTerms, sensitivePathVariants, type RedactionTerms } from './redactor'

const EMAIL = 'someone.person@example.com'
const NONE: RedactionTerms = { exact: [], words: [] }

function stream(terms: RedactionTerms, chunks: readonly string[]): { text: string; parts: string[] } {
  const redactor = createRedactor(terms)
  const parts = chunks.map((c) => redactor.push(c))
  parts.push(redactor.flush())
  return { text: parts.join(''), parts }
}

function chunked(text: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size))
  return chunks
}

describe('createRedactor: exact terms', () => {
  it('removes a term inside one chunk, case-insensitively', () => {
    expect(stream({ exact: [EMAIL], words: [] }, [`You are ${EMAIL.toUpperCase()}, right?`]).text).toBe('You are [redacted], right?')
  })

  it('removes every occurrence of every term, longest first', () => {
    const terms = { exact: ['C:\\Users\\Example', 'C:\\Users\\Example\\Temp\\x'], words: [] }
    expect(stream(terms, ['a C:\\Users\\Example\\Temp\\x b C:\\users\\example c']).text).toBe('a [redacted] b [redacted] c')
  })

  it('holds back only a short tail and releases everything on flush', () => {
    const redactor = createRedactor({ exact: [EMAIL], words: [] })
    const out = redactor.push('x'.repeat(100))
    expect(out.length).toBe(100 - (EMAIL.length - 1))
    expect(out + redactor.flush()).toBe('x'.repeat(100))
  })

  it('passes text straight through when there is nothing to redact', () => {
    const redactor = createRedactor(NONE)
    expect(redactor.push('hello')).toBe('hello')
    expect(redactor.flush()).toBe('')
  })

  it('ignores terms too short to redact safely', () => {
    expect(stream({ exact: ['C:', 'ab'], words: ['bob'] }, ['C: ab bob']).text).toBe('C: ab bob')
  })

  it('redacts one-off strings such as error messages', () => {
    expect(createRedactor({ exact: [EMAIL], words: [] }).redact(`auth failed for ${EMAIL}`)).toBe('auth failed for [redacted]')
  })

  it('matches whole-string redaction for any chunking (randomised)', () => {
    const terms = { exact: [EMAIL, 'C:\\Users\\Example', 'C:/Users/Example'], words: [] }
    const text = `Hi ${EMAIL}, files in C:\\Users\\Example\\x and C:/users/example/y; again ${EMAIL.toUpperCase()}.`
    const expected = createRedactor(terms).redact(text)
    let seed = 7
    const rand = (): number => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 }
    for (let run = 0; run < 300; run++) {
      const chunks: string[] = []
      for (let i = 0; i < text.length;) {
        const size = 1 + Math.floor(rand() * 12)
        chunks.push(text.slice(i, i + size))
        i += size
      }
      expect(stream(terms, chunks).text).toBe(expected)
    }
  })
})

describe('createRedactor: whole-word terms (email name part)', () => {
  const terms = emailTerms('support@acme.example')

  it('leaves longer words that merely contain the name part alone', () => {
    expect(stream(terms, ['We supported the supporters and superSupport.']).text).toBe('We supported the supporters and superSupport.')
  })

  it('redacts the name part as a whole word, next to punctuation or at either end', () => {
    expect(stream(terms, ['support, (Support) and support']).text).toBe('[redacted], ([redacted]) and [redacted]')
  })

  it('checks the character before a match even when it was emitted in an earlier chunk', () => {
    const text = `${'x'.repeat(40)} supersupport support.`
    for (let size = 1; size <= text.length; size++) {
      expect(stream(terms, chunked(text, size)).text).toBe(`${'x'.repeat(40)} supersupport [redacted].`)
    }
  })

  it('never leaves part of the full email visible behind a shorter name-part match, for every chunking', () => {
    const t = emailTerms('jane.doe+work@example.com')
    const text = 'Contact jane.doe+work@example.com now, jane.doe.'
    for (let size = 1; size <= text.length; size++) {
      expect(stream(t, chunked(text, size)).text).toBe('Contact [redacted] now, [redacted].')
    }
  })
})

describe('createRedactor: cut-off streams', () => {
  const cutOff = (terms: RedactionTerms, text: string): string => {
    const redactor = createRedactor(terms)
    return redactor.push(text) + redactor.flush(true)
  }

  it('redacts a trailing partial term when the stream was cut off mid-term', () => {
    expect(cutOff(emailTerms('synthetic.person@example.test'), 'Contact synthetic.per')).toBe('Contact [redacted]')
    expect(cutOff(emailTerms('someone@example.com'), 'Reach someone@exa')).toBe('Reach [redacted]')
  })

  it('leaves a short trailing fragment alone', () => {
    expect(cutOff(emailTerms('synthetic.person@example.test'), 'all done, syn')).toBe('all done, syn')
  })

  it('does not treat the end of a word as the start of a term', () => {
    expect(cutOff(emailTerms('mark.smith@acme.com'), 'set a clear benchmark')).toBe('set a clear benchmark')
    expect(cutOff(emailTerms('someone.person@example.com'), 'looks awesome')).toBe('looks awesome')
  })

  it.each([
    ['mark.smith@acme.com', '- Q3: set a clear benchmark'],
    ['info@acme.com', 'Ask the vendor for more info'],
    ['sales@acme.com', 'drive sales'],
    ['team@acme.io', 'align the team'],
    ['data@acme.io', '- Key risk: missing data'],
  ])('leaves the last word of a normally finished reply alone (%s)', (email, text) => {
    expect(stream(emailTerms(email), [text]).text).toBe(text)
  })
})

describe('createRedactor: surrogate pairs', () => {
  it('never splits an emoji between emitted chunks', () => {
    const text = `${'🙂'.repeat(30)} ${EMAIL} ${'🎉'.repeat(30)}`
    const { text: out, parts } = stream({ exact: [EMAIL], words: [] }, chunked(text, 1))
    expect(out).toBe(`${'🙂'.repeat(30)} [redacted] ${'🎉'.repeat(30)}`)
    for (const part of parts) {
      if (part === '') continue
      const last = part.charCodeAt(part.length - 1)
      expect(last >= 0xd800 && last <= 0xdbff).toBe(false)
    }
  })
})

describe('emailTerms', () => {
  it('matches the full email anywhere and the name part, with and without +tag, as words', () => {
    expect(emailTerms('jane.doe+work@example.com')).toEqual({ exact: ['jane.doe+work@example.com'], words: ['jane.doe+work', 'jane.doe'] })
  })

  it('handles an email without a tag', () => {
    expect(emailTerms('jane.doe@example.com')).toEqual({ exact: ['jane.doe@example.com'], words: ['jane.doe'] })
  })
})

describe('sensitivePathVariants', () => {
  it('covers backslash, forward-slash and escaped-backslash spellings', () => {
    expect(sensitivePathVariants('C:\\Users\\Example')).toEqual(expect.arrayContaining([
      'C:\\Users\\Example', 'C:/Users/Example', 'C:\\\\Users\\\\Example',
    ]))
  })

  it('returns the path alone for POSIX paths', () => {
    expect(sensitivePathVariants('/home/owner')).toEqual(['/home/owner'])
  })
})

describe('createRedactor: scripts without spaces', () => {
  const terms = emailTerms('jane.doe@example.com')

  it('redacts the name part next to CJK or kana text', () => {
    expect(stream(terms, ['jane.doeさん、こんにちは。']).text).toBe('[redacted]さん、こんにちは。')
    expect(stream(terms, ['用户jane.doe的邮箱']).text).toBe('用户[redacted]的邮箱')
  })

  it('still leaves Latin-script words that contain the name part alone', () => {
    expect(stream(terms, ['jane.doer and ünjane.doe']).text).toBe('jane.doer and ünjane.doe')
  })

  it('redacts a cut-off partial term that follows CJK text', () => {
    const redactor = createRedactor(terms)
    expect(redactor.push('メールはjane.doe@exa') + redactor.flush(true)).toBe('メールは[redacted]')
  })
})

describe('createRedactor: cut-off path fragments', () => {
  it('redacts a partial path that follows a letter, since paths match anywhere', () => {
    const redactor = createRedactor({ exact: ['/Users/owner'], words: [] })
    expect(redactor.push('see /System/Volumes/Data/Users/own') + redactor.flush(true)).toBe('see /System/Volumes/Data[redacted]')
  })
})

describe('createRedactor: underscores and Markdown emphasis', () => {
  const terms = emailTerms('jane.doe@example.com')

  it('redacts the name part inside Markdown emphasis and next to underscores', () => {
    expect(stream(terms, ['Thanks, _jane.doe_! Signed in as __jane.doe__; see jane.doe_notes']).text)
      .toBe('Thanks, _[redacted]_! Signed in as __[redacted]__; see [redacted]_notes')
  })

  it('redacts a cut-off partial term that follows an underscore', () => {
    const redactor = createRedactor(terms)
    expect(redactor.push('Reach _jane.doe@exa') + redactor.flush(true)).toBe('Reach _[redacted]')
  })
})
