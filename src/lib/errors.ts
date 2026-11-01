/** Turns Supabase/PostgREST/PostgreSQL errors into short, user-friendly messages. */
export function friendlyError(error: unknown): string {
  if (!error) return "Something went wrong.";
  const e = error as { message?: string; code?: string; details?: string };
  const msg = e.message ?? String(error);
  if (e.code === "42501" || /row-level security|permission denied/i.test(msg)) {
    return /row-level security|permission denied/i.test(msg) ? "You do not have permission to perform this action." : msg;
  }
  if (e.code === "23505" || /duplicate key/i.test(msg)) {
    if (/email/i.test(msg)) return "That e-mail address is already in use.";
    if (/employee_code/i.test(msg)) return "That employee ID is already in use.";
    return "A record with the same unique value already exists.";
  }
  if (e.code === "23503" || /foreign key/i.test(msg)) return "This record is linked to other data and cannot be changed this way.";
  if (e.code === "23514" || /check constraint/i.test(msg)) return "Some values are outside the allowed range. Please check the form.";
  if (/JWT|not authenticated/i.test(msg)) return "Your session has expired. Please sign in again.";
  if (/fetch failed|network/i.test(msg)) return "Cannot reach the database. Check your connection and Supabase configuration.";
  return msg.replace(/^ERROR:\s*/, "");
}
