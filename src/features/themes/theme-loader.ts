import type { Theme, ThemeColors } from '@/types'

const DEFAULT_COLORS: ThemeColors = {
  background: '#0a0a0f',
  text: '#e5e5e5',
  codeBackground: '#1a1a2e',
  userBubble: '#1e3a5f',
  agentBubble: '#2a2a3e',
  canvasBackground: '#0f0f1a',
  accentPalette: [
    '#3b82f6', '#ef4444', '#22c55e', '#f59e0b', '#8b5cf6',
    '#ec4899', '#06b6d4', '#f97316', '#14b8a6', '#a855f7',
    '#e11d48', '#84cc16', '#0ea5e9', '#d946ef', '#10b981',
    '#f43f5e', '#6366f1', '#eab308', '#2dd4bf', '#c084fc',
  ],
}

const DARK_THEME: Theme = {
  id: 'dark',
  name: 'Dark',
  filePath: '',
  colors: DEFAULT_COLORS,
}

const LIGHT_THEME: Theme = {
  id: 'light',
  name: 'Light',
  filePath: '',
  colors: {
    background: '#ffffff',
    text: '#1a1a1a',
    codeBackground: '#f5f5f5',
    userBubble: '#e0e7ff',
    agentBubble: '#f3f4f6',
    canvasBackground: '#fafafa',
    accentPalette: DEFAULT_COLORS.accentPalette,
  },
}

const HIGH_CONTRAST_THEME: Theme = {
  id: 'high-contrast',
  name: 'High Contrast',
  filePath: '',
  colors: {
    background: '#000000',
    text: '#ffffff',
    codeBackground: '#1a1a1a',
    userBubble: '#003366',
    agentBubble: '#333333',
    canvasBackground: '#000000',
    accentPalette: DEFAULT_COLORS.accentPalette,
  },
}

export const BUILT_IN_THEMES: readonly Theme[] = [
  DARK_THEME,
  LIGHT_THEME,
  HIGH_CONTRAST_THEME,
]

function isValidHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value)
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string')
}

export function parseThemeFile(
  filePath: string,
  rawJson: string,
): Theme | null {
  try {
    const parsed: unknown = JSON.parse(rawJson)
    if (typeof parsed !== 'object' || parsed === null) return null

    const obj = parsed as Record<string, unknown>
    const name = typeof obj['name'] === 'string' ? obj['name'] : filePath
    const colors = typeof obj['colors'] === 'object' && obj['colors'] !== null
      ? obj['colors'] as Record<string, unknown>
      : null

    if (colors === null) return null

    const resolvedColors: ThemeColors = {
      background: isValidHexColor(colors['background'])
        ? colors['background']
        : DEFAULT_COLORS.background,
      text: isValidHexColor(colors['text'])
        ? colors['text']
        : DEFAULT_COLORS.text,
      codeBackground: isValidHexColor(colors['codeBackground'])
        ? colors['codeBackground']
        : DEFAULT_COLORS.codeBackground,
      userBubble: isValidHexColor(colors['userBubble'])
        ? colors['userBubble']
        : DEFAULT_COLORS.userBubble,
      agentBubble: isValidHexColor(colors['agentBubble'])
        ? colors['agentBubble']
        : DEFAULT_COLORS.agentBubble,
      canvasBackground: isValidHexColor(colors['canvasBackground'])
        ? colors['canvasBackground']
        : DEFAULT_COLORS.canvasBackground,
      accentPalette: isStringArray(colors['accentPalette'])
        ? colors['accentPalette']
        : DEFAULT_COLORS.accentPalette,
    }

    const filename = filePath.split(/[/\\]/).pop() ?? filePath
    return {
      id: `custom_${filename.replace(/[^a-zA-Z0-9]/g, '_')}`,
      name,
      filePath,
      colors: resolvedColors,
    }
  } catch {
    return null
  }
}

export function getDefaultTheme(): Theme {
  return DARK_THEME
}

export function getAccentColor(
  index: number,
  palette: readonly string[],
): string {
  if (palette.length === 0) return DEFAULT_COLORS.accentPalette[0]!
  return palette[index % palette.length]!
}
