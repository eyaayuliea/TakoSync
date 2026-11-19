// Turns a load failure into a friendly message that still tells the Owner what actually went
// wrong. The record screens used to show "check your internet connection" for every failure,
// which hid database, permission and schema problems behind a network message.

export type OwnerRecordErrorInfo = {
  /** Friendly, actionable explanation. */
  message: string;
  /** The underlying error text, when it adds information beyond `message`. */
  detail: string | null;
};

export const OWNER_RECORD_NETWORK_MESSAGE =
  'Unable to load data. Please check your internet connection and try again.';

const MAX_DETAIL_LENGTH = 240;

function rawMessage(error: unknown): string {
  if (typeof error === 'string') return error.trim();
  if (error && typeof error === 'object') {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
}

export function describeOwnerRecordError(error: unknown): OwnerRecordErrorInfo {
  const raw = rawMessage(error);
  const lower = raw.toLowerCase();
  const detail = raw && raw !== OWNER_RECORD_NETWORK_MESSAGE
    ? (raw.length > MAX_DETAIL_LENGTH ? `${raw.slice(0, MAX_DETAIL_LENGTH - 1)}…` : raw)
    : null;

  if (/could not find the (function|table)|schema cache|pgrst20\d|relation .* does not exist|function .* does not exist|column .* does not exist/.test(lower)) {
    return {
      message: 'The database is missing something this screen needs. Ask the administrator to apply the latest database migrations, then retry.',
      detail,
    };
  }
  if (/permission denied|row-level security|not authorized|unauthorized|access denied|authentication is required|invalid jwt|jwt expired|42501/.test(lower)) {
    return {
      message: 'This account is not allowed to read these records. Sign in again, or check that the Owner account is active.',
      detail,
    };
  }
  if (/failed to fetch|network request failed|networkerror|load failed|timed out|timeout|unable to connect|unable to reach|econnrefused|enotfound/.test(lower)) {
    return { message: OWNER_RECORD_NETWORK_MESSAGE, detail: detail && detail !== OWNER_RECORD_NETWORK_MESSAGE ? detail : null };
  }
  if (!raw) return { message: 'Unable to load records. Please try again.', detail: null };
  return { message: 'Unable to load records. Please try again.', detail };
}
