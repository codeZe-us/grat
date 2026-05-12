import { RelayError } from './errors';

export interface StellarSubmissionError {
  response?: {
    data?: {
      extras?: {
        result_codes?: Record<string, unknown>;
      };
      errorResult?: string;
      errorResultXdr?: string;
      diagnosticEventsXdr?: string[];
    };
  };
  message: string;
}

export interface RedisError {
  name: string;
  message: string;
  command?: unknown;
}

export interface DatabaseError {
  code?: string;
  message: string;
  detail?: string;
  table?: string;
  constraint?: string;
}

export function isRelayError(err: unknown): err is RelayError {
  return err instanceof RelayError;
}

export function isStellarSubmissionError(err: unknown): err is StellarSubmissionError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const response = e.response as Record<string, unknown> | undefined;
  if (!response) return false;
  const data = response.data as Record<string, unknown> | undefined;
  if (!data) return false;
  
  const extras = data.extras as Record<string, unknown> | undefined;
  return !!(
    (extras && extras.result_codes) ||
    data.errorResult ||
    data.errorResultXdr ||
    data.diagnosticEventsXdr
  );
}

export function isRedisError(err: unknown): err is RedisError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return (
    e.name === 'RedisError' || e.name === 'ReplyError' || e.name === 'MaxRetriesPerRequestError'
  );
}

export function isDatabaseError(err: unknown): err is DatabaseError {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  return (
    typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)
  );
}

export function isNetworkError(err: unknown): err is Error {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as Record<string, unknown>;
  const networkCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'];
  return (
    networkCodes.includes(e.code as string) || (e.message as string)?.includes('fetch failed')
  );
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
