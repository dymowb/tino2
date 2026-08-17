---
name: project-node22-toolchain
description: Repo requires Node 22.12 via nvm; system Node 18 still runs pm2/prod. Source nvm in every Bash call.
metadata: 
  node_type: memory
  type: project
  originSessionId: f11a3c16-04b0-4198-ab9a-468462d77759
  modified: 2026-08-10T03:42:55.040Z
---

The repo pins `node >=22.12.0 <23` (root, backend, frontend, plus `.nvmrc` and `use-node22.sh`).
Node 22.12.0 is installed via nvm at `~/.nvm`; the machine's system Node is 18.19.1 at
`/usr/bin/node`, and global tools (`pm2`, `@stripe/cli`, `@openai/codex`) live under it in
`/usr/local/lib`.

**Why:** the Bash tool starts a fresh non-interactive shell each call, which does not load nvm,
so commands silently run on Node 18 and installs/builds misbehave.

**How to apply:** prefix any npm/node/npx call with

```bash
export NVM_DIR="$HOME/.nvm"; . "$NVM_DIR/nvm.sh"; nvm use 22.12.0 >/dev/null; hash -r
```

`pm2` still resolves from `/usr/local/bin` under either Node (nvm prepends to PATH, it does not
replace it), so production is unaffected by the switch.

Related: [[project-main-is-pr-only]], [[project-production]]
