export interface ThemeColors {
  readonly background: string
  readonly text: string
  readonly codeBackground: string
  readonly userBubble: string
  readonly agentBubble: string
  readonly canvasBackground: string
  readonly accentPalette: readonly string[]
}

export interface Theme {
  readonly id: string
  readonly name: string
  readonly filePath: string
  readonly colors: ThemeColors
}
