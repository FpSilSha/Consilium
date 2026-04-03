import type { CustomAdapterDefinition } from '@/types'
import type { ProviderAdapter } from '../../types'
import { buildCustomRequest } from './request-builder'
import { createCustomStreamParser } from './stream-parser'

/**
 * Compiles a CustomAdapterDefinition into a ProviderAdapter at runtime.
 *
 * The returned adapter's buildRequest and parseStream methods are closures
 * that use the template's field paths — no eval, no code generation.
 */
export function compileCustomAdapter(definition: CustomAdapterDefinition): ProviderAdapter {
  const parseStream = createCustomStreamParser(definition.response)

  return {
    provider: 'custom',

    buildRequest(config) {
      return buildCustomRequest(definition.request, config)
    },

    parseStream,
  }
}
