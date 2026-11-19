export type AuthSessionEvent =
  | 'INITIAL_SESSION'
  | 'PASSWORD_RECOVERY'
  | 'SIGNED_IN'
  | 'SIGNED_OUT'
  | 'TOKEN_REFRESHED'
  | 'USER_UPDATED'
  | 'MFA_CHALLENGE_VERIFIED';

export type AuthenticatedMobileDestination = 'dashboard' | 'staffWorkspace';

export function getAuthenticatedMobileDestination(
  role: 'Owner' | 'Staff',
): AuthenticatedMobileDestination {
  if (role === 'Owner') return 'dashboard';
  return 'staffWorkspace';
}

/**
 * An explicit logout already drives its own navigation. Other SIGNED_OUT
 * events must clear the mobile session immediately so revoked or expired Auth
 * sessions cannot leave a privileged workspace visible.
 */
export function shouldClearMobileSession(event: AuthSessionEvent, logoutInProgress: boolean): boolean {
  return event === 'SIGNED_OUT' && !logoutInProgress;
}
