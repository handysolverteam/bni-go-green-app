// Supabase's own JS client throws PostgrestError as a plain object
// ({ message, details, hint, code }), not an Error instance -- so
// `err instanceof Error ? err.message : "generic fallback"` silently
// swallows the actual database error message for every query failure
// (e.g. "relation renewals.members does not exist"), which is exactly the
// failure mode that made the missing-schema 500s hard to diagnose from the
// client. This checks for a `.message` string on any object, not just
// real Errors.

export function extractErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof Error) {
    return err.message;
  }

  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }

  return fallback;
}
