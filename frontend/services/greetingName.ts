// Greetings are on a first-name basis: "Hello, Angelo!", not the full name.
//
// This module has no imports so it can be unit tested directly.

/** The owner is greeted as Angelo when the owner account has no name saved. */
export const OWNER_GREETING_NAME = 'Angelo';

/**
 * The first name of a saved name, or '' when there is none. An account without a
 * name falls back to its e-mail address elsewhere; that is not a name to greet with.
 */
export function greetingFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.includes('@')) return '';
  return trimmed.split(/\s+/)[0];
}

/** The owner's first name, or Angelo when the account has no name. */
export function ownerGreetingName(name: string | null | undefined): string {
  return greetingFirstName(name) || OWNER_GREETING_NAME;
}

/** "Hello, Jubeth!" — or just "Hello!" for an account without a name. */
export function helloGreeting(firstName: string): string {
  return firstName ? `Hello, ${firstName}!` : 'Hello!';
}
