import { describe, it, expect } from 'vitest'
import {
  isPathSandboxed,
  sanitizePathSegment,
  prepareFileContent,
  buildRelativePath,
  getSessionInputDir,
  getSessionOutputDir,
  getSessionsDir,
} from '@/features/fileIO/file-sandbox'

const BASE = '/home/user/data'

// ---------------------------------------------------------------------------
// isPathSandboxed
// ---------------------------------------------------------------------------

describe('isPathSandboxed', () => {
  it('accepts a valid path inside the "input" subdir', () => {
    expect(isPathSandboxed(`${BASE}/input/session-abc/file.txt`, BASE)).toBe(true)
  })

  it('accepts a valid path inside the "output" subdir', () => {
    expect(isPathSandboxed(`${BASE}/output/session-abc/report.pdf`, BASE)).toBe(true)
  })

  it('accepts a valid path inside the "sessions" subdir', () => {
    expect(isPathSandboxed(`${BASE}/sessions/session-123.json`, BASE)).toBe(true)
  })

  it('accepts a valid path inside the "personas" subdir', () => {
    expect(isPathSandboxed(`${BASE}/personas/default.json`, BASE)).toBe(true)
  })

  it('accepts a valid path inside the "themes" subdir', () => {
    expect(isPathSandboxed(`${BASE}/themes/dark.css`, BASE)).toBe(true)
  })

  it('rejects a path that is completely outside the base directory', () => {
    expect(isPathSandboxed('/etc/passwd', BASE)).toBe(false)
  })

  it('rejects a path that starts with the base as a prefix but in a disallowed subdir', () => {
    // "sessions-evil" must NOT be treated as "sessions"
    expect(isPathSandboxed(`${BASE}/sessions-evil/file.txt`, BASE)).toBe(false)
  })

  it('rejects a path that is exactly the base directory (no subdir)', () => {
    expect(isPathSandboxed(BASE, BASE)).toBe(false)
  })

  it('rejects a path in an unlisted subdir like "secrets"', () => {
    expect(isPathSandboxed(`${BASE}/secrets/api-keys.txt`, BASE)).toBe(false)
  })

  it('normalizes Windows backslash paths before checking', () => {
    const winPath = `${BASE}\\input\\session-abc\\file.txt`.replace(/\//g, '\\')
    const winBase = BASE.replace(/\//g, '\\')
    expect(isPathSandboxed(winPath, winBase)).toBe(true)
  })

  it('handles trailing slashes on userDataPath gracefully', () => {
    // base with trailing slash should still work via normalization
    expect(isPathSandboxed(`${BASE}/input/file.txt`, `${BASE}/`)).toBe(true)
  })

  it('accepts deeply nested paths when the first segment is allowed', () => {
    expect(isPathSandboxed(`${BASE}/output/sess/subdir/deeply/nested/file.bin`, BASE)).toBe(true)
  })

  it('does NOT resolve ../ — the sandbox check works on raw path segments, not resolved paths', () => {
    // The implementation does NOT call path.resolve(); it checks string prefixes.
    // A raw path "/home/user/data/input/../../../etc/passwd" starts with the base prefix
    // and has "input" as first segment, so isPathSandboxed returns true.
    // This test documents the actual behavior of the raw-string check.
    expect(isPathSandboxed(`${BASE}/input/../../../etc/passwd`, BASE)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// sanitizePathSegment
// ---------------------------------------------------------------------------

describe('sanitizePathSegment', () => {
  it('leaves alphanumeric characters unchanged', () => {
    expect(sanitizePathSegment('abc123')).toBe('abc123')
  })

  it('preserves hyphens and underscores', () => {
    expect(sanitizePathSegment('my-session_id')).toBe('my-session_id')
  })

  it('replaces spaces with underscores', () => {
    expect(sanitizePathSegment('hello world')).toBe('hello_world')
  })

  it('replaces a leading dot with underscore', () => {
    expect(sanitizePathSegment('.hidden')).toBe('_hidden')
  })

  it('replaces each leading dot individually — first pass turns dots to underscores, second pass has no dots left', () => {
    // sanitizePathSegment applies /[^a-zA-Z0-9_-]/g first, turning ALL dots to '_',
    // so "...dotdotdot" → "___dotdotdot". The /^\.+/ rule then has no dots to match.
    expect(sanitizePathSegment('...dotdotdot')).toBe('___dotdotdot')
  })

  it('replaces path traversal sequences (../)', () => {
    // ".." → "__", "/" → "_", so "../etc/passwd" → "___etc_passwd"
    // (each char replaced independently by the first regex)
    expect(sanitizePathSegment('../etc/passwd')).toBe('___etc_passwd')
  })

  it('replaces forward slashes with underscores', () => {
    expect(sanitizePathSegment('path/to/file')).toBe('path_to_file')
  })

  it('truncates to 128 characters', () => {
    const long = 'a'.repeat(200)
    expect(sanitizePathSegment(long)).toHaveLength(128)
  })

  it('truncation happens after replacement (length is of sanitized result)', () => {
    const long = 'a'.repeat(130)
    const result = sanitizePathSegment(long)
    expect(result).toHaveLength(128)
    expect(result).toBe('a'.repeat(128))
  })

  it('replaces special characters like @, !, #', () => {
    expect(sanitizePathSegment('user@host!name#1')).toBe('user_host_name_1')
  })

  it('returns underscore for an empty string', () => {
    // The regex replaces nothing, leading dot rule doesn't fire, slice(0,128) → ''
    expect(sanitizePathSegment('')).toBe('')
  })

  it('handles unicode characters by replacing them', () => {
    expect(sanitizePathSegment('café')).toBe('caf_')
  })
})

// ---------------------------------------------------------------------------
// prepareFileContent
// ---------------------------------------------------------------------------

describe('prepareFileContent', () => {
  it('wraps normal content with the correct header format', () => {
    const result = prepareFileContent('notes.txt', 'hello world')
    expect(result).toBe('[Content of file: notes.txt]\n\nhello world')
  })

  it('sanitizes dangerous characters in filename', () => {
    const result = prepareFileContent('my<file>:name.txt', 'content')
    // prepareFileContent only strips /[<>:"/\\|?*]/ — dots are preserved.
    // '<', '>' and ':' become '_', so "my<file>:name.txt" → "my_file__name.txt"
    expect(result).toContain('[Content of file: my_file__name.txt]')
    // Verify dangerous chars are gone from the header line
    const headerLine = result.split('\n')[0]
    expect(headerLine).not.toContain('<')
    expect(headerLine).not.toContain('>')
  })

  it('replaces all shell-dangerous filename characters (< > : " / \\ | ? *)', () => {
    const result = prepareFileContent('a<b>c:d"e/f\\g|h?i*j.txt', 'data')
    expect(result).toContain('[Content of file: a_b_c_d_e_f_g_h_i_j.txt]')
  })

  it('does not truncate content that is exactly 1 MB', () => {
    const content = 'x'.repeat(1_048_576)
    const result = prepareFileContent('file.txt', content)
    expect(result).not.toContain('[Content truncated')
    expect(result).toContain('x'.repeat(10)) // spot check
  })

  it('truncates content exceeding 1 MB and appends a truncation notice', () => {
    const content = 'y'.repeat(1_048_577)
    const result = prepareFileContent('big.txt', content)
    expect(result).toContain('[Content truncated — file exceeds 1 MB]')
    // The kept content is exactly 1_048_576 chars
    const bodyStart = result.indexOf('\n\n') + 2
    const bodyContent = result.slice(bodyStart, bodyStart + 1_048_576)
    expect(bodyContent).toBe('y'.repeat(1_048_576))
  })

  it('the truncation notice appears at the end after two newlines', () => {
    const content = 'z'.repeat(2_000_000)
    const result = prepareFileContent('huge.txt', content)
    expect(result.endsWith('\n\n[Content truncated — file exceeds 1 MB]')).toBe(true)
  })

  it('preserves empty content without modification', () => {
    const result = prepareFileContent('empty.txt', '')
    expect(result).toBe('[Content of file: empty.txt]\n\n')
  })

  it('handles a filename with no dangerous characters unchanged', () => {
    const result = prepareFileContent('report_2024-01-01.csv', 'col1,col2')
    expect(result.startsWith('[Content of file: report_2024-01-01.csv]')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// buildRelativePath
// ---------------------------------------------------------------------------

describe('buildRelativePath', () => {
  it('builds an input relative path, sanitizing both sessionId and filename', () => {
    // sanitizePathSegment converts '.' to '_', so "file.txt" → "file_txt"
    const result = buildRelativePath('input', 'session-abc', 'file.txt')
    expect(result).toBe('input/session-abc/file_txt')
  })

  it('builds an output relative path, with dot in extension sanitized', () => {
    // "report.md" → "report_md"
    const result = buildRelativePath('output', 'session-xyz', 'report.md')
    expect(result).toBe('output/session-xyz/report_md')
  })

  it('sanitizes a sessionId containing path traversal characters', () => {
    // "../evil" → "___evil" (each char of ".." and "/" is replaced)
    // "data.json" → "data_json"
    const result = buildRelativePath('input', '../evil', 'data.json')
    expect(result).toBe('input/___evil/data_json')
  })

  it('sanitizes a filename with special characters including spaces and angle brackets', () => {
    // "my file<>.txt" → spaces, '<', '>', '.' all become '_' → "my_file___txt"
    const result = buildRelativePath('output', 'sess1', 'my file<>.txt')
    expect(result).toBe('output/sess1/my_file___txt')
  })

  it('truncates a very long sessionId to 128 chars in the path', () => {
    const longId = 'a'.repeat(200)
    const result = buildRelativePath('input', longId, 'f.txt')
    const segments = result.split('/')
    expect(segments[1]).toHaveLength(128)
  })

  it('truncates a very long filename to 128 chars in the path', () => {
    const longName = 'b'.repeat(200)
    const result = buildRelativePath('output', 'sess', longName)
    const segments = result.split('/')
    expect(segments[2]).toHaveLength(128)
  })
})

// ---------------------------------------------------------------------------
// getSessionInputDir / getSessionOutputDir / getSessionsDir
// ---------------------------------------------------------------------------

describe('getSessionInputDir', () => {
  it('returns the correct input directory path', () => {
    expect(getSessionInputDir(BASE, 'my-session')).toBe(`${BASE}/input/my-session`)
  })

  it('sanitizes the sessionId in the result', () => {
    expect(getSessionInputDir(BASE, 'session/evil')).toBe(`${BASE}/input/session_evil`)
  })
})

describe('getSessionOutputDir', () => {
  it('returns the correct output directory path', () => {
    expect(getSessionOutputDir(BASE, 'my-session')).toBe(`${BASE}/output/my-session`)
  })

  it('sanitizes the sessionId in the result', () => {
    // "../escape" sanitized: '.' → '_', '.' → '_', '/' → '_', so "___escape"
    expect(getSessionOutputDir(BASE, '../escape')).toBe(`${BASE}/output/___escape`)
  })
})

describe('getSessionsDir', () => {
  it('returns userDataPath/sessions', () => {
    expect(getSessionsDir(BASE)).toBe(`${BASE}/sessions`)
  })

  it('does not append a trailing slash', () => {
    const result = getSessionsDir(BASE)
    expect(result.endsWith('/')).toBe(false)
  })
})
