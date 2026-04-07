/**
 * Compiled-document types — shared between the documents store, sidebar UI,
 * and the compile flow.
 */

export interface SessionDocument {
  readonly id: string
  readonly title: string
  readonly content: string
  /** Provider used to generate this document — for display only. */
  readonly provider: string
  readonly model: string
  readonly modelName: string
  readonly cost: number
  readonly createdAt: number
  /** The user's optional focus prompt, if any was provided. */
  readonly focusPrompt?: string
}

/**
 * Lightweight metadata returned by `documents:list` — does not include
 * the document body, so listing is fast.
 */
export interface DocumentSummary {
  readonly id: string
  readonly title: string
  readonly createdAt: number
  readonly modelName: string
}
