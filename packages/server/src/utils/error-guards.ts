import { RelayError } from './errors';

export interface HorizonError {
  response?: {
    data?: {
      extras?: {
        result_codes?: any;
      };
    };
  };
  message: string;
}

export interface SorobanError {
  code?: number;
  message: string;
  data?: any;
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

export function isStellarHorizonError(err: unknown): err is HorizonError {
  const e = err as any;
  return (
    e &&
    typeof e === 'object' &&
    e.response &&
    e.response.data &&
    e.response.data.extras &&
    e.response.data.extras.result_codes
  );
}

export function isSorobanRpcError(err: unknown): err is SorobanError {
  const e = err as any;
  // Soroban RPC errors often follow JSON-RPC 2.0 error shape
  return (
    e &&
    typeof e === 'object' &&
    (typeof e.code === 'number' || e.message) &&
    !isStellarHorizonError(err)
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
  // Common Knex/node-pg error shape
  return (
    e &&
    typeof e === 'object' &&
    (typeof e.code === 'string' && /^[0-9A-Z]{5}$/.test(e.code)) // PostgreSQL error codes are 5 chars
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
