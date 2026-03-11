import type { Persona } from '@/types'

function generatePersonaId(filePath: string): string {
  return `persona_${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`
}

function extractName(filePath: string, content: string): string {
  // Try to extract from first # heading
  const headingMatch = content.match(/^#\s+(.+)$/m)
  if (headingMatch?.[1] !== undefined) {
    return headingMatch[1].trim()
  }

  // Fall back to filename without extension
  const filename = filePath.split(/[/\\]/).pop() ?? filePath
  return filename.replace(/\.md$/i, '').replace(/[-_]/g, ' ')
}

export function parsePersonaFile(
  filePath: string,
  content: string,
  isBuiltIn: boolean,
): Persona {
  return {
    id: generatePersonaId(filePath),
    name: extractName(filePath, content),
    filePath,
    content,
    isBuiltIn,
  }
}

export function sortPersonas(personas: readonly Persona[]): readonly Persona[] {
  return [...personas].sort((a, b) => {
    // Built-in first, then alphabetical
    if (a.isBuiltIn !== b.isBuiltIn) return a.isBuiltIn ? -1 : 1
    return a.name.localeCompare(b.name)
  })
}
