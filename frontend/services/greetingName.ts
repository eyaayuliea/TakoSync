// Greetings are on a first-name basis: "Hello, Angelo!", not the full name.
//
// This module has no imports so it can be unit tested directly.

/** The owner is greeted as Angelo when the owner account has no name saved. */
export const OWNER_GREETING_NAME = 'Angelo';

/**
 * The first name of a saved name, or '' when there is none. An account without a
 * name falls back to its e-mail address elsewhere; that is not a name to greet with.
 * Staff usernames are made from the employee's name plus "_staff", and some
 * accounts have that username saved as their name.
 */
export function greetingFirstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed || trimmed.includes('@')) return '';
  const first = trimmed.split(/\s+/)[0];
  // A staff account saved with its username as the name ("bien_staff") is greeted
  // by the name inside it: "Bien".
  if (/[_.]/.test(first)) {
    const part = first.split(/[_.]/)[0];
    if (!part) return '';
    return part === part.toLowerCase() ? part.charAt(0).toUpperCase() + part.slice(1) : part;
  }
  return first;
}

/** The owner's first name, or Angelo when the account has no name. */
export function ownerGreetingName(name: string | null | undefined): string {
  return greetingFirstName(name) || OWNER_GREETING_NAME;
}

/** "Hello, Jubeth!" — or just "Hello!" for an account without a name. */
export function helloGreeting(firstName: string): string {
  return firstName ? `Hello, ${firstName}!` : 'Hello!';
}
