#!/usr/bin/env node
// Creates the first real administrator account.
// Usage:  npm run create-admin -- admin@yourcompany.com "Full Name" "TemporaryPass123"
import { createClient } from "@supabase/supabase-js";

const [email, fullName, password] = process.argv.slice(2);
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;

if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
if (!email || !fullName || !password || password.length < 10) {
  console.error('Usage: npm run create-admin -- <email> "<Full Name>" "<password, min 10 chars>"');
  process.exit(1);
}

const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data, error } = await admin.auth.admin.createUser({
  email, password, email_confirm: true, app_metadata: { role: "admin" }, user_metadata: { full_name: fullName },
});
if (error) {
  console.error("✘", error.message);
  process.exit(1);
}
// The auth trigger creates the profile with role=admin from app_metadata; make sure it is active.
const { error: pErr } = await admin.from("profiles").update({ role: "admin", is_active: true, designation: "HR Manager" }).eq("id", data.user.id);
if (pErr) console.warn("Profile update warning:", pErr.message);
console.log(`✔ Administrator created: ${email}. Sign in and change the password from My profile.`);
