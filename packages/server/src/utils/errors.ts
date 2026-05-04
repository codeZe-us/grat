export class RelayError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: any;
  public requestId?: string;

  constructor(message: string, code: string, statusCode: number, details?: any) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        requestId: this.requestId,
      },
    };
  }
}

export class ValidationError extends RelayError {
  constructor(message: string, details?: any) {
    super(message, 'VALIDATION_ERROR', 400, details);
  }
}

export class AuthenticationError extends RelayError {
  constructor(message: string = 'Invalid or missing API key') {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class InsufficientCreditsError extends RelayError {
  constructor(message: string = 'Insufficient credits to sponsor this transaction') {
    super(message, 'INSUFFICIENT_CREDITS', 402);
  }
}

export class PolicyDeniedError extends RelayError {
  constructor(message: string, details?: any) {
    super(message, 'POLICY_DENIED', 403, details);
  }
}

export class NotFoundError extends RelayError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
  }
}

export class RateLimitError extends RelayError {
  public readonly retryAfter?: number;
  constructor(message: string = 'Rate limit exceeded', retryAfter?: number) {
    super(message, 'RATE_LIMIT_EXCEEDED', 429, { retryAfter });
    this.retryAfter = retryAfter;
  }
}

export class ChannelExhaustedError extends RelayError {
  public readonly retryAfter: number = 30;
  constructor(message: string = 'All fee channels are currently locked') {
    super(message, 'CHANNELS_EXHAUSTED', 503, { retryAfter: 30 });
  }
}

export class SimulationFailedError extends RelayError {
  constructor(message: string, diagnosticEvents: any[] = []) {
    super(message, 'SIMULATION_FAILED', 422, diagnosticEvents);
  }
}

export class SubmissionFailedError extends RelayError {
  constructor(message: string, horizonResultCodes: any = {}) {
    super(message, 'SUBMISSION_FAILED', 502, horizonResultCodes);
  }
}

export class NetworkError extends RelayError {
  constructor(message: string = 'Network communication error', details?: any) {
    super(message, 'NETWORK_ERROR', 503, details);
  }
}
