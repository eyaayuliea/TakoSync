import { describeOwnerRecordError } from './shared/ownerRecordErrors.ts';

export type OwnerSalesErrorInfo = {
  /** `validation` problems come from the filters and cannot be fixed by retrying. */
  kind: 'validation' | 'load';
  message: string;
  detail: string | null;
};

const VALIDATION_PREFIXES = ['Enter valid', 'Choose a valid', 'Select a valid'];

export function describeOwnerSalesError(error: unknown): OwnerSalesErrorInfo {
  const raw = typeof error === 'string' ? error.trim() : error instanceof Error ? error.message.trim() : '';
  if (VALIDATION_PREFIXES.some((prefix) => raw.startsWith(prefix))) {
    return { kind: 'validation', message: raw, detail: null };
  }
  const info = describeOwnerRecordError(error);
  return {
    kind: 'load',
    message: info.message === 'Unable to load records. Please try again.'
      ? 'Unable to load sales data. Please try again.'
      : info.message,
    detail: info.detail,
  };
}
