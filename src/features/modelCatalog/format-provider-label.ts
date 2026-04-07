import type { Provider } from '@/types'

/**
 * Human-friendly label for a Provider enum value. Used in pickers and
 * dropdowns where the bare provider key (`'openrouter'`) would look
 * unfinished compared to the canonical brand name (`'OpenRouter'`).
 */
export function formatProviderLabel(provider: Provider): string {
  switch (provider) {
    case 'anthropic': return 'Anthropic'
    case 'openai': return 'OpenAI'
    case 'google': return 'Google'
    case 'xai': return 'xAI'
    case 'deepseek': return 'DeepSeek'
    case 'openrouter': return 'OpenRouter'
    case 'custom': return 'Custom'
    default: return provider
  }
}
