---
name: project_typeorm_raw_update_shape
description: "TypeORM's .query() returns [rows, rowCount] for a bare UPDATE/DELETE, so rows[0].col reads a property off the row array and is always undefined."
metadata: 
  node_type: memory
  type: project
  originSessionId: 3629a03a-9914-432c-abcf-940c749534ee
  modified: 2026-08-16T00:29:38.922Z
---

`repository.query()` / `dataSource.query()` do **not** return rows for an UPDATE or
DELETE. `PostgresQueryRunner` special-cases those command tags and returns
`[raw.rows, raw.rowCount]`. So `rows[0]` is the row *array*, and `rows[0].anyColumn`
is `undefined` — never `null`, never the value.

**Why:** this shipped a real bug in the M9 login lockout (PR #26). `RETURNING
"lockedUntil"` then `rows[0].lockedUntil !== null` was `undefined !== null` → **true
on every wrong password**, so the "account locked" warning email fired on every
failed attempt. Codex reported the symptom as a stale-expired-value problem; the
actual cause was this result shape, and it bit a second time in the same file when I
wrote the success-path reset the same way. `undefined` passing a `!== null` check is
the dangerous part — it fails open and looks like a working query.

**How to apply:** wrap the statement in a CTE so the command tag stays SELECT:

```sql
WITH updated AS (
  UPDATE "users" SET ... WHERE ... RETURNING "lockedUntil"
)
SELECT ("lockedUntil" IS NOT NULL) AS "justLocked" FROM updated
```

Rows then come back as written. Type the result (`Array<{ justLocked: boolean }>`) so
a future edit back to a bare UPDATE fails to compile rather than silently returning
`undefined`. Related: [[project_codex_review_rounds]].
