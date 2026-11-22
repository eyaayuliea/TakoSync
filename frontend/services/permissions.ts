/**
 * S2 — Role-Based Access Control with permission bitmasks
 * (Algorithm Architecture Specification §2.7, §3.7; US-RBAC-04).
 *
 * The database is the enforcement point. public.api_gate runs before every API
 * request and public.authorize implements the rule below. This module is the
 * same matrix and rule in TypeScript, so the apps can hide actions a role
 * cannot perform and the matrix can be unit tested. It also recognises the
 * gate's 403 so the app can record the denial in the audit log.
 *
 *   allow(u, R, β) = u.active ∧ ((u.roleMask & R) = R) ∧ (β = null ∨ u.role = OWNER ∨ u.branch_id = β)
 *
 * JavaScript bitwise operators work on 32-bit integers, so masks stay within 31 bits.
 * This module has no imports so it can be unit tested directly.
 */

export const PERMISSIONS = {
  SALE_CREATE: 0,
  SALES_VIEW_BRANCH: 1,
  SALES_VIEW_ALL: 2,
  INV_VIEW_BRANCH: 3,
  INV_VIEW_ALL: 4,
  BATCH_PREP_RECORD: 5,
  STOCKIN_RECORD: 6,
  WASTE_RECORD: 7,
  COUNT_SUBMIT: 8,
  COUNT_REVIEW: 9,
  ADJUSTMENT_AUTHORIZE: 10,
  CATALOG_CONFIG: 11,
  THRESHOLD_CONFIG: 12,
  ACCOUNT_MANAGE: 13,
  AUDIT_VIEW: 14,
  AUDIT_VERIFY: 15,
  REPORT_BRANCH: 16,
  REPORT_ALL: 17,
  ALERT_VIEW_BRANCH: 18,
  ALERT_VIEW_ALL: 19,
  WEB_PORTAL_ACCESS: 20,
  HISTORY_VIEW_BRANCH: 21,
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;
export type Role = 'owner' | 'staff' | 'system_admin';
export type AuthorizationDecision = 'ALLOW' | 'DENY_INACTIVE' | 'DENY_PERMISSION' | 'DENY_BRANCH_SCOPE';

export function permissionMask(...codes: PermissionCode[]): number {
  return codes.reduce((mask, code) => mask | (1 << PERMISSIONS[code]), 0);
}

export const ROLE_PERMISSIONS: Record<Role, readonly PermissionCode[]> = {
  staff: [
    'SALE_CREATE', 'SALES_VIEW_BRANCH', 'INV_VIEW_BRANCH', 'BATCH_PREP_RECORD', 'STOCKIN_RECORD',
    'WASTE_RECORD', 'COUNT_SUBMIT', 'REPORT_BRANCH', 'ALERT_VIEW_BRANCH', 'HISTORY_VIEW_BRANCH',
  ],
  owner: [
    'SALES_VIEW_BRANCH', 'SALES_VIEW_ALL', 'INV_VIEW_BRANCH', 'INV_VIEW_ALL', 'COUNT_REVIEW',
    'ADJUSTMENT_AUTHORIZE', 'CATALOG_CONFIG', 'THRESHOLD_CONFIG', 'ACCOUNT_MANAGE', 'AUDIT_VIEW',
    'AUDIT_VERIFY', 'REPORT_BRANCH', 'REPORT_ALL', 'ALERT_VIEW_BRANCH', 'ALERT_VIEW_ALL',
    'WEB_PORTAL_ACCESS', 'HISTORY_VIEW_BRANCH',
  ],
  system_admin: ['AUDIT_VERIFY'],
};

export const ROLE_MASKS: Record<Role, number> = {
  staff: permissionMask(...ROLE_PERMISSIONS.staff),
  owner: permissionMask(...ROLE_PERMISSIONS.owner),
  system_admin: permissionMask(...ROLE_PERMISSIONS.system_admin),
};

/** AUTHORIZE (§3.7). `user` must come from the server-side profile, not token claims. */
export function authorize(
  user: { role: Role; active: boolean; branchId: string | null } | null,
  required: number,
  resourceBranch: string | null = null,
): AuthorizationDecision {
  if (!user || !user.active) return 'DENY_INACTIVE';
  if ((ROLE_MASKS[user.role] & required) !== required) return 'DENY_PERMISSION';
  if (resourceBranch !== null && user.role !== 'owner' && user.branchId !== resourceBranch) return 'DENY_BRANCH_SCOPE';
  return 'ALLOW';
}

export function can(
  user: { role: Role; active: boolean; branchId: string | null } | null,
  code: PermissionCode,
  resourceBranch: string | null = null,
): boolean {
  return authorize(user, permissionMask(code), resourceBranch) === 'ALLOW';
}

export type GateDenial = { endpoint: string; reason: string; method: string };

/** The gate's 403 body ({ code: 'PT403', hint: 'PERMISSION_DENIED', details: JSON }), or null. */
export function parseGateDenial(status: number, body: unknown): GateDenial | null {
  if (status !== 403 || !body || typeof body !== 'object') return null;
  const error = body as { code?: unknown; hint?: unknown; details?: unknown };
  if (error.code !== 'PT403' || error.hint !== 'PERMISSION_DENIED' || typeof error.details !== 'string') return null;
  try {
    const details = JSON.parse(error.details) as { endpoint?: unknown; reason?: unknown; method?: unknown };
    if (typeof details.endpoint !== 'string') return null;
    return {
      endpoint: details.endpoint,
      reason: typeof details.reason === 'string' ? details.reason : 'DENY',
      method: typeof details.method === 'string' ? details.method : 'POST',
    };
  } catch {
    return null;
  }
}

/**
 * True when the gate refused a request because the account is deactivated
 * (DENY_INACTIVE). The gate refuses every request from such an account, so
 * callers must treat this as "deactivated", not as a connection problem
 * (ST-01 c10).
 */
export function isInactiveAccountDenial(error: unknown): boolean {
  return parseGateDenial(403, error)?.reason === 'DENY_INACTIVE';
}

/**
 * Wraps fetch so every gate denial is written to the audit log through
 * rpc/log_access_denial (AC-RBAC-04-05). Logging is best effort and never
 * changes the response the caller sees.
 */
export function withDenialAudit(baseFetch: typeof fetch, restUrl: string): typeof fetch {
  const logUrl = `${restUrl.replace(/\/+$/, '')}/rest/v1/rpc/log_access_denial`;
  return async (input, init) => {
    const response = await baseFetch(input, init);
    if (response.status !== 403) return response;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.includes('/rest/v1/') || url.startsWith(logUrl)) return response;
    try {
      const denial = parseGateDenial(403, await response.clone().json());
      if (denial) {
        const headers = new Headers(init?.headers ?? (typeof input === 'object' && 'headers' in input ? input.headers : undefined));
        headers.set('Content-Type', 'application/json');
        void baseFetch(logUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ p_endpoint: denial.endpoint, p_reason: denial.reason, p_method: denial.method }),
        }).catch(() => undefined);
      }
    } catch {
      // Not a JSON gate response; nothing to log.
    }
    return response;
  };
}
