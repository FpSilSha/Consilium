import type { ReactNode } from 'react'
import { Mosaic, MosaicWindow } from 'react-mosaic-component'
import { useStore } from '@/store'
import { AdvisorPane } from './AdvisorPane'
import 'react-mosaic-component/react-mosaic-component.css'

export function MosaicLayout(): ReactNode {
  const windows = useStore((s) => s.windows)
  const removeWindow = useStore((s) => s.removeWindow)

  const renderTile = (id: string): ReactNode => {
    const win = windows[id]
    if (win === undefined) return null

    return (
      <AdvisorPane
        window={win}
        onClose={() => removeWindow(id)}
      />
    )
  }

  const windowIds = Object.keys(windows)

  if (windowIds.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-gray-600">
        <div className="text-center">
          <p className="text-lg">No advisors yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Click + to add your first advisor
          </p>
        </div>
      </div>
    )
  }

  // Build initial mosaic value from window IDs
  const initialValue = buildMosaicValue(windowIds)

  return (
    <Mosaic<string>
      renderTile={(id, path) => (
        <MosaicWindow<string>
          path={path}
          title=""
          toolbarControls={<></>}
          createNode={() => windowIds[0] ?? ''}
        >
          {renderTile(id)}
        </MosaicWindow>
      )}
      initialValue={initialValue}
      className="consilium-mosaic"
    />
  )
}

/**
 * Builds a balanced binary tree mosaic layout from an array of window IDs.
 */
function buildMosaicValue(
  ids: readonly string[],
): string | { readonly direction: 'row' | 'column'; readonly first: ReturnType<typeof buildMosaicValue>; readonly second: ReturnType<typeof buildMosaicValue>; readonly splitPercentage: number } {
  if (ids.length === 0) return ''
  if (ids.length === 1) return ids[0]!

  const mid = Math.ceil(ids.length / 2)
  const first = buildMosaicValue(ids.slice(0, mid))
  const second = buildMosaicValue(ids.slice(mid))

  return {
    direction: 'row' as const,
    first,
    second,
    splitPercentage: 50,
  }
}
