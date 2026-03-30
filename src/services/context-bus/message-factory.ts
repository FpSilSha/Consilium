import type { Message, CostMetadata } from '@/types'

function generateMessageId(): string {
  return `msg_${Date.now()}_${crypto.randomUUID()}`
}

export function createUserMessage(
  content: string,
  windowId: string,
): Message {
  return {
    id: generateMessageId(),
    role: 'user',
    content,
    personaLabel: 'You',
    timestamp: Date.now(),
    windowId,
    costMetadata: undefined,
  }
}

export function createAssistantMessage(
  content: string,
  personaLabel: string,
  windowId: string,
  costMetadata?: CostMetadata,
): Message {
  return {
    id: generateMessageId(),
    role: 'assistant',
    content,
    personaLabel,
    timestamp: Date.now(),
    windowId,
    costMetadata,
  }
}

export function createSystemMessage(
  content: string,
  windowId: string,
  personaLabel?: string,
): Message {
  return {
    id: generateMessageId(),
    role: 'system',
    content,
    personaLabel: personaLabel ?? 'System',
    timestamp: Date.now(),
    windowId,
    costMetadata: undefined,
  }
}
