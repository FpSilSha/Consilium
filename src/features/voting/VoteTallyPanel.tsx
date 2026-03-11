import type { ReactNode } from 'react'
import type { VoteTally } from './vote-types'

interface VoteTallyPanelProps {
  readonly tally: VoteTally
  readonly onClose: () => void
}

export function VoteTallyPanel({ tally, onClose }: VoteTallyPanelProps): ReactNode {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="mx-4 max-w-lg rounded-lg border border-gray-700 bg-gray-900 p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-medium text-gray-200">Vote Results</h3>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-300"
          >
            x
          </button>
        </div>

        {/* Tally summary */}
        <div className="mb-4 flex gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-green-500" />
            <span className="text-sm text-gray-300">YAY: {tally.yay}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-red-500" />
            <span className="text-sm text-gray-300">NAY: {tally.nay}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-gray-500" />
            <span className="text-sm text-gray-300">ABSTAIN: {tally.abstain}</span>
          </div>
        </div>

        {/* Individual votes */}
        <div className="flex flex-col gap-2">
          {tally.votes.map((vote) => (
            <div
              key={vote.windowId}
              className="flex items-start gap-2 rounded border-l-3 border-gray-800 bg-gray-800/50 px-3 py-2"
              style={{ borderLeftColor: vote.accentColor }}
            >
              <span className="shrink-0 text-xs font-medium text-gray-300">
                {vote.personaLabel}
              </span>
              <span
                className={`shrink-0 rounded px-1.5 py-0.5 text-xs font-bold ${
                  vote.vote === 'YAY'
                    ? 'bg-green-900 text-green-300'
                    : vote.vote === 'NAY'
                      ? 'bg-red-900 text-red-300'
                      : 'bg-gray-700 text-gray-400'
                }`}
              >
                {vote.vote}
              </span>
              <span className="text-xs text-gray-400">{vote.justification}</span>
            </div>
          ))}
        </div>

        {tally.votes.length === 0 && (
          <p className="text-xs text-gray-500">No valid votes received.</p>
        )}
      </div>
    </div>
  )
}
