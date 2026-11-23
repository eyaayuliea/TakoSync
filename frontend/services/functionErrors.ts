/**
 * Supabase `functions.invoke` reports every non-2xx answer as an error and drops
 * the body, so a refusal such as 409 "Each branch can have at most two Staff
 * accounts." (OW-27 c3) would reach the screen as a generic message. The
 * original Response is kept on `error.context`; this reads the function's own
 * `{ ok: false, error }` message from it.
 *
 * This module has no imports so it can be unit tested directly.
 */
/** OW-31 c3: shown when the request never reached the server. */
export const FUNCTION_CONNECTION_MESSAGE = 'Unable to connect. Please check your internet connection and try again.';

export async function functionErrorMessage(error: unknown, fallback: string): Promise<string> {
  // supabase-js raises FunctionsFetchError when the request could not be sent (offline).
  const name = (error as { name?: unknown } | null)?.name;
  const text = (error as { message?: unknown } | null)?.message;
  if (name === 'FunctionsFetchError' || (typeof text === 'string' && /failed to send a request|failed to fetch|network/i.test(text))) {
    return FUNCTION_CONNECTION_MESSAGE;
  }
  const context = (error as { context?: unknown } | null)?.context;
  if (!context || typeof (context as { json?: unknown }).json !== 'function') return fallback;
  try {
    const response = context as { status?: number; clone?: () => { json: () => Promise<unknown> }; json: () => Promise<unknown> };
    // Only 4xx answers carry a message written for the user; 5xx details stay hidden.
    if (typeof response.status === 'number' && (response.status < 400 || response.status >= 500)) return fallback;
    const body = await (typeof response.clone === 'function' ? response.clone() : response).json() as { error?: unknown } | null;
    const message = typeof body?.error === 'string' ? body.error.trim() : '';
    return message || fallback;
  } catch {
    return fallback;
  }
}
