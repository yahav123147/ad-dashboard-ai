/**
 * Claude Client Utilities
 *
 * Uses Claude Agent SDK (authenticated via the local Claude Code CLI /
 * Claude subscription) instead of the direct Anthropic API.
 *
 * No ANTHROPIC_API_KEY required — calls are billed against the user's
 * Claude Max/Pro subscription. The function names are kept for backward
 * compatibility with existing callers.
 */

import { query } from '@anthropic-ai/claude-agent-sdk'

/**
 * Legacy helper kept for backward compatibility with existing callers
 * (e.g. debug pages that displayed env status). Since we no longer need
 * an API key, this always returns `true` — auth is handled by the local
 * Claude Code install / OAuth token.
 */
export function hasAnthropicApiKey(): boolean {
  return true
}

export function isInsideClaudeCode(): boolean {
  return !!(process.env.CLAUDECODE || process.env.CLAUDE_CODE_ENTRYPOINT)
}

export function getEnvironmentStatus(): {
  hasApiKey: boolean
  insideClaudeCode: boolean
  canUseDirectApi: boolean
  canUseAgentSdk: boolean
  recommendation: string
} {
  return {
    hasApiKey: false,
    insideClaudeCode: isInsideClaudeCode(),
    canUseDirectApi: false,
    canUseAgentSdk: true,
    recommendation: 'Using Claude Agent SDK via local Claude subscription (no API key needed)',
  }
}

interface GenerateJsonOptions {
  prompt: string
  systemPrompt?: string
  maxTokens?: number
  model?: 'haiku' | 'sonnet' | 'opus'
  maxRetries?: number
  retryDelayMs?: number
}

const MODEL_MAP: Record<'haiku' | 'sonnet' | 'opus', string> = {
  haiku: 'claude-haiku-4-5-20251001',
  sonnet: 'claude-sonnet-4-6',
  opus: 'claude-opus-4-6',
}

/**
 * Run a single-turn completion against Claude Agent SDK and return the
 * assistant's text output.
 */
async function runSdkCompletion(opts: {
  prompt: string
  systemPrompt: string
  model: string
}): Promise<string> {
  // Clear nested-session env vars so the SDK can spawn claude CLI
  delete process.env.CLAUDECODE
  delete process.env.CLAUDE_CODE_ENTRYPOINT

  let responseText = ''

  const queryIterator = query({
    prompt: opts.prompt,
    options: {
      systemPrompt: opts.systemPrompt,
      model: opts.model,
      maxTurns: 1,
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })

  for await (const event of queryIterator) {
    if (event.type === 'assistant' && 'message' in event) {
      const content = event.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            responseText += block.text
          }
        }
      }
    }

    if ('result' in event && typeof event.result === 'string' && !responseText) {
      responseText = event.result
    }
  }

  return responseText
}

function extractJson<T>(rawText: string): T | null {
  const patterns = [
    /```json\n([\s\S]*?)\n```/,
    /```\n(\{[\s\S]*?\})\n```/,
    /(\{[\s\S]*"hero"[\s\S]*\})/,
    /(\{[\s\S]*\})/,
  ]

  for (const pattern of patterns) {
    const match = rawText.match(pattern)
    if (match) {
      try {
        return JSON.parse(match[1]) as T
      } catch {
        // try next pattern
      }
    }
  }
  return null
}

/**
 * Generate JSON using Claude Agent SDK.
 * - Uses Sonnet 4.6 by default (via the user's subscription)
 * - Includes retry logic with exponential backoff
 * - Returns parsed JSON or null if extraction fails
 */
export async function generateJson<T = unknown>(
  options: GenerateJsonOptions
): Promise<{ json: T | null; rawText: string; error?: string }> {
  const {
    prompt,
    systemPrompt = 'You are a helpful assistant that outputs valid JSON.',
    model = 'sonnet',
    maxRetries = 3,
    retryDelayMs = 1000,
  } = options

  const modelId = MODEL_MAP[model]
  let lastError: Error | null = null
  let rawText = ''

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[ClaudeSDK] JSON attempt ${attempt + 1}/${maxRetries} with ${model} (${modelId})`)

      rawText = await runSdkCompletion({ prompt, systemPrompt, model: modelId })
      console.log(`[ClaudeSDK] Response received, length: ${rawText.length}`)

      const json = extractJson<T>(rawText)
      if (json !== null) {
        console.log('[ClaudeSDK] ✅ JSON extracted successfully')
        return { json, rawText }
      }

      console.log('[ClaudeSDK] ⚠️ Could not extract JSON from response')
      return { json: null, rawText, error: 'Could not extract JSON from response' }
    } catch (error) {
      lastError = error as Error
      console.error(`[ClaudeSDK] ❌ Attempt ${attempt + 1} failed:`, error)

      const msg = error instanceof Error ? error.message.toLowerCase() : ''
      const isRateLimit = msg.includes('rate') || msg.includes('429')

      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 1000
        console.log(`[ClaudeSDK] Rate limited, waiting ${Math.round(delay)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      if (attempt === maxRetries - 1) break
    }
  }

  return {
    json: null,
    rawText,
    error: lastError?.message || 'Failed after max retries',
  }
}

/**
 * Generate text completion (no JSON parsing) via Claude Agent SDK.
 */
export async function generateText(
  options: GenerateJsonOptions
): Promise<{ text: string; error?: string }> {
  const {
    prompt,
    systemPrompt = 'You are a helpful assistant.',
    model = 'sonnet',
    maxRetries = 3,
    retryDelayMs = 1000,
  } = options

  const modelId = MODEL_MAP[model]
  let lastError: Error | null = null

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[ClaudeSDK] Text attempt ${attempt + 1}/${maxRetries} with ${model} (${modelId})`)

      const text = await runSdkCompletion({ prompt, systemPrompt, model: modelId })
      console.log(`[ClaudeSDK] ✅ Text response received, length: ${text.length}`)
      return { text }
    } catch (error) {
      lastError = error as Error
      console.error(`[ClaudeSDK] ❌ Attempt ${attempt + 1} failed:`, error)

      const msg = error instanceof Error ? error.message.toLowerCase() : ''
      const isRateLimit = msg.includes('rate') || msg.includes('429')

      if (isRateLimit && attempt < maxRetries - 1) {
        const delay = retryDelayMs * Math.pow(2, attempt) + Math.random() * 1000
        console.log(`[ClaudeSDK] Rate limited, waiting ${Math.round(delay)}ms...`)
        await new Promise(resolve => setTimeout(resolve, delay))
        continue
      }

      if (attempt === maxRetries - 1) break
    }
  }

  return { text: '', error: lastError?.message || 'Failed after max retries' }
}

/**
 * Stream JSON generation (for progress feedback).
 * Note: Agent SDK exposes streaming via async iteration — we yield text
 * chunks as they arrive from assistant messages, then a final 'done'
 * with parsed JSON if extraction succeeds.
 */
export async function* streamGenerateJson(
  options: GenerateJsonOptions
): AsyncGenerator<{ type: 'text' | 'done'; text?: string; json?: unknown }> {
  const {
    prompt,
    systemPrompt = 'You are a helpful assistant that outputs valid JSON.',
    model = 'sonnet',
  } = options

  const modelId = MODEL_MAP[model]
  let fullText = ''

  const queryIterator = query({
    prompt,
    options: {
      systemPrompt,
      model: modelId,
      maxTurns: 1,
      allowedTools: [],
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
    },
  })

  for await (const event of queryIterator) {
    if (event.type === 'assistant' && 'message' in event) {
      const content = event.message.content
      if (Array.isArray(content)) {
        for (const block of content) {
          if (block.type === 'text') {
            fullText += block.text
            yield { type: 'text', text: block.text }
          }
        }
      }
    }
  }

  const json = extractJson(fullText)
  yield { type: 'done', json: json ?? undefined }
}
