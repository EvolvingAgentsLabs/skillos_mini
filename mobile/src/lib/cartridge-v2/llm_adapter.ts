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

export interface InferenceFnOptions {
  /** Max tokens for the response. Default 256 (sufficient for nav turns). */
  maxTokens?: number;
}

/**
 * Wrap an LLMProvider into the simple InferenceFn the Navigator expects.
 * Uses non-streaming mode for deterministic response.
 *
 * @param provider - The LLM provider to wrap
 * @param opts - Configuration. maxTokens defaults to 256 (nav/hybrid turns).
 *              Use 1024 for composing turns that produce longer prose.
 */
export function wrapProviderAsInferenceFn(
  provider: LLMProvider,
  opts?: InferenceFnOptions,
): InferenceFn {
  const maxTokens = opts?.maxTokens ?? 256;

  return async (system: string, user: string): Promise<string> => {
    const messages: ChatMessage[] = [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ];

    const result = await provider.chat(messages, {
      stream: false,
      maxTokens,
    });

    return result.content;
  };
}
