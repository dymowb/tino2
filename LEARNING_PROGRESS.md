# Learning Calibration Tracker

**Purpose**: Help Claude adjust teaching difficulty and intervention style across sessions.

**Last Updated**: 2025-11-03

---

## 🎚️ Current Calibration Settings

### Difficulty Level: **Progressive (Beginner → Intermediate)**
- Start with "complete this line" tasks
- Gradually increase to "write this function"
- Not yet ready for "design this feature"

### Intervention Style: **Guided Implementation**
- Give task outline + what to type
- Hints when stuck (not full solutions)
- Increase hint size after 2 failed attempts
- Balance progress with learning

---

## 🧠 What to Explain More (Needs Reinforcement)

- **Variable scope** - Caught by asking "check this?", needed multiple hints
- **Type annotations syntax** - Don't skip explaining (e.g., `: Type`, `| null`)
- **Object property syntax** - Shorthand vs explicit still confusing
- **Why `!` is needed** - Understands now, but needed detailed explanation

## ✅ What's Working (Can Move Faster)

- **C++ fundamentals** - Operators, loops, conditions are familiar
- **Learning by doing** - Prefers coding with guidance over watching
- **Error-driven learning** - Compilation errors are good teaching moments
- **Progressive difficulty** - "Complete this line" → gradually harder works well

---

## 🎯 Calibration Signals

### 🔴 **Decrease Difficulty** (need more help):
- Asking "check this?" more than twice on same task
- Stuck >2 attempts on same concept
- Confusion about error messages despite explanation

### 🟢 **Increase Difficulty** (ready for more):
- Completing tasks on first try
- Asking "what's next?" proactively
- Suggesting improvements to code
- Completing tasks faster than expected

### Current Status: **On Track** (balanced difficulty)

---

## 📝 Session Log (Brief - Calibration Only)

### 2025-11-03: Reflection Iteration Loop
**Task Difficulty**: Medium (while loop + scope + accumulation)
**Guidance Level**: High (line-by-line with explanations)
**Challenges**: Variable scope (loop vs outer), `!` operator
**Success**: Completed all tasks, understands concepts
**Next Session**: Test code independently, then increase to "write function" level

### 2025-11-08: Test Reflection Loop + Verify Functionality
**Task Difficulty**: Low (run tests, understand output)
**Guidance Level**: Low (minimal intervention needed)
**Challenges**: None - independent testing successful
**Success**: Verified all test cases pass, understood iteration behavior
**Next Session**: Increase difficulty - write coordinator integration (Medium)

### 2025-11-16: Design Search Agent Types (Step 3.1)
**Task Difficulty**: Medium (interface design + design decisions)
**Guidance Level**: High (teaching mode - design discussions + TypeScript syntax)
**Challenges**: None - code completion helped, but understood structure
**Success**:
- Completed ProviderSearchResult interface perfectly (12 fields)
- Made excellent design decisions (Filter vs Score, dynamic weighting)
- Asked great clarifying questions (interface strictness, underscore prefix)
- Grasped TypeScript concepts quickly (nested objects, union types, JSDoc)
**Next Session**: Implement database search logic (Medium-High) - mix of guidance + independent coding

### 2025-11-23: Implement Search Agent Logic (Step 3.2)
**Task Difficulty**: Medium-High (database integration + array mapping + reflection logic)
**Guidance Level**: Medium (provided skeleton, user completed mapping + reflection)
**Challenges**: None - completed all tasks on first try
**Success**:
- ✅ Independently mapped Provider entities to ProviderSearchResult (perfect syntax)
- ✅ Properly handled null pricing field with fallback
- ✅ Implemented reflect() method with 3 quality checks (empty, low scores, diversity)
- ✅ Used `.map()`, `.every()`, `Set` correctly without hints
- ✅ Understanding of arrow functions, array methods, Set operations
**Signals**: Ready for increased difficulty - user is getting comfortable with TypeScript patterns
**Next Session**: Implement ranking algorithm (High) - more independent work, less scaffolding

### 2025-11-23: Implement Ranking Algorithm (Step 3.4)
**Task Difficulty**: High (multi-method implementation + math formulas + type safety)
**Guidance Level**: Medium-Low (showed one example, user implemented rest independently)
**Challenges**:
- Initial bugs in calculateBudgetScore() (missing null checks, let vs const)
- TypeScript error on availableHours (type was `any`, needed proper structure)
- Filter logic error (.length placement in calculateAvailabilityScore)
**Success**:
- ✅ Implemented 3 scoring methods after seeing one example
- ✅ Applied patterns: `Math.min()` for capping, null checking, const vs let
- ✅ Fixed own bugs with guidance (learned from corrections)
- ✅ Understood diminishing returns concept (Math.min explanation)
- ✅ Integrated all scores with calculateMatchScore() correctly
**Signals**:
- 🟢 User is ready for higher complexity
- 🟢 Can implement from examples with minimal scaffolding
- 🟡 Still needs guidance on TypeScript edge cases (type safety, null handling)
**Next Session**: Coordinator integration (High) - more design decisions, less step-by-step

---

## 🔄 Update Instructions

**At end of each session, add one line**:
```
YYYY-MM-DD: [Task] - Difficulty: [Low/Med/High] - Guidance: [Low/Med/High] - Stuck on: [concept] - Next: [adjustment]
```

**Example**:
```
2025-11-04: Test reflection loop - Difficulty: Low - Guidance: Low - Success - Next: Write routing logic (Med difficulty)
```
