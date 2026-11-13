// Supabase Edge Functions run under Deno; the root Expo TypeScript project does not include Deno typings.
// @ts-nocheck
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createStaffAuthHandler } from './handler.ts';

Deno.serve(createStaffAuthHandler({
  createClient,
  getEnv: (name) => Deno.env.get(name),
}));
