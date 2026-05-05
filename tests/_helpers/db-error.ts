/**
 * drizzle-orm 0.45+ wraps the underlying driver error in DrizzleQueryError.
 * The original postgres message ("row-level security policy" / "permission
 * denied for table") is on `err.cause.message`; `err.message` is the
 * templated "Failed query: <SQL>\nparams: ...".
 *
 * vitest's `.rejects.toThrow(regex)` only consults `err.message`, so it
 * misses the real driver-level text. Use `expectRejectsMatching` whenever
 * the regex you care about is the postgres / driver error string, not
 * application-level error text.
 *
 * Walks the full `.cause` chain (max 10 deep) and joins all `.message`
 * strings before regex test. Works on both pre-0.45 (no `.cause`) and
 * post-0.45 (wrapped) drizzle.
 */
export async function expectRejectsMatching(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  try {
    await promise;
  } catch (e: unknown) {
    const parts: string[] = [];
    let cur: unknown = e;
    for (let i = 0; i < 10 && cur; i++) {
      const m = (cur as { message?: unknown }).message;
      if (typeof m === 'string') parts.push(m);
      cur = (cur as { cause?: unknown }).cause;
    }
    const joined = parts.join(' | ');
    if (pattern.test(joined)) return;
    throw new Error(
      `Expected error matching ${pattern} but error chain was:\n${joined}`,
    );
  }
  throw new Error(
    `Expected promise to reject with ${pattern} but it resolved successfully`,
  );
}
