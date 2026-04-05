import { type ReactNode, useState, useCallback } from 'react'
import { Tooltip } from '@/features/ui/Tooltip'
import { callForVote, VoteInProgressError } from './vote-service'
import { VoteTallyPanel } from './VoteTallyPanel'
import type { VoteTally } from './vote-types'

export function CallForVoteButton(): ReactNode {
  const [showPrompt, setShowPrompt] = useState(false)
  const [question, setQuestion] = useState('')
  const [isVoting, setIsVoting] = useState(false)
  const [tally, setTally] = useState<VoteTally | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleCallVote = useCallback(async () => {
    const trimmed = question.trim()
    if (trimmed === '') return

    setShowPrompt(false)
    setIsVoting(true)
    setError(null)

    try {
      const result = await callForVote(trimmed)
      setTally(result)
      setQuestion('')
    } catch (err) {
      if (!(err instanceof VoteInProgressError)) {
        setError(err instanceof Error ? err.message : 'Vote failed. Please try again.')
      }
      // Preserve question on any error so user can retry without re-typing
    } finally {
      setIsVoting(false)
    }
  }, [question])

  return (
    <>
      <Tooltip text="Call for vote from all advisors" position="bottom">
        <button
          onClick={() => setShowPrompt(true)}
          disabled={isVoting}
          data-action="call-vote"
          className="rounded border border-edge-subtle px-2 py-0.5 text-xs text-content-muted hover:border-edge-focus hover:text-content-primary disabled:opacity-40"
        >
          {isVoting ? 'Voting...' : 'Vote'}
        </button>
      </Tooltip>

      {/* Vote question prompt */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-lg border border-edge-subtle bg-surface-base p-5">
            <h3 className="mb-2 text-sm font-medium text-content-primary">
              Call for Vote
            </h3>
            <p className="mb-3 text-xs text-content-muted">
              Enter the question to put to all advisors.
              Each will respond with YAY, NAY, or ABSTAIN.
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Should we proceed with option A?"
              rows={3}
              className="mb-3 w-full resize-none rounded border border-edge-subtle bg-surface-panel px-3 py-2 text-sm text-content-primary outline-none focus:border-edge-focus"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowPrompt(false); setQuestion('') }}
                className="rounded px-3 py-1.5 text-xs text-content-muted hover:bg-surface-panel"
              >
                Cancel
              </button>
              <button
                onClick={handleCallVote}
                disabled={question.trim() === ''}
                className="rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-40"
              >
                Call Vote
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vote error */}
      {error !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-sm rounded-lg border border-error bg-surface-base p-5">
            <h3 className="mb-2 text-sm font-medium text-error">Vote Failed</h3>
            <p className="mb-3 text-xs text-content-primary">{error}</p>
            <div className="flex justify-end">
              <button
                onClick={() => setError(null)}
                className="rounded px-3 py-1.5 text-xs text-content-muted hover:bg-surface-panel"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Vote tally panel */}
      {tally !== null && (
        <VoteTallyPanel tally={tally} onClose={() => setTally(null)} />
      )}
    </>
  )
}
