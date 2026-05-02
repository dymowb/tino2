---
name: Server startup on Windows Git Bash
description: How to start/stop dev servers reliably in this project on Windows Git Bash
type: feedback
---

Use `bash start-servers.sh` from the repo root — it handles everything (kill ports, nohup launch, log files).

**Why:** `lsof` and `pkill` don't exist in Git Bash (MSYS2). Background `&` without `nohup` kills child processes when the subshell exits.

**How to apply:**
- To start: `cd C:/Users/jrdym/Dev/tino2 && bash start-servers.sh`
- To stop: `bash stop-servers.sh`
- To check logs: `tail -f logs/backend.log` or `logs/frontend.log`
- Do NOT try to start servers manually with `npm run dev &` or `npm start &` — they die when the subshell exits
- Backend is on port 3000, frontend on port 3001
