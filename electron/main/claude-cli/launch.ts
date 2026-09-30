import type { LocalAgentMessage } from '../../../shared/local-agent/protocol'

export interface TurnArgsInput {
  readonly model: string
  readonly systemPromptFile: string
}

/**
 * Arguments for one advisor turn. The advisor is a conversation participant
 * only: no tools, no MCP servers, no user or project settings (and so no
 * CLAUDE.md or hooks), no saved session. `--bare` is never used: it reads only
 * API keys, which would bypass the user's subscription login.
 *
 * The system prompt goes in a file and the transcript on stdin, never argv
 * (Windows command-line limits, and argv is visible to other processes).
 */
export function buildTurnArgs({ model, systemPromptFile }: TurnArgsInput): readonly string[] {
  return [
    '-p',
    '--output-format', 'stream-json',
    '--include-partial-messages',
    '--verbose',
    '--tools', '',
    '--setting-sources', '',
    '--strict-mcp-config',
    '--no-session-persistence',
    '--model', model,
    '--system-prompt-file', systemPromptFile,
  ]
}

/** Any of these would move authentication or billing away from the user's subscription login. */
const BLOCKED_ENV = [
  /^ANTHROPIC_/i,
  /^CLAUDE_CODE_USE_/i,
  /^CLAUDE_CODE_OAUTH_TOKEN$/i,
  /^CLAUDE_CODE_ENTRYPOINT$/i,
  /^CLAUDECODE$/i,
  /^AWS_BEARER_TOKEN_BEDROCK$/i,
]

/**
 * Forced on for every advisor turn, as a second layer behind `--setting-sources ""`:
 * the user's own CLAUDE.md files and auto memory must never reach an advisor.
 */
const ISOLATION_ENV: Readonly<Record<string, string>> = {
  CLAUDE_CODE_DISABLE_CLAUDE_MDS: '1',
  CLAUDE_CODE_DISABLE_AUTO_MEMORY: '1',
}

export function buildChildEnv(parentEnv: Readonly<Record<string, string | undefined>>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [name, value] of Object.entries(parentEnv)) {
    if (value === undefined) continue
    if (BLOCKED_ENV.some((pattern) => pattern.test(name))) continue
    if (Object.keys(ISOLATION_ENV).some((key) => key.toLowerCase() === name.toLowerCase())) continue
    env[name] = value
  }
  return { ...env, ...ISOLATION_ENV }
}

/**
 * Claude Code adds its own context to every turn (the signed-in account's
 * email, the working directory, OS details), and there is no documented
 * switch to turn that off. Advisors share one transcript with other
 * providers, so they are told to never repeat it.
 */
const RUNTIME_CONTEXT_GUARD = 'Your runtime adds context about the local machine and the signed-in account, such as an email address, file paths, operating system details, a date, or a token budget. That context is not part of this discussion: never mention, quote, or rely on it.'

export function withRuntimeContextGuard(systemPrompt: string): string {
  return systemPrompt === '' ? RUNTIME_CONTEXT_GUARD : `${systemPrompt}\n\n${RUNTIME_CONTEXT_GUARD}`
}

const CLOSING_TAG = '</conversation>'
const SELF_LABEL = '[Your earlier reply]: '
/** Matches the `[Label]: ` prefix added by `formatWithIdentityHeader`. */
const IDENTITY_HEADER = /^\[[^\]\n]{1,120}\]: /
const CLOSING_INSTRUCTION = 'Respond to the latest message as your advisor persona. Do not prefix your reply with a speaker label.'

/**
 * Serialises the shared discussion into a single prompt.
 *
 * `messagesToApiFormat` gives every message an identity header (`[You]: ` for
 * the user, `[Persona]: ` for other advisors) except this advisor's own past
 * replies, which arrive bare. A single prompt needs those marked, so bare
 * assistant messages get SELF_LABEL. The format is append-only, so the prefix
 * stays stable between turns for prompt caching.
 */
export function formatTranscript(messages: readonly LocalAgentMessage[]): string {
  const blocks = messages.map((m) => {
    const content = m.content.split(CLOSING_TAG).join('<\\/conversation>')
    const isOwnReply = m.role === 'assistant' && !IDENTITY_HEADER.test(content)
    return isOwnReply ? `${SELF_LABEL}${content}` : content
  })
  return `<conversation>\n${blocks.join('\n\n')}\n${CLOSING_TAG}\n\n${CLOSING_INSTRUCTION}`
}
