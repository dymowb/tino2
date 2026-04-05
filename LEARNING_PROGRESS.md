# Learning Calibration Tracker

**Purpose**: Help Claude adjust teaching difficulty and intervention style across sessions.

**Last Updated**: 2026-02-28

---

## Current Calibration Settings

### Difficulty Level: **Advanced — System Design & Agentic Focus**
- TypeScript/coding syntax: comfortable, no longer a teaching focus
- Primary learning areas: system design tradeoffs, agentic patterns, prompt engineering
- Ready for architecture-level discussions and decisions

### Intervention Style: **Claude takes the wheel**
- Claude implements autonomously at speed
- Explains interesting design decisions and patterns inline (brief)
- User engages on architecture, agentic design, and "why" decisions
- No coding exercises unless user explicitly asks

---

## What to Explain More (Needs Reinforcement)

- **Complex async patterns** — Promise.race(), timeout wrappers needed some explanation
- **TypeScript edge cases** — null handling, type narrowing still occasionally trips up
- **Frontend hook patterns** — `useEffect` dependency arrays, stale closure traps

## What's Working Well (Move Fast)

- **Agent pattern architecture** — grasps reflection, planning, tool use quickly
- **TypeScript interfaces & generics** — solid, can write from scratch
- **Array methods** — `.map()`, `.filter()`, `.reduce()`, `Set` — fluent
- **Debugging** — reads logs and traces errors effectively
- **Design decisions** — asks good questions, evaluates tradeoffs well
- **Full-stack thinking** — connects backend changes to frontend impact

---

## Calibration Signals

### Decrease Difficulty (need more help):
- Asking "check this?" more than twice on same task
- Stuck >2 attempts on same concept

### Increase Difficulty (ready for more):
- Completing tasks on first try
- Suggesting improvements unprompted
- Asking architectural questions

### Current Status: **Advanced** — ready for feature-level ownership

---

## Session Log

| Date | Topic | Difficulty | Guidance | Notes |
|------|-------|-----------|----------|-------|
| 2025-11-03 | Reflection iteration loop | Med | High | Variable scope, `!` operator needed explanation |
| 2025-11-08 | Test reflection loop | Low | Low | Independent, no issues |
| 2025-11-16 | Search agent types (Step 3.1) | Med | High | Great design decisions, TypeScript syntax quick to grasp |
| 2025-11-23 | Search agent DB logic (Step 3.2) | Med-High | Med | Mapped Provider entities perfectly on first try |
| 2025-11-23 | Ranking algorithm (Step 3.4) | High | Med-Low | Fixed own bugs with guidance; understood diminishing returns |
| 2026-02 | Analysis + Recommendation + Verification agents | High | Low | Implemented full agents with minimal scaffolding; Promise.race(), soft-pass patterns, frontend hooks |
