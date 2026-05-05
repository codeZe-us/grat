/**
 * Base error class for all Grat SDK errors.
 */
export class GratError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: unknown;
  public readonly requestId?: string;

  constructor(message: string, code: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.requestId = requestId;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the relay rejects the request as invalid.
 */
export class ValidationError extends GratError {}

/**
 * Thrown when authentication fails (Phase 2).
 */
export class AuthenticationError extends GratError {}

/**
 * Thrown when account credits are insufficient (Phase 2).
 */
export class InsufficientCreditsError extends GratError {}

/**
 * Thrown when no channels are available to sponsor the transaction.
 */
export class ChannelExhaustedError extends GratError {
  public readonly retryAfter: number;
  constructor(message: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message, 'CHANNELS_EXHAUSTED', statusCode, details, requestId);
    this.retryAfter = (details as { retryAfter?: number })?.retryAfter || 30;
  }
}

/**
 * Thrown when Soroban simulation fails.
 */
export class SimulationFailedError extends GratError {
  public readonly events: unknown[];
  constructor(message: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message, 'SIMULATION_FAILED', statusCode, details, requestId);
    this.events = (details as unknown[]) || [];
  }
}

/**
 * Thrown when Horizon rejects the transaction submission.
 */
export class SubmissionFailedError extends GratError {
  public readonly resultCodes: unknown;
  constructor(message: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message, 'SUBMISSION_FAILED', statusCode, details, requestId);
    this.resultCodes = details;
  }
}

/**
 * Thrown on 429 Rate Limit responses.
 */
export class RateLimitError extends GratError {
  public readonly retryAfter: number;
  constructor(message: string, statusCode: number, details?: unknown, requestId?: string) {
    super(message, 'RATE_LIMIT_EXCEEDED', statusCode, details, requestId);
    this.retryAfter = (details as { retryAfter?: number })?.retryAfter || 1;
  }
}

/**
 * Thrown when the relay server or downstream services are unreachable.
 */
export class NetworkError extends GratError {}

/**
 * Thrown when the transaction references a frozen ledger entry.
 */
export class FrozenEntryError extends GratError {
  public readonly frozenKeys: string[];
  constructor(message: string, statusCode: number, details?: any, requestId?: string) {
    super(message, 'FROZEN_ENTRY', statusCode, details, requestId);
    this.frozenKeys = (details as { frozenKeys?: string[] })?.frozenKeys || [];
  }
}

/**
 * Helper to map server error responses to typed SDK errors.
 */
export async function handleResponseError(response: Response, requestId?: string) {
  let body: { error?: { message?: string; code?: string; details?: unknown; requestId?: string } };
  try {
    body = (await response.json()) as any;
  } catch (e) {
    throw new NetworkError('Failed to parse error response from relay', 'PARSE_ERROR', response.status, null, requestId);
  }

  const error = body.error || {};
  const message = error.message || 'Unknown relay error';
  const code = error.code || 'UNKNOWN_ERROR';
  const details = error.details;
  const reqId = error.requestId || requestId;

  switch (code) {
    case 'VALIDATION_ERROR':
    case 'INVALID_XDR':
      throw new ValidationError(message, code, response.status, details, reqId);
    case 'AUTHENTICATION_ERROR':
      throw new AuthenticationError(message, code, response.status, details, reqId);
    case 'INSUFFICIENT_CREDITS':
      throw new InsufficientCreditsError(message, code, response.status, details, reqId);
    case 'CHANNELS_EXHAUSTED':
      throw new ChannelExhaustedError(message, response.status, details, reqId);
    case 'SIMULATION_FAILED':
      throw new SimulationFailedError(message, response.status, details, reqId);
    case 'SUBMISSION_FAILED':
      throw new SubmissionFailedError(message, response.status, details, reqId);
    case 'RATE_LIMIT_EXCEEDED':
      throw new RateLimitError(message, response.status, details, reqId);
    case 'NETWORK_ERROR':
      throw new NetworkError(message, code, response.status, details, reqId);
    case 'FROZEN_ENTRY':
      throw new FrozenEntryError(message, response.status, details, reqId);
    default:
      throw new GratError(message, code, response.status, details, reqId);
  }
}
