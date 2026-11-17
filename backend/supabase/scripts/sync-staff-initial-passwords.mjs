#!/usr/bin/env node

/**
 * One-time administrative Staff credential synchronization.
 *
 * Safe by default: without --apply this only performs the complete preflight
 * and prints a non-secret preview. The service-role key must be supplied in
 * the server/admin shell and is never read by frontend code.
 */
import { createClient } from '@supabase/supabase-js';

const APPLY_FLAG = '--apply';
const CONFIRM_FLAG = '--confirm-staff-password-sync';
const EMPLOYEE_ID_PATTERN = /^EMP-[0-9]{4}-[0-9]{6}$/;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) fail(`Missing required environment variable ${name}.`);
  return value;
}

function parseArgs() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has(APPLY_FLAG);
  if (args.has('--help') || args.has('-h')) {
    console.log('Dry run: node backend/supabase/scripts/sync-staff-initial-passwords.mjs');
    console.log('Apply:   node backend/supabase/scripts/sync-staff-initial-passwords.mjs --apply --confirm-staff-password-sync');
    process.exit(0);
  }
  if (apply && !args.has(CONFIRM_FLAG)) {
    fail(`Applying changes requires ${CONFIRM_FLAG}.`);
  }
  return { apply };
}

function branchLabel(branches, branchId) {
  return branches.get(branchId) ?? 'Branch unavailable';
}

function previewAccount(profile, authUser, branches, profileEmailMatchesAuth) {
  return {
    username: profile.username,
    status: profile.active ? 'active' : 'inactive',
    branch: branchLabel(branches, profile.branch_id),
    authUidMatchesProfile: authUser.id === profile.id,
    authEmailPresent: Boolean(authUser.email),
    profileEmailMatchesAuth,
    mustChangePassword: profile.must_change_password === true,
  };
}

async function preflight(admin) {
  const { data: profiles, error: profileError } = await admin
    .from('profiles')
    .select('id, username, email, role, active, branch_id, employee_id, must_change_password')
    .eq('role', 'staff')
    .order('username');
  if (profileError) fail(`Could not load Staff profiles: ${profileError.message}`);
  if (!Array.isArray(profiles) || profiles.length !== 6) {
    fail(`Expected exactly 6 Staff profiles, found ${profiles?.length ?? 0}. No changes were made.`);
  }

  const { data: branches, error: branchError } = await admin
    .from('branches')
    .select('id, code, name')
    .in('id', profiles.map((profile) => profile.branch_id));
  if (branchError) fail(`Could not load Staff branches: ${branchError.message}`);
  const branchIds = new Set(profiles.map((profile) => profile.branch_id));
  if ((branches ?? []).length !== branchIds.size) {
    fail('One or more Staff profiles has no matching branch record. No changes were made.');
  }
  const branchNames = new Map((branches ?? []).map((branch) => [branch.id, `${branch.code} (${branch.name})`]));

  const records = [];
  for (const profile of profiles) {
    if (profile.role !== 'staff') fail('A selected profile did not have Staff role. No changes were made.');
    if (!profile.id || !profile.username || !profile.branch_id) {
      fail('A Staff profile is missing its identity, username, or branch assignment. No changes were made.');
    }
    if (!EMPLOYEE_ID_PATTERN.test(profile.employee_id ?? '')) {
      fail(`Staff profile ${profile.username} does not have a valid Employee ID. No changes were made.`);
    }

    let authResult;
    try {
      authResult = await admin.auth.admin.getUserById(profile.id);
    } catch {
      fail(`Could not retrieve the Auth user for Staff profile ${profile.username}. No changes were made.`);
    }
    if (authResult.error || !authResult.data?.user) {
      fail(`No matching Auth user exists for Staff profile ${profile.username}. No changes were made.`);
    }
    const authUser = authResult.data.user;
    if (authUser.id !== profile.id || !authUser.email) {
      fail(`Auth identity validation failed for Staff profile ${profile.username}. No changes were made.`);
    }
    records.push({
      profile,
      authUser,
      profileEmailMatchesAuth: typeof profile.email === 'string'
        && profile.email.trim().toLowerCase() === authUser.email.trim().toLowerCase(),
    });
  }

  return { records, branches: branchNames };
}

async function applyUpdates(admin, records) {
  const results = [];
  for (const { profile } of records) {
    try {
      const passwordResult = await admin.auth.admin.updateUserById(profile.id, {
        password: profile.employee_id,
      });
      if (passwordResult.error) throw new Error('Auth password update failed.');

      const { data: updatedProfile, error: profileError } = await admin
        .from('profiles')
        .update({ must_change_password: true })
        .eq('id', profile.id)
        .eq('role', 'staff')
        .select('id, must_change_password')
        .single();
      if (profileError || updatedProfile?.must_change_password !== true) {
        throw new Error('Staff first-login flag update failed.');
      }
      results.push({ username: profile.username, status: 'succeeded' });
    } catch (error) {
      results.push({
        username: profile.username,
        status: 'failed',
        reason: error instanceof Error ? error.message : 'Unknown update failure.',
      });
    }
  }
  return results;
}

async function main() {
  const { apply } = parseArgs();
  const url = requiredEnv('SUPABASE_URL');
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(apply ? 'Mode: APPLY (explicit confirmation supplied)' : 'Mode: DRY RUN (no changes will be made)');
  const { records, branches } = await preflight(admin);
  console.log(`Preflight passed: exactly ${records.length} Staff profiles and matching Auth users found.`);
  console.log('Preview (no passwords or Employee IDs are shown):');
  for (const { profile, authUser, profileEmailMatchesAuth } of records) {
    console.log(JSON.stringify(previewAccount(profile, authUser, branches, profileEmailMatchesAuth)));
  }

  if (!apply) {
    console.log('Dry run complete. No passwords or profile flags were changed.');
    return;
  }

  const results = await applyUpdates(admin, records);
  for (const result of results) console.log(JSON.stringify(result));
  const failures = results.filter((result) => result.status === 'failed');
  if (failures.length > 0) {
    fail(`${failures.length} Staff update(s) failed. Review the per-account results above.`);
  }
  console.log('All six Staff accounts were synchronized successfully.');
}

main().catch((error) => {
  if (process.exitCode !== 1) {
    console.error(`ERROR: ${error instanceof Error ? error.message : 'Administrative operation failed.'}`);
    process.exitCode = 1;
  }
});
