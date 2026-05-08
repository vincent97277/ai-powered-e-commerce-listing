# Compile-time tenant isolation: an ESLint rule that prevents the worst RLS bug

> A pragmatic boundary guard layered on top of Postgres Row-Level Security. Not novel architecture — just one extra rung on a ladder of layers, where the rung happens to fail at lint time instead of at 3 AM during an incident review. Code excerpts are anchored to the live repo via a drift checker; if any line drifts, CI fails.

## The bug class this is about

You build a multi-tenant SaaS. You enable Postgres RLS, write a `tenant_id = current_setting('app.tenant_id')` policy, set the GUC at the start of every request, sleep at night.

Then someone on your team writes a one-line "quick admin lookup" inside a user-facing route handler using the BYPASSRLS connection. It ships to prod. You discover it three months later when the cost dashboard cross-tenants and a merchant sees another merchant's AI bill.

The lint rule below is the "no, you cannot accidentally do that" rung. It catches the import statement, not the query — which is the whole point.

## The stack of layers (sell the stack, not the rule)

```
┌─ Postgres ────────────────────────────────────────────────┐
│ 1. Two roles: web_anon (RLS-enforced) + web_admin         │
│    (BYPASSRLS). Roles wired to two DSNs.                  │
│ 2. Per-table policy with WITH CHECK on every USING.       │
│ 3. nullif(...,'')::uuid → no tenant context = 0 rows.     │
└────────────────────────────────────────────────────────────┘
┌─ App boundary ────────────────────────────────────────────┐
│ 4. withTenantTx(uuid, fn) wrapper: UUID guard +           │
│    set_config in transaction + auto-reset on commit.      │
└────────────────────────────────────────────────────────────┘
┌─ TypeScript / lint ───────────────────────────────────────┐
│ 5. ESLint no-restricted-imports gates dbAdmin import      │
│    by exact-file allowlist.                                │
└────────────────────────────────────────────────────────────┘
┌─ Tests ───────────────────────────────────────────────────┐
│ 6. Cross-tenant SELECT/INSERT deny tests.                 │
│ 7. Role-escalation deny test (SET ROLE / SET SESSION).    │
└────────────────────────────────────────────────────────────┘
```

Layers 1-3 are the actual security boundary. Layer 5 is what this post is about; it's the thinnest layer in the stack but it's the one that turns "I forgot" into a CI failure on a Tuesday afternoon instead of an incident on a Saturday night.

## Layer 2 in 4 lines: WITH CHECK is non-negotiable

The unit of safety isn't the SELECT policy; it's that the WITH CHECK refuses to write rows under the wrong tenant context. Most multi-tenant RLS articles only show the USING clause. Without WITH CHECK, an attacker (or buggy code) under tenant A can INSERT a row stamped with tenant B's id, and Postgres will let it.

<!-- src: drizzle/migrations/0001a_init_rls.sql:37-40 -->
```sql
CREATE POLICY tenant_isolation ON products
  FOR ALL TO web_anon
  USING      (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
```

The `nullif(..., '')::uuid` is doing real work: when no GUC is set (a connection that forgot to call `set_config`), `current_setting('app.tenant_id', true)` returns the empty string, `nullif` turns that into NULL, and `tenant_id = NULL` evaluates to NULL → false → 0 rows. Fail-closed. A first principle of tenant isolation: if the context is missing, the answer is empty, not "all rows."

## Layer 4: one wrapper, no exceptions, type-checked

Every read or write that should be RLS-scoped goes through this exact 25-line file. Routes don't call `set_config` themselves; if they did, they'd ship a string-concat SQL injection sooner or later when the `tenantId` came from a cookie that wasn't validated.

<!-- src: src/lib/db/with-tenant.ts:7-31 -->
```ts
import { sql } from 'drizzle-orm';
import { dbUser } from '@/db';

/** UUID v4 格式檢查 — 任何非 UUID 字串直接拒絕 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 在 RLS context 下執行 transaction
 * @param tenantId - 從 cookie 解析出的 merchant.id (UUID)
 * @param fn       - transaction callback，收到 tx 物件
 */
export async function withTenantTx<T>(
  tenantId: string,
  fn: (tx: Parameters<Parameters<typeof dbUser.transaction>[0]>[0]) => Promise<T>,
): Promise<T> {
  if (!UUID_REGEX.test(tenantId)) {
    throw new Error(`[withTenantTx] 無效 tenant_id 格式: ${tenantId}`);
  }

  return dbUser.transaction(async (tx) => {
    // is_local=true → 僅當前 transaction 生效，COMMIT/ROLLBACK 後自動清除
    await tx.execute(sql`SELECT set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
```

Three things this gives you:
1. The UUID regex rejects anything that isn't a UUID before it reaches `set_config`. A cookie whose value is `"99999999-9999'); DROP TABLE products; --"` throws at the wrapper, not the DB.
2. The transaction scope is explicit. `is_local=true` means the GUC dies with the transaction. No leaked context to the next pooled connection.
3. The function signature forces every caller to pass a tenant id at the type level. There's no escape hatch like "no-tenant mode."

## Layer 5: the actual rule

Now the part the post is about. The setup is `eslint-plugin`-free; just a single `no-restricted-imports` config that bans both `dbAdmin` and `dbUser` exports from `@/db`, plus a second entry for the dedicated `@/db/admin-only` module.

Why both? `dbAdmin` is the BYPASSRLS connection — the obvious leak. But `dbUser` (the RLS-enforced one) is just as dangerous if used directly: it skips the `withTenantTx` wrapper, the GUC never gets set, and every query fails-closed to 0 rows. The developer's instinct after seeing 0 rows is "switch to dbAdmin to debug" — which IS the leak. So the rule funnels every tenant-scoped query through `withTenantTx` (Layer 4), and any direct import of either handle from outside the allowlist fails CI.

<!-- src: eslint.config.mjs:49-70 -->
```js
const dbAdminRule = {
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@/db',
            importNames: ['dbAdmin', 'dbUser'],
            message:
              'dbAdmin 會繞過 RLS, dbUser 直用會 fail-closed 0 rows (RLS GUC 未設)。請 import withTenantTx — 它 dbUser-backed + UUID-guarded + tx-scoped。如果你是 admin / 跨 tenant observability, 移到 (admin)/ 或 lib/db/admin-only/。',
          },
          {
            name: '@/db/admin-only',
            message:
              'admin-only 模組僅允許 (admin)/** / lib/tenant/resolver.ts 使用',
          },
        ],
      },
    ],
  },
};
```

The default state of every file in the codebase is "you cannot import either DB handle directly." Then a second rule block flips the ban off for an explicit allowlist of paths — admin pages, observability code, Inngest workers, system queries, plus the `with-tenant.ts` wrapper itself (which IS dbUser-based). To add a new file to the allowlist you have to edit `eslint.config.mjs`, and that diff is the artifact a reviewer reads.

In a project I've been building this is currently the entire allowlist:

- platform admin UI (`(admin)/**`)
- platform cost / cross-tenant observability (`lib/observability/**`, `lib/admin/**`, `lib/onboarding/**`)
- Inngest workers (`inngest/**`)
- merchant resolution from session/slug (`lib/tenant/resolver.ts`, two layout files, two session managers)
- a few system paths (`api/health`, `api/products/generate`, `db/index.ts`)
- one user-facing UPDATE path on a table that intentionally has no RLS policy (more on that below)

That's it. Every file outside the allowlist that imports `dbAdmin` fails CI.

## What the rule does NOT do — and why I'm telling you on purpose

If you're reading this on Hacker News, the first comment is going to ask "what about [bypass route X]?" Here's the list of bypass routes I know about, named so you don't have to find them:

1. **Module-specifier matching is exact.** `no-restricted-imports` matches `'@/db'` and `'@/db/admin-only'` literally. Importing from `'@/db/index'` instead of `'@/db'` slips past the rule. Mitigation: TypeScript's path config canonicalizes most of these in practice, and the next layer (RLS at the DB) catches the actual data leak — but if someone wants to bypass the lint rule, a single character of indirection in the import path does it.
2. **Dynamic imports.** `const { dbAdmin } = await import('@/db')` with a computed string defeats the static analyzer.
3. **Re-export laundering.** Any allowlisted file can re-export `dbAdmin`, and a non-allowlisted file imports the re-export. The rule doesn't follow re-exports.
4. **`eslint-disable` comments.** `// eslint-disable-next-line no-restricted-imports` works, as it does for any ESLint rule. CI greps for these in code review, but the grep is a process, not a guarantee.

This is why the post leads with "the lint rule is one rung on a ladder, not the ladder." If your defense relies on a single ESLint rule, you have one defense. The actual security boundary is RLS at the database layer; this rule prevents the **accidental** misuse, which is overwhelmingly the bug class that ships to prod, not the **adversarial** one. RCE in your own server still gets you all tenants' data — the threat model is honest about that.

## Layer 6: the test that pins the policy

It's possible to write all of the above and have someone drop the WITH CHECK in a future migration "just to debug something" and never put it back. RLS tests prevent that.

<!-- src: tests/rls.e2e.test.ts:103-129 -->
```ts
  it('T2: tenant A cannot read tenant B rows + WITH CHECK blocks cross-tenant insert', async () => {
    const result = await dbUser.transaction(async (tx) => {
      await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
      return await tx.execute(sql`SELECT title FROM products`);
    });
    const titles = result.rows.map((r: any) => r.title);
    expect(titles).toContain('A-item');
    expect(titles).not.toContain('B-item');

    // WITH CHECK：嘗試插 tenant B 的資料但 context 是 A → 應該被拒
    await expectRejectsMatching(
      dbUser.transaction(async (tx) => {
        await tx.execute(sql`SELECT set_config('app.tenant_id', ${TENANT_A}, true)`);
        await tx.execute(sql`
          INSERT INTO products (tenant_id, title, description, r2_key, ai_metadata)
          VALUES (
            ${TENANT_B}::uuid,
            'evil',
            'cross tenant attempt',
            'test/evil.jpg',
            '{}'::jsonb
          )
        `);
      }),
      /row-level security/i,
    );
  });
```

Two pins in eight assertions: tenant A reads only its own rows under context A, and INSERT attempting to stamp a row with tenant B's id under context A is rejected by the WITH CHECK. A future migration that drops the WITH CHECK fails this test on the first run.

`expectRejectsMatching` exists because Drizzle 0.45+ wraps the underlying postgres error in a `DrizzleQueryError` and `.message` becomes "Failed query: ..." rather than the postgres permission text. Vitest's bare `.rejects.toThrow(/regex/)` only matches the templated query, not the original error — so the regex passes when the query fails for the wrong reason. The helper walks the `.cause` chain and joins all `.message` strings before testing the regex. The test files in the repo all use it.

## Layer 6, role-escalation pin

This one matters because it's the failure mode that's invisible without a test. If your `web_anon` role somehow gains the ability to `SET ROLE web_admin`, all of the above evaporates. You don't notice in normal traffic because nothing tries.

<!-- src: tests/rls.e2e.test.ts:137-142 -->
```ts
  it('T3: web_anon cannot escalate to bypass RLS', async () => {
    // 嘗試切到 BYPASSRLS role 應失敗 (web_anon 沒被 GRANT 到 web_admin)
    await expectRejectsMatching(
      dbUser.execute(sql`SET ROLE web_admin`),
      /permission denied|must be member|does not exist|不存在/i,
    );
```

Tiny test, large guarantee. If a future GRANT statement quietly hands `web_admin` membership to `web_anon`, this fails immediately.

## The boring takeaway

If you only take one thing from this post: **WITH CHECK on every policy, an `import` boundary as a thin lint rule on top, and a test for both.** The Postgres docs cover the first part. The second is fifteen lines of `eslint.config.mjs`. The third is one test you write once and never look at until it saves you.

The rule is not novel. It is a pragmatic boundary guard around primitives that already exist. What's worth copying isn't the rule — it's the discipline of putting the layers on the same diagram and naming the failure mode each one stops.

## Code is in the repo, drift-checked

Every code excerpt above is anchored via `<!-- src: path:line-line -->` markers in the markdown source. A drift checker runs in CI and fails if any snippet diverges from the file it claims to quote. So if you read this six months from now and the line numbers have shifted, either the post or the codebase has been edited — and CI caught the divergence on whichever PR introduced it.

The reference repo: [rls-ai-shop on GitHub](https://github.com/vincent97277/ai-powered-e-commerce-listing) (Apache-2.0).

Honest disclaimer: that repo is a portfolio / showcase project, not a production SaaS. The patterns are the same ones I'd use in production; the limitations are documented in `ARCHITECTURE.md` §4.4 ("Honest threat model for `web_admin`"). The rule does not save you from RCE. It saves you from yourself.
