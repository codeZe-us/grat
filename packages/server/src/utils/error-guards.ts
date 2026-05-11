import { RelayError } from './errors';

export interface StellarSubmissionError {
  response?: {
    data?: {
      extras?: {
        result_codes?: any;
      };
      errorResultXdr?: string;
      diagnosticEventsXdr?: string[];
    };
  };
  message: string;
}

export interface RedisError {
  name: string;
  message: string;
  command?: any;
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
  const e = err as any;
  return (
    e &&
    typeof e === 'object' &&
    (
      (e.response && e.response.data && e.response.data.extras && e.response.data.extras.result_codes) ||
      (e.response && e.response.data && (e.response.data.errorResultXdr || e.response.data.diagnosticEventsXdr))
    )
  );
}

export function isRedisError(err: unknown): err is RedisError {
  const e = err as any;
  return (
    e &&
    typeof e === 'object' &&
    (e.name === 'RedisError' || e.name === 'ReplyError' || e.name === 'MaxRetriesPerRequestError')
  );
}

export function isDatabaseError(err: unknown): err is DatabaseError {
  const e = err as any;
  return (
    e &&
    typeof e === 'object' &&
    (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code))
  );
}

export function isNetworkError(err: unknown): err is Error {
  const e = err as any;
  const networkCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN', 'ECONNRESET'];
  return (
    e &&
    typeof e === 'object' &&
    (networkCodes.includes(e.code) || e.message?.includes('fetch failed'))
  );
}

export function getErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return String(err);
}
