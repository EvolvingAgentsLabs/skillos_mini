/**
 * llm_adapter — Bridges the v2 Navigator's InferenceFn to the existing LLMProvider interface.
 *
 * The Navigator expects: (system: string, user: string) => Promise<string>
 * The LLMProvider offers: chat(messages[], opts?) => Promise<ChatResult>
 *
 * This adapter converts between them, keeping the Navigator decoupled from
 * the provider infrastructure.
 */

import type { InferenceFn } from './types';
import type { LLMProvider, ChatMessage } from '../llm/provider';

/**
 * Wrap an LLMProvider into the simple InferenceFn the Navigator expects.
 * Uses non-streaming mode for deterministic response.
 */
export function wrapProviderAsInferenceFn(provider: LLMProvider): InferenceFn {
  return async (system: string, user: string): Promise<string> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const result = await provider.chat(messages, {
      stream: false,
      // Small response budget — Navigator only needs a doc ID or "DONE"
      maxTokens: 256,
    });

    return result.content;
  };
}
