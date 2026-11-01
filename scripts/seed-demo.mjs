#!/usr/bin/env node
// Loads DEMONSTRATION data: creates 7 demo logins via the Supabase Admin API, then calls
// public.seed_demo_data() which creates departments, projects, ~60 tasks, plans and reviews (all flagged is_demo).
// Usage:  npm run seed:demo            (reads .env.local)
// Remove later from Settings → Data & maintenance, or: select public.clear_demo_data(); in the SQL editor.
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
const password = process.env.DEMO_PASSWORD ?? "Demo#2026pass";
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

const users = [
  { email: "hr.manager@demo.local", role: "admin", full_name: "Imran Qureshi" },
  { email: "team.lead@demo.local", role: "team_lead", full_name: "Fatima Raza" },
  { email: "employee1@demo.local", role: "employee", full_name: "Ayesha Khan" },
  { email: "employee2@demo.local", role: "employee", full_name: "Bilal Ahmed" },
  { email: "employee3@demo.local", role: "employee", full_name: "Sana Malik" },
  { email: "employee4@demo.local", role: "employee", full_name: "Usman Tariq" },
  { email: "employee5@demo.local", role: "employee", full_name: "Hira Siddiqui" },
];

for (const u of users) {
  const { error } = await admin.auth.admin.createUser({
    email: u.email, password, email_confirm: true, app_metadata: { role: u.role }, user_metadata: { full_name: u.full_name },
  });
  if (error && !/already/i.test(error.message)) {
    console.error(`✘ ${u.email}: ${error.message}`);
    process.exit(1);
  }
  console.log(`${error ? "•" : "✔"} ${u.email} (${u.role})${error ? " already exists" : ""}`);
}

const { data, error } = await admin.rpc("seed_demo_data");
if (error) {
  console.error("✘ seed_demo_data failed:", error.message);
  process.exit(1);
}
console.log("✔ Demo data loaded:", data);
console.log(`\nSign in with any demo account above. Password: ${password}`);
console.log("These accounts and records are marked DEMO. Delete them before real use.");
