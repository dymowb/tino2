# Intelligent Service Request Assistant - Agentic Workflow Design

## 🎯 Vision

An AI-powered assistant that uses autonomous, specialized agents to match customers with ideal service providers through intelligent conversation, deep analysis, and reflection-based quality assurance.

## 🧠 Core Concept

Instead of simple filtering, this system uses **multiple specialized AI agents** working together to:
1. Understand nuanced customer needs through conversation
2. Analyze providers beyond basic matching
3. Reflect on and improve recommendations
4. Learn from each interaction

---

## ✅ Design Decisions (Confirmed)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **User Visibility** | See agents working in real-time | Transparency builds trust; users learn how system thinks |
| **Agent Communication** | Only through coordinator (Option A) | Simpler to debug, maintain, and reason about |
| **Starting Scope** | Start small (Phase 1 + 2) | Learn patterns before complexity; iterate based on feedback |
| **MCP Strategy** | Conservative → Adventurous | Start with data reading, evolve to browser automation |
| **Implementation** | Backend-focused API | Reusable across web, mobile, CLI; better separation of concerns |
| **LLM Selection** | Hardcode initially | Optimize for learning; discuss flexibility later |
| **Learning/Memory** | Yes, with compression | Use summarization to avoid context bloat |
| **Error Handling** | Case-by-case basis | Different failures need different strategies |
| **Cost vs Quality** | Balanced approach | Strategic LLM selection (Haiku/Sonnet/Opus mix) |
| **Execution Mode** | Real-time (synchronous) | Better UX for service discovery use case |
| **Browser Automation** | Data reading first | Evolve to visual analysis later |
| **UAT Approach** | After each phase | Iterative validation ensures quality at every step |

---

## 🛠️ Backend Implementation Architecture

### Tech Stack
```
Backend (Node.js/Express):
├── /agents                    # Agent implementations
│   ├── coordinator.ts         # Main orchestrator
│   ├── requirements.agent.ts  # Requirements gathering
│   ├── search.agent.ts        # Provider search
│   ├── analysis.agent.ts      # Deep analysis
│   ├── recommendation.agent.ts # Synthesis
│   └── verification.agent.ts  # Quality assurance
│
├── /services
│   ├── anthropic.service.ts   # Claude API wrapper
│   ├── mcp.service.ts         # MCP tool orchestration
│   └── state.service.ts       # Workflow state management
│
├── /routes
│   └── agentic-assistant.routes.ts  # REST API endpoints
│
├── /types
│   ├── agent.types.ts         # Agent interfaces
│   ├── workflow.types.ts      # Workflow state types
│   └── mcp.types.ts          # MCP tool types
│
└── /utils
    ├── reflection.util.ts     # Reflection pattern helpers
    ├── planning.util.ts       # Planning pattern helpers
    └── logger.util.ts         # Agent activity logging
```

### Key API Endpoints
```typescript
POST   /api/v1/agentic-assistant/workflows          # Start new workflow
GET    /api/v1/agentic-assistant/workflows/:id      # Get workflow status
POST   /api/v1/agentic-assistant/workflows/:id/messages  # Send user message
GET    /api/v1/agentic-assistant/workflows/:id/agents    # Get agent activity log
DELETE /api/v1/agentic-assistant/workflows/:id      # Cancel workflow
```

### State Management Strategy
```typescript
interface WorkflowState {
  id: string;
  userId: string;
  status: 'active' | 'completed' | 'failed' | 'cancelled';
  currentAgent: string | null;
  agentHistory: AgentActivity[];
  context: {
    userRequest: string;
    requirements?: RequirementsSummary;
    searchResults?: Provider[];
    analysisResults?: ProviderAnalysis[];
    recommendations?: Recommendation[];
    verification?: VerificationReport;
  };
  createdAt: Date;
  updatedAt: Date;
}

interface AgentActivity {
  agentName: string;
  action: string;
  status: 'started' | 'in_progress' | 'completed' | 'failed';
  input?: any;
  output?: any;
  reflection?: any;
  startTime: Date;
  endTime?: Date;
  durationMs?: number;
}
```

---

## 🔌 Interesting MCPs to Explore

### Current MCPs We'll Use

#### 1. **IDE MCP** (Built-in to Claude Code)
**What it does**: Executes code, reads files, queries databases
**Use cases**:
- Query SQLite database for providers, reviews, bookings
- Read provider profile JSON files
- Execute data analysis scripts

**Example**:
```typescript
const reviews = await ideMcp.executeCode(`
  SELECT rating, comment, created_at
  FROM reviews
  WHERE provider_id = '${providerId}'
  ORDER BY created_at DESC
  LIMIT 20
`);
```

#### 2. **Chrome DevTools MCP** (Already configured)
**What it does**: Browser automation for testing and scraping
**Use cases** (Future):
- View provider portfolio websites
- Take screenshots of service photos
- Validate contact information

**Example**:
```typescript
await browser.navigate(provider.websiteUrl);
const screenshot = await browser.takeScreenshot();
// AI analyzes screenshot for professionalism
```

#### 3. **Playwright MCP** (Already configured)
**What it does**: Advanced browser automation with better control
**Use cases** (Future):
- Fill quote request forms automatically
- Test booking flow end-to-end
- Scrape provider pricing from external sites

---

### 🌟 Interesting MCPs to Explore Later

#### 4. **Time MCP** (Anthropic Official)
**What it does**: Provides current time, timezone, scheduling
**Use cases**:
- Check provider availability windows
- Calculate "same-day" vs "within 24 hours"
- Handle timezone differences

**Why interesting**: Agents need temporal reasoning for urgency

#### 5. **Memory MCP** (Anthropic Official)
**What it does**: Knowledge graph storage for persistent memory
**Use cases**:
- Remember user preferences across sessions
- Store successful provider matches
- Learn from past booking patterns

**Why interesting**: Solves your "effective storage" requirement

#### 6. **Sequential Thinking MCP** (Anthropic Official)
**What it does**: Extended reasoning with chain-of-thought
**Use cases**:
- Complex trade-off analysis in Recommendation Agent
- Multi-step planning in Search Agent
- Verification reasoning in Verification Agent

**Why interesting**: Improves reasoning quality for complex decisions

#### 7. **GitHub MCP** (Anthropic Official)
**What it does**: Search code, repos, issues
**Use cases**:
- Find provider certifications from open-source databases
- Validate contractor licenses
- Cross-reference provider info

**Why interesting**: External data validation

#### 8. **Google Maps MCP** (Community)
**What it does**: Geocoding, distance calculation, routing
**Use cases**:
- Calculate accurate travel time to customer
- Verify provider service radius
- Find providers along customer's commute

**Why interesting**: Better than our basic location queries

#### 9. **Stripe MCP** (Community)
**What it does**: Payment processing, customer data
**Use cases**:
- Check provider payment history
- Analyze pricing patterns
- Detect fraud indicators

**Why interesting**: Financial trust signals

#### 10. **Slack/Discord MCP** (Community)
**What it does**: Send notifications, create threads
**Use cases**:
- Alert user when recommendations are ready
- Create discussion thread with provider
- Notify providers of new quote requests

**Why interesting**: Real-time communication channel

---

### MCP Integration Strategy

**Phase 1-2**: IDE MCP only (focus on patterns)
**Phase 3-4**: Add Chrome DevTools MCP (read provider data)
**Phase 5+**: Explore Memory MCP for learning
**Future**: Time, Sequential Thinking, Google Maps for advanced features

---

## 🏗️ Architecture Overview

```
User Request
    ↓
┌─────────────────────────────────────┐
│   Coordinator Agent (Orchestrator)   │  ← Claude Opus/Sonnet
│   - Workflow management              │
│   - Agent selection                  │
│   - Context management               │
└─────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│                   Specialist Agents                      │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  1. Requirements Clarification Agent                     │
│     - Fast conversational AI (Claude Haiku)             │
│     - Asks intelligent follow-up questions              │
│     - Uses REFLECTION to validate completeness          │
│     - MCP: None (pure reasoning)                        │
│                                                          │
│  2. Provider Search Agent                               │
│     - Analytical AI (Claude Sonnet)                     │
│     - Queries database with intelligent filters         │
│     - Uses PLANNING to structure search                 │
│     - MCP: IDE (read provider DB), WebSearch            │
│                                                          │
│  3. Provider Analysis Agent                             │
│     - Deep analysis AI (Claude Sonnet)                  │
│     - Evaluates provider profiles, reviews, history     │
│     - Uses TOOL USE pattern with multiple MCPs          │
│     - MCP: IDE (read data), Browser (view profiles)     │
│                                                          │
│  4. Recommendation Agent                                │
│     - Synthesis AI (Claude Opus)                        │
│     - Creates personalized recommendations              │
│     - Uses REFLECTION to validate reasoning             │
│     - MCP: None (pure synthesis)                        │
│                                                          │
│  5. Verification Agent                                  │
│     - Quality assurance AI (Claude Haiku)               │
│     - Reviews entire workflow for coherence             │
│     - Uses REFLECTION for quality check                 │
│     - MCP: None (pure validation)                       │
│                                                          │
└─────────────────────────────────────────────────────────┘
    ↓
Present Results to User
```

---

## 🎨 Agentic Patterns Used

### 1. **Reflection Pattern**
**What**: Agent evaluates its own output and iterates to improve quality

**Where Used**:
- Requirements Agent: "Are these questions sufficient to understand the need?"
- Recommendation Agent: "Do these recommendations truly match the requirements?"
- Verification Agent: "Is this workflow coherent and complete?"

**Implementation**:
```typescript
// Example reflection loop
async function reflectOnOutput(output: any, criteria: string[]): Promise<{
  isValid: boolean;
  improvements: string[];
  revisedOutput?: any;
}> {
  // Agent reviews its own work
  const reflection = await agent.reflect({
    output,
    criteria,
    question: "What could be improved about this output?"
  });

  if (reflection.needsImprovement) {
    // Agent iterates on its own work
    return agent.revise(output, reflection.improvements);
  }

  return { isValid: true, improvements: [] };
}
```

### 2. **Planning Pattern**
**What**: Agent breaks down complex tasks into structured steps

**Where Used**:
- Provider Search Agent: Plans multi-stage search strategy
- Coordinator: Plans overall workflow execution

### 3. **Tool Use Pattern**
**What**: Agents autonomously decide when and how to use MCPs

**Where Used**:
- Provider Analysis Agent: Chooses which MCPs to use for deep analysis
- Provider Search Agent: Decides when to query DB vs web search

### 4. **Multi-Agent Collaboration**
**What**: Specialized agents work together, each with unique capabilities

**Why Different LLMs**:
- **Claude Haiku**: Fast, conversational, cheap (Requirements, Verification)
- **Claude Sonnet**: Balanced, analytical, accurate (Search, Analysis)
- **Claude Opus**: Best reasoning, synthesis, expensive (Recommendation)

### 5. **Memory & Context Pattern**
**What**: Maintain conversation state and learnings across agents

**Implementation**: Shared context object passed between agents

---

## 📋 Detailed Agent Specifications

### Agent 1: Requirements Clarification Agent
**LLM**: Claude Haiku (fast, conversational)
**Role**: Understand customer needs through intelligent dialogue
**MCPs**: None (pure conversation)

**Capabilities**:
1. Ask follow-up questions based on initial request
2. Identify missing critical information (urgency, budget, location details)
3. Reflect on whether requirements are complete
4. Validate understanding with customer

**Reflection Loop**:
```
1. Initial questions → User answers
2. Self-reflect: "Do I have enough information?"
3. If no: Generate more targeted questions
4. If yes: Summarize understanding and confirm
```

**Example Flow**:
```
User: "I need a plumber"
Agent: "I'll help you find the perfect plumber! Let me ask a few questions:
        1. What type of plumbing issue? (leak, installation, clog, etc.)
        2. How urgent is this? (emergency, within 24h, this week, flexible)
        3. What's your budget range?
        4. Any specific requirements? (licensed, insured, experience level)"

[Reflection] "Are these questions sufficient?"
→ "Should also ask about property type and access requirements"

Agent: "Two more quick questions:
        5. What type of property? (house, apartment, commercial)
        6. Any access considerations?"
```

---

### Agent 2: Provider Search Agent
**LLM**: Claude Sonnet (analytical)
**Role**: Find matching providers using intelligent search
**MCPs**: IDE MCP (database queries), WebSearch MCP (optional context)

**Capabilities**:
1. Translate requirements to search parameters
2. Query database with multiple filters
3. Rank results by match quality
4. Use planning to structure multi-stage search

**Planning Approach**:
```
1. Identify primary filters (service type, location radius)
2. Identify secondary filters (rating, certifications, availability)
3. Plan ranking algorithm (weighted scoring)
4. Execute search with fallback strategies
```

**MCP Usage**:
```typescript
// Read provider database
const providers = await ideMcp.executeCode(`
  SELECT * FROM providers
  WHERE services LIKE '%${serviceType}%'
    AND ST_Distance(location, '${userLocation}') < ${radiusMiles}
    AND rating >= ${minRating}
    AND has_insurance = true
  ORDER BY rating DESC, completed_jobs DESC
  LIMIT 10
`);

// Optional: Enhance with web context
if (providers.length < 3) {
  const webContext = await webSearch(`best ${serviceType} near ${location}`);
}
```

---

### Agent 3: Provider Analysis Agent
**LLM**: Claude Sonnet (deep analysis)
**Role**: Evaluate each provider's fit through deep analysis
**MCPs**: IDE MCP (read reviews/history), Browser MCP (view profiles)

**Capabilities**:
1. Analyze provider profiles (experience, certifications, portfolio)
2. Read and summarize customer reviews
3. Check booking history and success patterns
4. Identify red flags or exceptional qualities

**MCP Tool Use Strategy**:
```typescript
for (const provider of topProviders) {
  // Read structured data
  const profile = await ideMcp.read(`backend/data/providers/${provider.id}.json`);

  // Analyze reviews
  const reviews = await ideMcp.executeCode(`
    SELECT rating, comment, created_at
    FROM reviews
    WHERE provider_id = '${provider.id}'
    ORDER BY created_at DESC
    LIMIT 20
  `);

  // Optional: View live profile with browser
  if (provider.portfolioUrl) {
    await browser.navigate(provider.portfolioUrl);
    const portfolioScreenshot = await browser.takeScreenshot();
    // Analyze portfolio visually
  }

  // Generate provider insight report
  const insight = analyzeProviderData(profile, reviews, bookingHistory);
}
```

**Analysis Output**:
```
{
  providerId: "...",
  matchScore: 0.92,
  strengths: ["15 years experience", "100% emergency response rate"],
  concerns: ["Higher price point", "Limited weekend availability"],
  reviewSentiment: "Consistently praised for professionalism and thoroughness",
  uniqueValue: "Specializes in old building plumbing systems"
}
```

---

### Agent 4: Recommendation Agent
**LLM**: Claude Opus (best reasoning)
**Role**: Synthesize all information into personalized recommendations
**MCPs**: None (pure synthesis)

**Capabilities**:
1. Synthesize search results + analysis into coherent recommendations
2. Rank providers with detailed reasoning
3. Explain trade-offs between options
4. Reflect on recommendation quality

**Reflection Questions**:
- "Do these recommendations truly address the user's stated needs?"
- "Have I explained the reasoning clearly?"
- "Are there any important considerations I've missed?"
- "Would I be confident making this recommendation to a friend?"

**Output Format**:
```
Top 3 Recommendations:

1. **Quick Plumbing Solutions** (Match Score: 95%)
   Why We Recommend:
   - ✅ Emergency specialist (your top priority)
   - ✅ 4.9/5 rating from 230 reviews
   - ✅ Licensed & insured
   - ✅ Within your budget ($80-120/hr)
   - ⚠️  Limited to weekdays (you mentioned flexible timing)

   What Customers Say:
   "Responded to my burst pipe at 2 AM, fixed it perfectly" - Sarah M.

   Best For: Your emergency leak situation

2. [Provider 2...]
3. [Provider 3...]

Trade-offs to Consider:
- If you need same-day service: Choose #1
- If you want lowest cost: Choose #3
- If you want most experienced: Choose #2
```

**Reflection After Generation**:
```
Self-Assessment:
✅ Addressed user's urgency requirement
✅ Explained reasoning for each recommendation
⚠️  Should I mention #1's higher hourly rate more prominently?
✅ Trade-offs section helps user decide

Confidence Level: 9/10
```

---

### Agent 5: Verification Agent
**LLM**: Claude Haiku (fast quality check)
**Role**: Final quality assurance on entire workflow
**MCPs**: None (pure validation)

**Verification Checklist**:
```
1. Requirements Coverage
   ✓ All user requirements addressed?
   ✓ No contradictions in recommendations?

2. Recommendation Quality
   ✓ Top recommendations truly match requirements?
   ✓ Reasoning is clear and logical?
   ✓ Trade-offs explained fairly?

3. Information Accuracy
   ✓ Provider data is current and correct?
   ✓ No misleading claims?

4. User Experience
   ✓ Response is clear and actionable?
   ✓ Next steps are obvious?

5. Completeness
   ✓ Workflow completed all intended steps?
   ✓ No missing information?
```

**Output**:
```
Verification Report:
✅ All checks passed
⚠️  Minor issue: Recommendation #3 doesn't mention availability
💡 Suggestion: Add booking availability to each recommendation

Overall Quality: APPROVED
```

---

## 🔄 Complete Workflow Example

### Scenario: User needs emergency plumber

**Step 1: User Initiates**
```
User: "I need a plumber urgently, I have a leak!"
```

**Step 2: Coordinator Routes to Requirements Agent**
```
Coordinator Decision:
- User mentioned urgency → Flag as high priority
- Initial request is vague → Route to Requirements Agent
- Estimated clarification time: 1-2 minutes
```

**Step 3: Requirements Agent (Reflection Loop)**
```
Requirements Agent (Haiku):
"I understand this is urgent! Let me quickly gather key details:
 1. Where is the leak? (kitchen, bathroom, outdoor, etc.)
 2. How bad is it? (dripping, steady stream, flooding)
 3. Your location and when you need service?"

User: "Bathroom sink, steady stream, I'm in Austin, need someone today"

[Reflection]
Self-Check: "Do I have enough information?"
- ✅ Service type: Plumbing leak repair
- ✅ Urgency: Emergency (same day)
- ✅ Location: Austin
- ⚠️  Missing: Budget, property type, insurance preference

"Two more quick questions:
 4. What's your budget range? (hourly rate)
 5. Do you need them to be licensed/insured?"

User: "Budget around $100/hour, yes must be licensed"

[Reflection]
Self-Check: "Is this complete now?"
- ✅ All critical information gathered
- ✅ Can proceed to search

Requirements Summary:
{
  serviceType: "Plumbing leak repair",
  urgency: "Emergency - same day",
  location: "Austin, TX",
  budget: "$100/hour",
  requirements: ["Licensed", "Insured"],
  propertyType: "Residential - Bathroom"
}
```

**Step 4: Coordinator Routes to Search Agent**
```
Coordinator:
- Requirements complete ✓
- Route to Provider Search Agent
- Parameters: { urgency: "emergency", radius: 10 miles }
```

**Step 5: Provider Search Agent (Planning)**
```
Provider Search Agent (Sonnet):

[Planning Phase]
"Search strategy:
 1. Primary filters: Service type (plumbing), Location (Austin, 10mi), Availability (today)
 2. Secondary filters: Rating (4.5+), Licensed, Insured
 3. Ranking: Prioritize emergency response time, then rating
 4. Fallback: If < 3 results, expand radius to 20mi"

[Execution]
// Use IDE MCP to query database
const providers = await ideMcp.executeCode(`
  SELECT p.*,
         pr.emergency_available,
         pr.avg_response_time,
         COUNT(b.id) as completed_jobs
  FROM providers p
  JOIN provider_profiles pr ON p.id = pr.provider_id
  LEFT JOIN bookings b ON p.id = b.provider_id AND b.status = 'completed'
  WHERE p.services LIKE '%plumbing%'
    AND ST_Distance(p.location, 'Austin, TX') <= 10
    AND pr.emergency_available = true
    AND pr.is_licensed = true
    AND pr.is_insured = true
    AND p.rating >= 4.5
  GROUP BY p.id
  ORDER BY pr.avg_response_time ASC, p.rating DESC
  LIMIT 5
`);

[Result]
Found 5 matching providers:
1. Quick Plumbing Solutions (4.9★, 30min response)
2. Austin Emergency Plumbers (4.8★, 45min response)
3. [...]
```

**Step 6: Coordinator Routes to Analysis Agent**
```
Coordinator:
- 5 providers found ✓
- Route to Provider Analysis Agent
- Analyze top 3 in depth
```

**Step 7: Provider Analysis Agent (Tool Use)**
```
Provider Analysis Agent (Sonnet):

[Analyzing Provider #1: Quick Plumbing Solutions]

// Read provider profile data
const profile = await ideMcp.read('backend/data/providers/quickplumbing.json');

// Query recent reviews
const reviews = await ideMcp.executeCode(`
  SELECT rating, comment, service_type, created_at
  FROM reviews
  WHERE provider_id = 'quickplumbing'
  ORDER BY created_at DESC
  LIMIT 20
`);

// Analyze review sentiment
Review Analysis:
- 18/20 reviews mention "fast response"
- 15/20 reviews mention "professional"
- 3/20 reviews mention "expensive" (but satisfied with quality)
- Common themes: Emergency expertise, thorough work, good communication

// Check booking success rate
const successRate = await ideMcp.executeCode(`
  SELECT
    COUNT(*) as total_bookings,
    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed,
    AVG(CASE WHEN status = 'completed' THEN rating END) as avg_rating
  FROM bookings
  WHERE provider_id = 'quickplumbing'
    AND service_type LIKE '%plumbing%'
`);

Provider #1 Deep Insight:
{
  matchScore: 0.95,
  strengths: [
    "Emergency specialist - 98% same-day availability",
    "Excellent communication (mentioned in 75% of reviews)",
    "Licensed Master Plumber with 15 years experience",
    "Carries $2M liability insurance"
  ],
  concerns: [
    "Price point at upper end of budget ($95-120/hr)",
    "Very busy - may have limited time slots"
  ],
  bestFor: "Emergency situations requiring fast, reliable service",
  reviewHighlight: "Saved my kitchen from flooding at 11 PM, super professional" - Jane D.
}

[Repeat for Provider #2 and #3...]
```

**Step 8: Coordinator Routes to Recommendation Agent**
```
Coordinator:
- Analysis complete for top 3 providers ✓
- Rich insights gathered ✓
- Route to Recommendation Agent (Opus for best synthesis)
```

**Step 9: Recommendation Agent (Reflection)**
```
Recommendation Agent (Opus):

[Synthesis Phase]
Combining:
- User requirements (emergency, budget ~$100/hr, licensed/insured)
- Search results (5 providers found)
- Deep analysis (3 providers analyzed)

[Generate Recommendations]

📋 Your Personalized Recommendations

Based on your emergency bathroom leak, here are the 3 best matches:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥇 **#1: Quick Plumbing Solutions** (95% Match)

Why This Is Your Best Bet:
✅ Fastest emergency response in Austin (avg 30 minutes)
✅ 4.9/5 stars from 230+ emergency calls
✅ Licensed Master Plumber, fully insured ($2M coverage)
✅ Within your budget ($95-120/hr depending on complexity)
✅ Specializes in residential leak repairs

What Makes Them Special:
"They fixed my burst pipe at 2 AM and even cleaned up the mess" - Sarah M.
98% same-day availability, excellent communication

⚠️ Small Trade-off: At the higher end of your budget, but customers consistently say "worth every penny"

💡 Best For: Your situation (emergency + need reliability)

[Contact Button] [View Full Profile] [Get Quote]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥈 **#2: Austin Emergency Plumbers** (88% Match)

Why Consider This Option:
✅ More affordable ($80-100/hr)
✅ 4.8/5 stars, very reliable
✅ Licensed & insured
✅ 45-minute average response time

Trade-off: Slightly slower response than #1, but more budget-friendly

💡 Best For: If you want to save $20-30 and can wait an extra 15 minutes

[Contact Button] [View Full Profile] [Get Quote]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🥉 **#3: [Provider 3]** (82% Match)
[Details...]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 My Recommendation:
For your emergency bathroom leak, I'd go with **Quick Plumbing Solutions (#1)**.
The slightly higher cost is worth it for their 30-minute response time and
exceptional track record with emergencies. Your bathroom leak needs immediate
attention, and they're the most reliable option.

💬 Want to book? I can help you:
1. Schedule directly with your choice
2. Request quotes from all three
3. Ask more questions about any provider

[Reflection Loop]
Self-Assessment:
✅ Addressed user's top priority (urgency)
✅ Clear reasoning for each recommendation
✅ Explained trade-offs transparently
✅ Budget considerations mentioned
✅ Actionable next steps provided
⚠️  Should I emphasize water damage risk more to justify premium option?

Revised Addition:
"⚠️ Quick reminder: Water leaks can cause structural damage quickly.
Fast response time isn't just convenience—it's protection for your home."

Confidence: 9.5/10
```

**Step 10: Coordinator Routes to Verification Agent**
```
Coordinator:
- Recommendations generated ✓
- Route to Verification Agent for final QA
```

**Step 11: Verification Agent (Quality Check)**
```
Verification Agent (Haiku):

Running Quality Checks...

✅ Requirements Coverage
   ✓ Emergency need → Addressed (30min response highlighted)
   ✓ Budget constraint → Addressed (range $95-120/hr mentioned)
   ✓ Licensed/Insured → Verified for all recommendations
   ✓ Location → All providers in Austin area

✅ Recommendation Quality
   ✓ Top pick makes sense given urgency priority
   ✓ Clear reasoning for each provider
   ✓ Trade-offs explained fairly (#2 vs #1)
   ✓ No contradictions in information

✅ Information Accuracy
   ✓ Provider ratings verified against database
   ✓ Response times match provider profiles
   ✓ Pricing information current
   ✓ Licensing status confirmed

✅ User Experience
   ✓ Response is clear and easy to scan
   ✓ Action buttons prominently displayed
   ✓ Next steps obvious (book, quote, or ask more)
   ✓ Reasoning transparent

✅ Completeness
   ✓ All workflow steps completed
   ✓ No missing critical information
   ✓ Follow-up options provided

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Verification Result: ✅ APPROVED

Quality Score: 9.5/10

Minor Enhancement Suggestion:
- Could add estimated time to complete repair for each provider
- Could mention warranty/guarantee policies

Overall: Excellent recommendation quality, ready for user
```

**Step 12: Coordinator Presents to User**
```
Coordinator:
- Verification passed ✓
- Present recommendations to user
- Initialize booking flow if user chooses a provider
- Store interaction for learning/improvement
```

---

## 🧪 Learning Opportunities

### For You (Developer):

1. **Multi-Agent Orchestration**
   - How to coordinate different agents
   - When to use different LLM models
   - State management across agents

2. **Agentic Patterns**
   - Implementing reflection loops
   - Planning vs. reactive approaches
   - Tool use strategies

3. **MCP Integration**
   - When to use which MCP tool
   - Combining multiple MCPs effectively
   - Error handling with external tools

4. **Quality Assurance**
   - Automated verification patterns
   - Confidence scoring
   - Iterative improvement

5. **User Experience**
   - Balancing automation with transparency
   - Progressive disclosure of information
   - Actionable outputs

---

## 🚀 Implementation Phases (with UAT)

### Phase 1: Foundation (START HERE) ⭐
**Implementation**:
- [ ] Create coordinator agent skeleton
- [ ] Implement shared context/state management
- [ ] Build basic agent communication protocol
- [ ] Create REST API endpoints for workflow initiation

**UAT - User Acceptance Testing**:
- [ ] Test: Can we initiate a workflow and get a response?
- [ ] Test: Does the coordinator properly maintain state?
- [ ] Test: Are agent communication logs visible?
- [ ] Review: Is the agent status visible to user in real-time?
- [ ] Criteria: Coordinator can route to a mock agent and return result

**Expected Output**: Working coordinator that can route to mock agents

---

### Phase 2: Requirements Agent ⭐
**Implementation**:
- [ ] Implement conversational flow with Claude Haiku
- [ ] Add reflection loop for question completeness
- [ ] Create requirements validation logic
- [ ] Integrate with coordinator

**UAT - User Acceptance Testing**:
- [ ] Test: User types "I need a plumber" → Agent asks follow-up questions
- [ ] Test: Agent reflection works (asks sufficient questions)
- [ ] Test: Requirements summary is accurate and complete
- [ ] Test: Edge case - User provides incomplete answers
- [ ] Test: Edge case - User provides all info upfront
- [ ] Review: Are questions relevant and not repetitive?
- [ ] Criteria: Agent can gather complete requirements with 2-4 questions

**Expected Output**: Conversational agent that gathers complete service requirements

---

### Phase 3: Search Agent
**Implementation**:
- [ ] Integrate IDE MCP for database queries
- [ ] Implement planning-based search strategy
- [ ] Add ranking algorithm
- [ ] Create fallback logic for insufficient results

**UAT - User Acceptance Testing**:
- [ ] Test: Search with common service (plumbing) → Returns 3+ providers
- [ ] Test: Search with rare service (exotic pet grooming) → Handles gracefully
- [ ] Test: Search with tight budget → Filters appropriately
- [ ] Test: Emergency vs flexible timing → Different providers prioritized
- [ ] Test: Planning phase is logged and visible
- [ ] Review: Are search results truly relevant to requirements?
- [ ] Criteria: Returns 3-5 relevant providers sorted by match quality

**Expected Output**: Intelligent search that finds and ranks matching providers

---

### Phase 4: Analysis Agent
**Implementation**:
- [ ] Integrate IDE MCP for reading reviews/history
- [ ] Implement provider evaluation logic
- [ ] Create insight generation algorithm
- [ ] Add tool use decision-making

**UAT - User Acceptance Testing**:
- [ ] Test: Analysis of highly-rated provider → Identifies strengths accurately
- [ ] Test: Analysis of poorly-rated provider → Flags concerns
- [ ] Test: Provider with mixed reviews → Presents balanced analysis
- [ ] Test: Tool use decisions are logged (which MCPs used, why)
- [ ] Review: Do insights add value beyond raw data?
- [ ] Criteria: Each provider has match score, strengths, concerns, and highlight

**Expected Output**: Deep provider analysis with actionable insights

---

### Phase 5: Recommendation Agent
**Implementation**:
- [ ] Implement synthesis logic with Claude Opus
- [ ] Add reflection on recommendations
- [ ] Design structured output format
- [ ] Create trade-off explanations

**UAT - User Acceptance Testing**:
- [ ] Test: Top recommendation matches user's stated priorities
- [ ] Test: Trade-offs are explained clearly
- [ ] Test: Reasoning is transparent and logical
- [ ] Test: Reflection improves initial output
- [ ] Test: Multiple personas (budget-conscious, quality-focused, urgent)
- [ ] Review: Would YOU follow this recommendation?
- [ ] Criteria: Recommendations are actionable with clear next steps

**Expected Output**: Personalized recommendations with reasoning and trade-offs

---

### Phase 6: Verification Agent
**Implementation**:
- [ ] Create verification checklist
- [ ] Implement quality scoring
- [ ] Add improvement suggestions
- [ ] Create verification report format

**UAT - User Acceptance Testing**:
- [ ] Test: Verification catches missing information
- [ ] Test: Verification flags contradictions
- [ ] Test: Quality score correlates with actual quality
- [ ] Test: Improvement suggestions are actionable
- [ ] Review: Does verification add value or just overhead?
- [ ] Criteria: Verification provides 3+ quality checks, catches issues

**Expected Output**: Automated QA that ensures recommendation quality

---

### Phase 7: Integration & Testing
**Implementation**:
- [ ] End-to-end workflow testing
- [ ] Performance optimization (response time < 30 seconds)
- [ ] Error handling and graceful degradation
- [ ] User experience refinement

**UAT - User Acceptance Testing**:
- [ ] Test: Complete flow from "I need X" to recommendations
- [ ] Test: Flow with errors (agent failure, no providers found)
- [ ] Test: Performance under load (5 concurrent requests)
- [ ] Test: Agent visibility - Can user see progress?
- [ ] Test: Real user scenario - Emergency plumber, House cleaning, etc.
- [ ] Review: Is the experience smooth and intuitive?
- [ ] Criteria: 90% success rate, <30s response time, visible progress

**Expected Output**: Production-ready agentic assistant system

---

## 💭 Open Questions for Discussion

1. **Agent Communication**: Should agents communicate directly or only through coordinator? Coordinator

2. **LLM Selection**: Do you want flexibility to swap LLMs or hardcode specific ones? let's hardcode at first, but would like to discuss how to make them flexible later

3. **User Visibility**: Should users see the agent workflow happening, or just final results? should see it happening

4. **Learning/Memory**: Should the system remember past interactions to improve over time? yes, but we should find a way to store them effectively (compression, summarization) to avoid context waste

5. **Error Handling**: How should we handle agent failures? Retry? Skip? Ask user? let's define this case by case

6. **Cost vs Quality**: More agents = better quality but higher cost. Balance? yes, balance

7. **Real-time vs Batch**: Should this run in real-time with the user waiting, or async? real time

8. **Browser Automation**: Should we actually browse provider profiles or just read data? read data at first, we can evolve later

---

## 🎓 What You'll Learn

By building this system together, you'll gain hands-on experience with:

✅ Multi-agent system design and orchestration
✅ Different agentic patterns (reflection, planning, tool use)
✅ MCP tool integration (IDE, Browser, WebSearch)
✅ LLM model selection and cost optimization
✅ State management in async workflows
✅ Quality assurance in AI systems
✅ User experience design for AI features
✅ Error handling and graceful degradation
✅ Performance monitoring and optimization

---

## 🚀 Detailed Kickoff Plan: Phase 1 + 2

### Session 1: Phase 1 - Foundation (2-3 hours)

#### Step 1.1: Create Type Definitions (Learning: TypeScript + Agent interfaces)
**What we'll build**: Type definitions for agents and workflow state
**Why this first**: Types define our contracts - everything else builds on this
**Your learning**: How to design clean interfaces for agent systems

**Files to create**:
- `backend/src/agents/types/agent.types.ts`
- `backend/src/agents/types/workflow.types.ts`

**What I'll explain**:
- Why separate input/output types for each agent
- How to design state that's easy to serialize
- Generic agent interface pattern

---

#### Step 1.2: Create State Management Service (Learning: State machines)
**What we'll build**: WorkflowStateService for managing agent state
**Why important**: Single source of truth for workflow progress
**Your learning**: State management patterns, in-memory vs persistent storage

**Files to create**:
- `backend/src/agents/services/state.service.ts`

**What I'll explain**:
- In-memory state (Map) for Phase 1, database later
- Why immutable state updates matter
- How to track agent activity history

---

#### Step 1.3: Create Coordinator Agent Skeleton (Learning: Orchestration patterns)
**What we'll build**: CoordinatorAgent class that routes to other agents
**Why central**: This is the brain of the system
**Your learning**: Agent orchestration, routing logic, error boundaries

**Files to create**:
- `backend/src/agents/coordinator.ts`

**What I'll explain**:
- How coordinator decides which agent to call next
- Passing context between agents
- Mock agent pattern for testing before real agents exist

---

#### Step 1.4: Create API Endpoints (Learning: REST API for agents)
**What we'll build**: Express routes for workflow management
**Why needed**: Frontend needs to talk to our agents
**Your learning**: API design for async agent workflows

**Files to create**:
- `backend/src/routes/agentic-assistant.routes.ts`

**What I'll explain**:
- POST /workflows → Start workflow with initial request
- GET /workflows/:id → Get current status and agent activity
- POST /workflows/:id/messages → Send user response to agent
- Why separate endpoints for status vs messages

---

#### Step 1.5: Phase 1 UAT (Learning: Testing patterns)
**What we'll test**:
```bash
# Test 1: Start workflow with mock agent
curl -X POST http://localhost:3000/api/v1/agentic-assistant/workflows \
  -H "Content-Type: application/json" \
  -d '{"userId": "test", "message": "I need a plumber"}'

# Expected: Workflow created, returns workflow ID

# Test 2: Get workflow status
curl http://localhost:3000/api/v1/agentic-assistant/workflows/{id}

# Expected: Status shows "active", currentAgent: "mock", activity log visible

# Test 3: Send user message
curl -X POST http://localhost:3000/api/v1/agentic-assistant/workflows/{id}/messages \
  -d '{"message": "Emergency leak in bathroom"}'

# Expected: Mock agent processes message, updates state
```

**What I'll explain**:
- How to test without real LLM calls (save cost)
- Debugging agent state transitions
- Using Postman/curl for API testing

---

### Session 2: Phase 2 - Requirements Agent (2-3 hours)

#### Step 2.1: Integrate Anthropic SDK (Learning: Claude API)
**What we'll build**: AnthropicService wrapper for Claude calls
**Why wrapper**: Centralized LLM calls, easier to swap models later
**Your learning**: How to structure LLM API calls, prompt engineering basics

**Files to create**:
- `backend/src/agents/services/anthropic.service.ts`

**What I'll explain**:
- Anthropic SDK setup and configuration
- How to structure prompts for agents
- Hardcoding Claude Haiku for this agent (cheap + fast)
- Token usage and cost monitoring

---

#### Step 2.2: Build Requirements Agent (Learning: Conversational agents)
**What we'll build**: RequirementsAgent with conversational flow
**Why Haiku**: Fast responses for conversation, low cost
**Your learning**: Building agents that maintain conversation context

**Files to create**:
- `backend/src/agents/requirements.agent.ts`

**What I'll explain**:
- System prompt design for requirements gathering
- How to structure conversation history
- Maintaining context between user messages
- When to transition from questions to summary

---

#### Step 2.3: Implement Reflection Loop (Learning: Reflection pattern)
**What we'll build**: Agent that critiques its own questions
**Why powerful**: Self-improvement without human intervention
**Your learning**: Meta-reasoning, how AI evaluates AI

**Within requirements.agent.ts**:

**What I'll explain**:
- Reflection prompt structure: "Are these questions sufficient?"
- How to structure reflection output (boolean + improvements)
- When to iterate vs when to proceed
- Cost/quality trade-off (reflection adds LLM call)

**Example reflection flow**:
```typescript
// Agent generates questions
const questions = await generateQuestions(userRequest);

// Agent reflects on questions
const reflection = await reflectOnQuestions(questions, userRequest);

// If insufficient, generate more questions
if (reflection.needsMoreQuestions) {
  const additionalQuestions = await generateQuestions(
    userRequest,
    questions,
    reflection.missingInfo
  );
}
```

---

#### Step 2.4: Integrate with Coordinator (Learning: Agent composition)
**What we'll build**: Update coordinator to route to real Requirements Agent
**Why important**: Move from mock to real agent
**Your learning**: How coordinator decides when requirements are complete

**Files to modify**:
- `backend/src/agents/coordinator.ts`

**What I'll explain**:
- How coordinator detects "initial request" vs "follow-up answer"
- Routing logic: When to call requirements agent vs proceed to search
- Passing requirements summary to next agent

---

#### Step 2.5: Phase 2 UAT (Learning: Real agent testing)
**What we'll test**:

**Test 1: Basic Flow**
```bash
# Start workflow
curl -X POST .../workflows -d '{"message": "I need a plumber"}'

# Expected: Requirements agent asks 3-4 questions
# Verify: Questions are relevant (urgency, location, budget, requirements)
```

**Test 2: Reflection Quality**
```
# Check agent activity log
curl .../workflows/{id}/agents

# Expected: See reflection step in logs
# Verify: Agent identified missing info (if any)
```

**Test 3: Complete Requirements**
```bash
# Answer all questions
curl -X POST .../workflows/{id}/messages -d '{
  "message": "Emergency, Austin TX, budget $100/hr, must be licensed"
}'

# Expected: Requirements summary generated
# Verify: Summary includes serviceType, urgency, location, budget, requirements
```

**Test 4: Edge Cases**
```
# User provides all info upfront
curl -X POST .../workflows -d '{
  "message": "I need an emergency plumber in Austin, budget $100/hr, licensed only"
}'

# Expected: Minimal follow-up questions (agent detects completeness)
```

**Test 5: Incomplete Answers**
```
# User gives vague answer
curl -X POST .../workflows/{id}/messages -d '{"message": "soon"}'

# Expected: Agent asks clarifying question about timing
```

**What I'll explain**:
- How to evaluate agent question quality
- When reflection helps vs adds unnecessary cost
- Debugging agent reasoning (check activity logs)
- Reading Claude API usage and costs

---

### Success Criteria for Phase 1 + 2

**Phase 1 Complete When**:
- ✅ Can start workflow via API
- ✅ Can get workflow status and agent activity
- ✅ State is properly maintained across requests
- ✅ Mock agent successfully responds
- ✅ All 3 tests pass

**Phase 2 Complete When**:
- ✅ Requirements agent asks relevant questions (2-4 questions)
- ✅ Reflection loop improves question quality
- ✅ Requirements summary is accurate and complete
- ✅ Handles edge cases (all info upfront, incomplete answers)
- ✅ All 5 tests pass
- ✅ You understand: conversation context, reflection pattern, API integration

**After Phase 1 + 2, You'll Understand**:
1. ✅ How to design and implement agent interfaces
2. ✅ How to orchestrate multiple agents via coordinator
3. ✅ How to integrate Claude API for agent reasoning
4. ✅ How reflection pattern improves agent quality
5. ✅ How to maintain state across async workflows
6. ✅ How to test agents systematically
7. ✅ How to design REST APIs for agent systems

---

## 📝 Next Steps

**Immediate Actions**:
1. ✅ Review this design document - confirm alignment
2. ✅ Ask any questions about Phase 1 + 2 plan
3. ✅ Ready to start coding Phase 1 Step 1.1 (Type definitions)

**When You're Ready**:
Say "Let's start Phase 1 Step 1.1" and I'll:
1. Explain the rationale for each type definition
2. Create the file together with you
3. Explain design decisions as we go
4. Answer your questions at each step

**My Teaching Approach**:
- I'll explain WHY before WHAT
- I'll show you the pattern, you apply it
- I'll ask you questions to reinforce learning
- We'll test frequently to see results

**Your Learning Goals**:
- Understand agentic patterns deeply (not just copy code)
- Learn how to design agent systems from scratch
- Practice with MCP tools in real scenarios
- Build something genuinely useful

Let's build this together! What questions do you have about the plan?
