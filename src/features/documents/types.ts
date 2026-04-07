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
  /**
   * The compile preset used to generate this document. Optional for
   * back-compat with documents saved before the preset system existed;
   * missing values are treated as the default preset.
   */
  readonly presetId?: string
  /**
   * True if the user's focus prompt fully REPLACED the preset's default
   * instructions instead of being appended to them. Recorded for display
   * only so the viewer can indicate "custom" compiles. Optional for
   * back-compat.
   */
  readonly focusReplacedDefault?: boolean
}
