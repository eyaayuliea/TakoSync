// OW-31 c2, c3, c10 / OW-02 c9: the messages the Owner Web Portal shows when
// loading or saving fails. A lost connection says so; technical details
// (exception names, database codes, JSON or SQL text) are never shown.

export const OWNER_PORTAL_CONNECTION_MESSAGE = 'Unable to connect. Please check your internet connection and try again.';
export const OWNER_PORTAL_SETUP_MESSAGE = 'This feature needs the latest database update. Ask the administrator to apply it, then try again.';
export const OWNER_PORTAL_ACCESS_MESSAGE = 'This Owner account is not allowed to do that. Log in again, or check that the account is active.';

function rawText(reason: unknown): string {
  if (typeof reason === 'string') return reason.trim();
  if (reason && typeof reason === 'object') {
    const message = (reason as { message?: unknown }).message;
    if (typeof message === 'string') return message.trim();
  }
  return '';
}

const CONNECTION = /failed to fetch|network ?(request failed|error)|networkerror|load failed|fetch failed|timed? ?out|timeout|unable to connect|unable to reach|econnrefused|enotfound|internet connection|offline/i;
const SETUP = /could not find the (function|table)|schema cache|pgrst20\d|relation .* does not exist|function .* does not exist|column .* does not exist/i;
const ACCESS = /permission denied|row-level security|not authorized|unauthorized|access denied|invalid jwt|jwt expired|42501/i;
const TECHNICAL = /typeerror|referenceerror|syntaxerror|rangeerror|\bundefined\b|\bnull\b|json|pgrst|sqlstate|violates|constraint|duplicate key|\bat [\w.<>]+ \(|[{}[\]<>]|edge function|functionshttperror|non-2xx|status code|\b[0-9a-f]{8}-[0-9a-f]{4}-/i;

export function isOwnerPortalConnectionError(reason: unknown): boolean {
  if (typeof TypeError !== 'undefined' && reason instanceof TypeError && /fetch|network|load failed/i.test(reason.message)) return true;
  const status = (reason as { status?: unknown } | null)?.status;
  return status === 0 || CONNECTION.test(rawText(reason));
}

/**
 * A message safe to show the owner: the connection message, a setup or access
 * message, the app's own plain message, or `fallback` for anything technical.
 */
export function ownerPortalErrorText(reason: unknown, fallback: string): string {
  const text = rawText(reason);
  if (isOwnerPortalConnectionError(reason)) return OWNER_PORTAL_CONNECTION_MESSAGE;
  if (SETUP.test(text)) return OWNER_PORTAL_SETUP_MESSAGE;
  if (ACCESS.test(text)) return OWNER_PORTAL_ACCESS_MESSAGE;
  if (!text || TECHNICAL.test(text) || text.length > 240) return fallback;
  return text;
}
