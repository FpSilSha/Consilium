import { type ReactNode, useState, useCallback } from 'react'
import { callForVote } from './vote-service'
import { VoteTallyPanel } from './VoteTallyPanel'
import type { VoteTally } from './vote-types'

export function CallForVoteButton(): ReactNode {
  const [showPrompt, setShowPrompt] = useState(false)
  const [question, setQuestion] = useState('')
  const [isVoting, setIsVoting] = useState(false)
  const [tally, setTally] = useState<VoteTally | null>(null)

  const handleCallVote = useCallback(async () => {
    const trimmed = question.trim()
    if (trimmed === '') return

    setShowPrompt(false)
    setIsVoting(true)

    try {
      const result = await callForVote(trimmed)
      setTally(result)
    } finally {
      setIsVoting(false)
      setQuestion('')
    }
  }, [question])

  return (
    <>
      <button
        onClick={() => setShowPrompt(true)}
        disabled={isVoting}
        className="rounded border border-gray-700 px-2 py-0.5 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:opacity-40"
        title="Call for vote from all advisors"
      >
        {isVoting ? 'Voting...' : 'Vote'}
      </button>

      {/* Vote question prompt */}
      {showPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="mx-4 max-w-md rounded-lg border border-gray-700 bg-gray-900 p-5">
            <h3 className="mb-2 text-sm font-medium text-gray-200">
              Call for Vote
            </h3>
            <p className="mb-3 text-xs text-gray-400">
              Enter the question to put to all advisors.
              Each will respond with YAY, NAY, or ABSTAIN.
            </p>
            <textarea
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Should we proceed with option A?"
              rows={3}
              className="mb-3 w-full resize-none rounded border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-gray-200 outline-none focus:border-gray-500"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => { setShowPrompt(false); setQuestion('') }}
                className="rounded px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-800"
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

      {/* Vote tally panel */}
      {tally !== null && (
        <VoteTallyPanel tally={tally} onClose={() => setTally(null)} />
      )}
    </>
  )
}
