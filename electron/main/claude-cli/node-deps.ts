import { spawn, execFile } from 'child_process'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { homedir, tmpdir } from 'os'
import { join } from 'path'
import type { LocalAgentReadiness } from '../../../shared/local-agent/protocol'
import { turnReadinessFromAuthStatus, type TurnReadiness } from './auth-status'
import type { ChildProcessLike, RunnerDeps } from './runner'

/**
 * Launched by name from PATH, never through a shell. The native installer's
 * `claude.exe` works on Windows; npm's `claude.cmd` shim would need a shell,
 * so that install is reported as not installed rather than shelled out to.
 */
const COMMAND = 'claude'
const STATUS_TIMEOUT_MS = 15_000

/**
 * Oldest version verified with every flag this integration uses
 * (`--system-prompt-file` in particular is missing from 2.1.51).
 */
export const MIN_CLAUDE_CODE_VERSION = [2, 1, 284] as const

function run(args: readonly string[], env: Record<string, string>): Promise<{ stdout: string; missing: boolean }> {
  return new Promise((resolve) => {
    execFile(COMMAND, [...args], { env, windowsHide: true, timeout: STATUS_TIMEOUT_MS, shell: false }, (error, stdout) => {
      const missing = (error as NodeJS.ErrnoException | null)?.code === 'ENOENT'
      resolve({ stdout: typeof stdout === 'string' ? stdout : '', missing })
    })
  })
}

export function parseVersion(output: string): readonly [number, number, number] | null {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(output.trim())
  return match === null ? null : [Number(match[1]), Number(match[2]), Number(match[3])]
}

export function isSupportedVersion(version: readonly [number, number, number]): boolean {
  for (let i = 0; i < 3; i++) {
    const a = version[i] ?? 0
    const b = MIN_CLAUDE_CODE_VERSION[i] ?? 0
    if (a !== b) return a > b
  }
  return true
}

export async function checkClaudeReadiness(env: Record<string, string>): Promise<TurnReadiness> {
  const notReady = (readiness: LocalAgentReadiness): TurnReadiness => ({ readiness })
  const versionResult = await run(['--version'], env)
  if (versionResult.missing) return notReady({ state: 'not-installed' })
  const version = parseVersion(versionResult.stdout)
  if (version === null) return notReady({ state: 'error', message: 'Could not determine the installed Claude Code version' })
  if (!isSupportedVersion(version)) {
    return notReady({
      state: 'error',
      message: `Claude Code ${version.join('.')} is too old. Run \`claude update\` (needs ${MIN_CLAUDE_CODE_VERSION.join('.')} or newer).`,
    })
  }
  // `auth status` may exit non-zero when signed out; its JSON is still authoritative.
  const status = await run(['auth', 'status', '--json'], env)
  return turnReadinessFromAuthStatus(status.stdout, version.join('.'))
}

function killTree(pid: number): void {
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { windowsHide: true, shell: false }).on('error', () => {})
    return
  }
  // POSIX children are spawned detached, so -pid addresses the whole group.
  // Escalate if the group ignores SIGTERM, so a "cancelled" turn can't keep using the plan.
  process.kill(-pid, 'SIGTERM')
  setTimeout(() => {
    try {
      process.kill(-pid, 'SIGKILL')
    } catch {
      // Already exited.
    }
  }, SIGKILL_AFTER_MS).unref()
}

const SIGKILL_AFTER_MS = 3_000

export const nodeRunnerDeps: RunnerDeps = {
  command: COMMAND,
  parentEnv: process.env,
  spawn: (command, args, options) =>
    spawn(command, [...args], {
      ...options,
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    }) as unknown as ChildProcessLike,
  killTree,
  makeTempDir: () => mkdtemp(join(tmpdir(), 'consilium-claude-')),
  writeFile: (path, content) => writeFile(path, content, { encoding: 'utf8', mode: 0o600 }),
  removeDir: (path) => rm(path, { recursive: true, force: true }),
  joinPath: (...parts) => join(...parts),
  schedule: (ms, callback) => {
    setTimeout(callback, ms).unref()
  },
  homeDir: homedir(),
  checkReadiness: checkClaudeReadiness,
}
