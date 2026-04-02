import { type ReactNode, useCallback } from 'react'
import type { Attachment } from '@/types'

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'])

interface AttachButtonProps {
  readonly onAttach: (files: readonly Attachment[]) => void
}

export function AttachButton({ onAttach }: AttachButtonProps): ReactNode {
  const handleClick = useCallback(async () => {
    const api = (window as { consiliumAPI?: { openFileDialog: (f?: unknown) => Promise<readonly { name: string; mimeType: string; data: string; sizeBytes: number }[]> } }).consiliumAPI
    if (api == null) {
      // Fallback: use browser file input when Electron IPC isn't available
      const input = document.createElement('input')
      input.type = 'file'
      input.multiple = true
      input.accept = 'image/*,.txt,.md,.json,.csv,.xml,.html,.css,.js,.ts,.py'
      input.onchange = () => {
        if (input.files == null || input.files.length === 0) return
        const promises = Array.from(input.files).map((file) => readBrowserFile(file))
        Promise.all(promises).then(onAttach).catch(() => {})
      }
      input.click()
      return
    }

    let files: readonly { name: string; mimeType: string; data: string; sizeBytes: number }[]
    try {
      files = await api.openFileDialog()
    } catch (err) {
      // IPC failed — push to error log so user can see what happened
      const addErrorLog = (await import('@/store')).useStore.getState().addErrorLog
      addErrorLog({
        id: crypto.randomUUID(),
        timestamp: Date.now(),
        advisorLabel: 'System',
        accentColor: '#4A90D9',
        message: `File dialog failed: ${err instanceof Error ? err.message : String(err)}`,
      })
      return
    }
    if (files.length === 0) return

    const attachments: Attachment[] = files.map((f) => ({
      id: crypto.randomUUID(),
      name: f.name,
      mimeType: f.mimeType,
      data: f.data,
      type: IMAGE_MIMES.has(f.mimeType) ? 'image' as const : 'text' as const,
      sizeBytes: f.sizeBytes,
    }))

    onAttach(attachments)
  }, [onAttach])

  return (
    <button
      onClick={handleClick}
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-content-muted transition-colors hover:bg-surface-hover hover:text-content-primary"
      aria-label="Attach file"
      title="Attach file"
    >
      <svg viewBox="0 0 20 20" fill="currentColor" aria-hidden="true" className="h-5 w-5">
        <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
      </svg>
    </button>
  )
}

/** Reads a browser File object into an Attachment */
async function readBrowserFile(file: File): Promise<Attachment> {
  const isImage = file.type.startsWith('image/')
  const data = await (isImage ? readAsBase64(file) : file.text())
  return {
    id: crypto.randomUUID(),
    name: file.name,
    mimeType: file.type || 'application/octet-stream',
    data,
    type: isImage ? 'image' : 'text',
    sizeBytes: file.size,
  }
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      // Strip the data:mime;base64, prefix
      const base64 = result.split(',')[1] ?? ''
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}
