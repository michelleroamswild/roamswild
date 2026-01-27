import { Bbox, RawOsmElement } from './types';

/**
 * Overpass API endpoints (can rotate between them)
 */
const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  // 'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  /** Maximum number of retry attempts */
  maxRetries: 3,
  /** Initial backoff delay in ms */
  initialBackoffMs: 1000,
  /** Maximum backoff delay in ms */
  maxBackoffMs: 10000,
  /** Backoff multiplier */
  backoffMultiplier: 2,
  /** Request timeout in ms */
  timeoutMs: 30000,
  /** Jitter factor (0-1) to add randomness to backoff */
  jitterFactor: 0.2,
} as const;

/**
 * Error types for Overpass requests
 */
export type OverpassErrorType =
  | 'rate_limited'      // HTTP 429
  | 'timeout'           // Query timeout or gateway timeout
  | 'overloaded'        // Server indicates overload
  | 'network_error'     // Network failure
  | 'parse_error'       // Invalid JSON response
  | 'query_error'       // Overpass query syntax error
  | 'unknown';

/**
 * Result of an Overpass query
 */
export interface OverpassResult {
  success: boolean;
  elements: RawOsmElement[];
  error?: OverpassErrorType;
  errorMessage?: string;
  /** Whether the error is retryable */
  retryable?: boolean;
  /** Suggested wait time before retry (ms) */
  retryAfterMs?: number;
  /** Which endpoint was used */
  endpoint?: string;
  /** How many attempts were made */
  attempts?: number;
}

/**
 * Client state for tracking rate limits
 */
interface ClientState {
  /** Endpoints that are currently rate-limited */
  rateLimitedEndpoints: Map<string, number>;
  /** Last successful endpoint */
  lastSuccessfulEndpoint: string | null;
  /** Total requests made */
  requestCount: number;
}

const clientState: ClientState = {
  rateLimitedEndpoints: new Map(),
  lastSuccessfulEndpoint: null,
  requestCount: 0,
};

/**
 * Calculate backoff delay with jitter
 */
function calculateBackoff(
  attempt: number,
  config: typeof DEFAULT_CONFIG = DEFAULT_CONFIG
): number {
  const exponentialDelay = Math.min(
    config.initialBackoffMs * Math.pow(config.backoffMultiplier, attempt),
    config.maxBackoffMs
  );

  // Add jitter to prevent thundering herd
  const jitter = exponentialDelay * config.jitterFactor * Math.random();
  return Math.floor(exponentialDelay + jitter);
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get the next available endpoint (not rate-limited)
 */
function getAvailableEndpoint(): string {
  const now = Date.now();

  // Clean up expired rate limits
  for (const [endpoint, expiresAt] of clientState.rateLimitedEndpoints) {
    if (now > expiresAt) {
      clientState.rateLimitedEndpoints.delete(endpoint);
    }
  }

  // Prefer last successful endpoint if available
  if (
    clientState.lastSuccessfulEndpoint &&
    !clientState.rateLimitedEndpoints.has(clientState.lastSuccessfulEndpoint)
  ) {
    return clientState.lastSuccessfulEndpoint;
  }

  // Find first non-rate-limited endpoint
  for (const endpoint of OVERPASS_ENDPOINTS) {
    if (!clientState.rateLimitedEndpoints.has(endpoint)) {
      return endpoint;
    }
  }

  // All endpoints rate-limited, use the one that expires soonest
  let soonestEndpoint = OVERPASS_ENDPOINTS[0];
  let soonestExpiry = Infinity;

  for (const [endpoint, expiresAt] of clientState.rateLimitedEndpoints) {
    if (expiresAt < soonestExpiry) {
      soonestExpiry = expiresAt;
      soonestEndpoint = endpoint;
    }
  }

  return soonestEndpoint;
}

/**
 * Mark an endpoint as rate-limited
 */
function markRateLimited(endpoint: string, retryAfterMs: number = 60000): void {
  clientState.rateLimitedEndpoints.set(endpoint, Date.now() + retryAfterMs);
}

/**
 * Parse error type from response
 */
function parseErrorType(
  status: number,
  body?: string
): { type: OverpassErrorType; retryable: boolean; retryAfterMs?: number } {
  // Rate limited
  if (status === 429) {
    return { type: 'rate_limited', retryable: true, retryAfterMs: 60000 };
  }

  // Gateway timeout
  if (status === 504) {
    return { type: 'timeout', retryable: true, retryAfterMs: 5000 };
  }

  // Service unavailable (often overload)
  if (status === 503) {
    return { type: 'overloaded', retryable: true, retryAfterMs: 30000 };
  }

  // Bad gateway
  if (status === 502) {
    return { type: 'overloaded', retryable: true, retryAfterMs: 10000 };
  }

  // Check body for overload indicators
  if (body) {
    const lower = body.toLowerCase();
    if (
      lower.includes('rate limit') ||
      lower.includes('too many requests')
    ) {
      return { type: 'rate_limited', retryable: true, retryAfterMs: 60000 };
    }
    if (
      lower.includes('timeout') ||
      lower.includes('runtime error')
    ) {
      return { type: 'timeout', retryable: true, retryAfterMs: 5000 };
    }
    if (
      lower.includes('overload') ||
      lower.includes('server load')
    ) {
      return { type: 'overloaded', retryable: true, retryAfterMs: 30000 };
    }
  }

  // Server errors are generally retryable
  if (status >= 500) {
    return { type: 'unknown', retryable: true, retryAfterMs: 5000 };
  }

  // Client errors are not retryable
  if (status >= 400) {
    return { type: 'query_error', retryable: false };
  }

  return { type: 'unknown', retryable: false };
}

/**
 * Execute a single Overpass request (no retry)
 */
async function executeRequest(
  query: string,
  endpoint: string,
  timeoutMs: number
): Promise<OverpassResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(query)}`,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Get response body
    const text = await response.text();

    // Check for errors
    if (!response.ok) {
      const errorInfo = parseErrorType(response.status, text);

      if (errorInfo.type === 'rate_limited') {
        markRateLimited(endpoint, errorInfo.retryAfterMs);
      }

      return {
        success: false,
        elements: [],
        error: errorInfo.type,
        errorMessage: `HTTP ${response.status}: ${text.slice(0, 200)}`,
        retryable: errorInfo.retryable,
        retryAfterMs: errorInfo.retryAfterMs,
        endpoint,
      };
    }

    // Parse JSON
    let data: { elements?: RawOsmElement[]; remark?: string };
    try {
      data = JSON.parse(text);
    } catch {
      return {
        success: false,
        elements: [],
        error: 'parse_error',
        errorMessage: 'Invalid JSON response',
        retryable: false,
        endpoint,
      };
    }

    // Check for runtime errors in response
    if (data.remark?.includes('runtime error')) {
      return {
        success: false,
        elements: data.elements ?? [],
        error: 'timeout',
        errorMessage: data.remark,
        retryable: true,
        retryAfterMs: 5000,
        endpoint,
      };
    }

    // Success!
    clientState.lastSuccessfulEndpoint = endpoint;

    return {
      success: true,
      elements: data.elements ?? [],
      endpoint,
    };

  } catch (err) {
    clearTimeout(timeoutId);

    // Abort error (timeout)
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        elements: [],
        error: 'timeout',
        errorMessage: 'Request timed out',
        retryable: true,
        retryAfterMs: 5000,
        endpoint,
      };
    }

    // Network error
    return {
      success: false,
      elements: [],
      error: 'network_error',
      errorMessage: String(err),
      retryable: true,
      retryAfterMs: 2000,
      endpoint,
    };
  }
}

/**
 * Execute an Overpass query with retries and backoff
 */
export async function executeWithRetry(
  query: string,
  config: Partial<typeof DEFAULT_CONFIG> = {}
): Promise<OverpassResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  let lastResult: OverpassResult | null = null;

  for (let attempt = 0; attempt < cfg.maxRetries; attempt++) {
    // Get available endpoint
    const endpoint = getAvailableEndpoint();

    // Execute request
    const result = await executeRequest(query, endpoint, cfg.timeoutMs);
    result.attempts = attempt + 1;

    // Success
    if (result.success) {
      clientState.requestCount++;
      return result;
    }

    lastResult = result;

    // Not retryable, return immediately
    if (!result.retryable) {
      return result;
    }

    // Last attempt, don't wait
    if (attempt === cfg.maxRetries - 1) {
      break;
    }

    // Calculate backoff
    const backoffMs = result.retryAfterMs
      ? Math.max(result.retryAfterMs, calculateBackoff(attempt, cfg))
      : calculateBackoff(attempt, cfg);

    // Wait before retry
    await sleep(backoffMs);
  }

  // Return last result with all attempts counted
  return lastResult ?? {
    success: false,
    elements: [],
    error: 'unknown',
    errorMessage: 'No attempts made',
    attempts: 0,
  };
}

/**
 * Check if we're currently being rate-limited by all endpoints
 */
export function isFullyRateLimited(): boolean {
  const now = Date.now();

  for (const endpoint of OVERPASS_ENDPOINTS) {
    const expiresAt = clientState.rateLimitedEndpoints.get(endpoint);
    if (!expiresAt || now > expiresAt) {
      return false;
    }
  }

  return true;
}

/**
 * Get current client state (for debugging/monitoring)
 */
export function getClientState(): {
  rateLimitedEndpoints: string[];
  lastSuccessfulEndpoint: string | null;
  requestCount: number;
} {
  const now = Date.now();
  const rateLimited: string[] = [];

  for (const [endpoint, expiresAt] of clientState.rateLimitedEndpoints) {
    if (now < expiresAt) {
      rateLimited.push(endpoint);
    }
  }

  return {
    rateLimitedEndpoints: rateLimited,
    lastSuccessfulEndpoint: clientState.lastSuccessfulEndpoint,
    requestCount: clientState.requestCount,
  };
}

/**
 * Reset client state (for testing)
 */
export function resetClientState(): void {
  clientState.rateLimitedEndpoints.clear();
  clientState.lastSuccessfulEndpoint = null;
  clientState.requestCount = 0;
}
