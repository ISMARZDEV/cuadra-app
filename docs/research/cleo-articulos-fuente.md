# 📑 Cleo — Engineering blog reference (notes + recreated diagrams)

> **Purpose:** consultable **reference** for the Cleo engineering articles behind the decisions in
> [`startup/arquitectura-mvp.md`](../startup/arquitectura-mvp.md) and the analysis in
> [`cleo-analisis.md`](./cleo-analisis.md). Each article is captured in detail (key points, metrics,
> short quotes) **in English**, and **every technical image/diagram was analyzed and recreated in
> ASCII** so it stays usable without the originals (Cleo blocks bot access).
>
> **Source:** `web.meetcleo.com/blog` · **Captured:** 2026-06-25 · 8 articles.
> **UI screenshots** are flagged with 🎨 and analyzed for Cuadra's design in
> [`startup/ui-notas-cleo.md`](../startup/ui-notas-cleo.md).

---

## Index
1. [Introducing Autopilot](#1-introducing-autopilot) *(Release)*
2. [Inside Cleo's multi-agent architecture](#2-inside-cleos-multi-agent-architecture) *(AI · 05/14/26)*
3. [Introducing Cleo's custom router](#3-introducing-cleos-custom-router) *(AI · 05/21/26)*
4. [Fine-tuning a smaller model for quick replies](#4-fine-tuning-a-smaller-model-for-quick-replies) *(Building Cleo · 06/02/26)*
5. [How we taught Cleo to talk back](#5-how-we-taught-cleo-to-talk-back) *(Building Cleo · 06/10/26)*
6. [Service objects… you probably should not use them](#6-service-objects-and-the-missing-abstraction) *(Building Cleo · 03/25/26)*
7. [How we built Cleo's visual world](#7-how-we-built-cleos-visual-world) *(Building Cleo · 03/27/26)*
8. [Cleo's Gender Pay Gap Report 2025](#8-cleos-gender-pay-gap-report-2025) *(Life at Cleo · 04/01/26)*
9. [How Cleo learns what your transactions actually mean](#9-how-cleo-learns-what-your-transactions-actually-mean) *(Building Cleo · 01/28/26)*
10. [What do people really want from an AI financial assistant?](#10-what-do-people-really-want-from-an-ai-financial-assistant) *(Research · 01/28/26)*
11. [Memory as a step toward more human AI](#11-memory-as-a-step-toward-more-human-ai) *(AI · 07/22/25)*
12. [Evaluating Cleo vs. generalist AI models](#12-evaluating-cleo-vs-generalist-ai-models) *(Research · 07/24/25)*
13. [Building a financial agent on top of commodified LLMs](#13-building-a-financial-agent-on-top-of-commodified-llms) *(AI · 07/23/25)*
14. [Introducing Cleo 3.0](#14-introducing-cleo-30) *(Release · 07/22/25)*

---

## 1. Introducing Autopilot

> *Release.* "Autopilot: Cleo's first step toward autonomous money management." Moves Cleo **from
> analysis to action** — maps long-term goals and helps you act on them, with personalized daily
> insights. Builds on Cleo 3.0 (agentic architecture, advanced reasoning, individualized memory,
> real-time voice).

**The three components (each builds on the last):**
- **Roadmap** — a long-term plan based on a big-picture goal.
- **Daily Plan** — keeps you on track with personalized daily insights and recommendations.
- **Actions** — today Cleo *recommends* financial actions; tomorrow she *executes* them for you.

All inside the same conversational interface, no separate configuration. As your financial state
changes, Cleo recalibrates.

**Insights** — where Cleo "learns who you are financially." On enabling Autopilot she works through
**years** of transaction history to build a model: income patterns, spending distribution, recurring
expenses, shifts over time. This baseline (a) feeds downstream planning and (b) surfaces insights.

**Roadmap** — translates the baseline into a plan: concrete milestones over **3–6 months**. At
launch the supported goal is **positive cashflow** (spend less than you earn). If inputs shift
(income, timeline), the Roadmap **recalculates automatically**. Throughout 2026 they'll add goals
(emergency fund, pay down debt, save for a purchase) using the **same planning framework**.

**Daily Plan** — sets the daily course: summary of recent activity, a **safe-to-spend** amount for
the month, and corrective steps if drifting. Figures generated per individual (predicted expenses,
upcoming income, milestone progress); reflects unexpected events immediately.

**Actions** — advice → execution, **always with consent**. Each action ties to the Roadmap goal and
is surfaced in the Daily Plan. At launch: **move money to savings**, **prevent overdrafts with cash
advances**, **set spending limits at specific merchants**. 2026: negotiating bills, finding cheaper
insurance. Every action is evaluated by whether it **measurably improves** progress.

### Technical foundations (four capabilities)
**multi-agent architecture · transaction enrichment layer · adaptive planning models · continuous
learning from observed outcomes.**

**Agent architecture — right tool per task.** Routes work to **specialized subagents** with
constrained contexts that exchange **structured outputs**, not freeform text. New actions can be
added without retraining or growing prompt complexity.

🎨 **[Screenshot — Autopilot product screens]** Four labeled phone screens: **Insights** ("The big
picture", donut earning vs spending), **Roadmap** ("Spend smarter" goal card + month progress chips),
**Daily Plan** ("Left to spend" circular gauge + status pill), **Actions** (merchant-block
confirmation sheet). → analyzed in `startup/ui-notas-cleo.md`.

**Transaction enrichment — raw → understanding.** A pipeline using LLMs trained on labeled data
classifies transactions with nuance: recognizes **recurring** transactions, improves **income-stream
identification**, separates **essential vs discretionary**. "Cleo doesn't just know a transaction is
a bill; she knows it's an electricity payment, categorized under utilities, a recurring essential
expense." Downstream components consume the **enriched** representation, not raw data.

**Diagram — enrichment (transaction in → enriched out):**
```
   TRANSACTION IN                          TRANSACTION OUT (enriched)
 ┌──────────────────────────┐          ┌──────────────────────────────────────────────┐
 │ Description: CECONY XX4508│          │ Type:          Online                         │
 │              Jeremy Sm... │          │ Counterparty:  Con Edison (website, logo)     │
 │ Amount:      $45.21       │   ───►   │ Category:      House > Utilities & Bills       │
 │ Date:        2025-09-10   │          │                 > Energy > Electricity        │
 │ Account:     Chase Checking│         │ Essential?  Yes   ·   Recurring?  Yes         │
 └──────────────────────────┘          │ Location:      US > NY                         │
   "Cleo transforms bank transaction    └──────────────────────────────────────────────┘
    descriptions into structured, actionable data"
```

**Diagram — multi-model workflows with validation + feedback loops:**
```
 INSIGHT GENERATION (agentic workflow)
   ┌─────────────────────┐         ┌──────────────────────────┐
   │ Financial fact      │ ──────► │ Validation & scoring     │
   │ agent               │         │ agent                    │
   └─────────────────────┘         └──────────────────────────┘
            ▲                                  │
            └──────────── Regenerate ◄─────────┘

 SEMI-SUPERVISED TRANSACTION ENRICHMENT
   ┌─────────────────────┐  Fallback  ┌──────────────────────────┐
   │ Fast fine-tuned     │ ─────────► │ Oracle frontier          │
   │ model               │            │ reasoning model          │
   └─────────────────────┘            └──────────────────────────┘
            ▲                                  │
            └──────────── Training Labels ◄────┘
   "Each uses multi-model architectures with built-in validation and feedback loops"
```

**Adaptive planning** — Roadmap and Daily Plan come from models that **update continuously**.
Example: an unexpected medical bill mid-month → classified as non-recurring essential → projected
end-of-month balance updates → Daily Plan adjusts the new safe-to-spend.

**Continuous learning** — interprets how users respond and whether actions lead to **measurable
progress**, then feeds it back. At the system level uses **aggregated outcomes** to refine
prioritization/planning/action selection. Crucially: grounded in **real financial results (goal
adherence, successful execution), not engagement metrics.**

**Diagram — RL system that builds the Daily Plan:**
```
  Insights ────────► On Ramp Insights & ◄──────── Roadmap agent
     │                Roadmap Creation
 (Data enrichment)          │
     │                      ▼
     └─► Cleo Actions ─► ┌─ Daily plan w/ reinforcement learning ──┐
                         │  Action & insight  ─►  Conversation     │
                         │  selection agent        Plan            │
                         └────────────────────────┬───────────────┘
                                                   ▼
                              Conversation Agent (aka Cleo 3.0)
                                                   │ Action Success
                         └──────────── daily feedback loop ◄───────┘
   "Enriched data and insights feed an RL system that builds each user's Daily Plan"
```

---

## 2. Inside Cleo's multi-agent architecture

> *AI · 05/14/26.* "Specialization lets us match the right agent to each task."

Cleo 3.0 (last summer) introduced two agents: one that **reasons through conversations in real
time**, one that **analyzes transactions in the background**. Now expanded: the conversational side
is a **team of domain specialists** with a **router** classifying each message and a **handoff
protocol**; the background side builds a **persistent financial profile** the conversational agents
draw on.

**Why multi-agent.** A money assistant does very different jobs (interpret messy transaction data,
understand long-term trends, generate insights, hold real-time chat) with different context windows,
latency budgets, reasoning patterns, data needs. A **mega-prompt** covering everything accumulates
"redundancy and internal conflicts"; splitting into scoped agents lets each evolve independently and
**matches compute to task** (conversational = light/fast; analytical = heavy/long).

**Three connection mechanisms:** (1) a **router** that classifies incoming messages, (2) a **handoff
protocol** to redirect a conversation to another agent, (3) **sub-agents that appear as tools** inside
others. **Bottom-up** construction: a domain becomes an agent when "clearly defined and aligned with
current product priorities" → avoids premature abstraction.

**Diagram — two-plane architecture (recreated from the article's architecture image):**
```
                          User message
                               │
                               ▼
                           ┌────────┐
                           │ Router │
                           └───┬────┘
              ┌────────────────┴────────────────┐
              ▼                                  ▼
   ┌───────────────────────┐         ┌───────────────────────┐
   │ CONVERSATIONAL AGENTS  │        │ BACKGROUND AGENTS      │
   │ real-time specialists  │        │ async analysis of      │
   │ + handoff protocol     │        │ historical data        │
   └───────────┬───────────┘         └───────────┬───────────┘
               │ READS                            │ WRITES
               └────────────────┬─────────────────┘
                                ▼
                     ┌───────────────────────┐
                     │ DATA STORES            │
                     │ • Financial profile    │
                     │ • Insights retrieval   │
                     └───────────────────────┘
```

**Conversational agents** — feel like one continuous conversation; behind it are multiple specialists
chosen by topic. Shared constraints: tight latency → lighter models; **narrow context windows** (live
conversation only, not full history); **small output budgets** ("each token is a token the user is
waiting on"). Conversations cluster into domains; e.g., a dedicated **earned-wage-access** agent
(advance status, repayment, subscription). Selection = classifier router **today an LLM call**, being
replaced by a dedicated router model + a **handoff protocol** (`select_new_agent` tool) so a wrong
initial classification doesn't force a restart. They're A/B testing a **hybrid** (router + handoff).

**Background agents** — work on a **longer time scale** than any chat session, building a comprehensive
picture (cash flow, pay cadence, recurring obligations, deficit months, savings cushion). Input = a
**full year** of transactions + enrichment data; reasoning models produce **thousands of tokens** and
**chained LLM calls**; output is **stored** and served to the conversational side when needed.

**Onboarding** — when a user connects accounts, "Cleo doesn't wait for them to ask questions." During
setup she analyzes data and opens the **first conversation with specific observations** (e.g., income
grew steadily while savings stayed flat).

**Diagram — onboarding flow (recreated):**
```
 User connects ──► Background agents ──► Financial profile built ──► First conversation
 accounts          analyze tx history    • Cash flow                 (Cleo opens with
                                         • Recurring expenses          specific observations)
                                         • Patterns
```

**How the two modes connect** — via **stable data stores**: the **financial profile** store
(structured picture, written by background) and an **insights retrieval endpoint** (the behavioral
insights most likely to resonate now). Conversational agents read from both (at predetermined stages
or via tool calls). Example: "Why did my March spending feel high?" → query the **precomputed
profile** ("higher than monthly average, mostly dining out"), **not** parse months on the fly. The two
modes are **decoupled** → iterate each without disturbing the other.

---

## 3. Introducing Cleo's custom router

> *AI · 05/21/26.* "Keeps message classification accurate as user behavior shifts and new agents come
> online." The router decides which specialist agent handles each message, fast enough that users
> don't notice the extra step.

New router = an **encoder-only model trained on Cleo's own conversational traffic**: **~16× faster**
than the LLM router it replaces, and **beats GPT-5.4-nano on accuracy** on internal benchmarks.
Training on real Cleo conversations is the edge — it learns the specific message types users send,
which a general-purpose model can't.

**How Cleo picks the agent.** Classification happens **before** generation; latency it adds directly
affects wait time. Each decision is made before the agent replies, so switches don't interrupt a
response in progress. The system assumes the classifier is sometimes wrong → a specialist can call a
**handoff tool** to pass the message to the right agent (no restart).

Latency: GPT-5.4-nano ~**800 ms/msg**; in-house encoder ~**50 ms** (**16× reduction**).

**Diagram — router latency (16× reduction):**
```
 Router latency
 GPT-5.4-nano    ████████████████████████████████████████  ~800 ms
 In-house enc.   ███                                         ~50 ms
```

**Accuracy** (two labeled sets): (1) human-annotated tool-call scenarios (direct labels): **~94%**;
(2) broader set from reviewer-flagged high-quality conversations (quality as proxy, noisier but
larger): **~92%**. Most errors aren't misrouting per se — the latest message introduced something the
domain's agent wasn't equipped for; fix = **widen the agent's tool scope**.

### Four pieces of infrastructure to keep improving

**Traffic mirroring** — primary router serves live traffic; a **shadow model** runs in parallel
(no user impact). Comparing streams shows where the primary errs vs the shadow → feeds the next
training round. Anchors evals in **real production traffic** (a January benchmark may not reflect
April conversations).

**Diagram — traffic mirroring (recreated):**
```
            ┌─► Primary router (live traffic) ──► Response to user
 Message ───┤                   │
            └┄ MIRRORED ┄► Shadow model (parallel, no user impact)
                               │
               Compare decisions ◄┘
                   │ DISAGREEMENTS
                   ▼
             Feedback data ──TRAINS──► Next router version
```

**Automated prompt optimization** — replaces the manual loop. Feed in current prompt + dataset of
real conversations & outputs + (human/LLM-judge) evaluations → generate **candidate prompt revisions**
targeting specific failure modes; engineers review and test what ships. Template variables stay intact.

**Evaluation pipeline** — two layers in parallel: **offline** (tool selection vs annotated + broader
sets) and **online** (during rollout; human reviewers + LLM judges annotate a real-conversation
sample, flag drift/edge cases).

**Phased rollouts** — major changes go through **A/A** (updated system, identical prompts/tools, to
isolate infra impact) then **A/B** (the real behavioral change), both as gradual rollouts monitoring
engagement, conversion, conversation quality. *(Same pattern used to migrate agents GPT-4.1 → GPT-5.4.)*

**What's next:** complexity-based routing (light models for simple, reasoning models for complex),
more in-house SLMs, tighter feedback loops.

---

## 4. Fine-tuning a smaller model for quick replies

> *Building Cleo · 06/02/26.* "Quick replies only help if they arrive before users start typing, so we
> fine-tuned a specialized small model to reduce latency."

**Quick replies (QRs)** = suggested response buttons after Cleo's reply; reduce friction, surface
common actions. With Cleo 3.0's chat architecture, QRs became part of an **LLM-powered generative UI**
(more relevant, but higher latency — users often started typing before buttons appeared). Question:
for such a narrow task, do you need a large model or a small fine-tuned one?

🎨 **[Screenshot — QR in app]** Cleo message: "Hey you. You spent a total of $257 across 9 transactions
in the last 7 days. Want to dig into groceries or takeout first?" with two quick-reply buttons
**"groceries"** and **"takeout"** at the bottom. → UI pattern analyzed in `ui-notas-cleo.md`.

**Why QRs were a good fine-tuning candidate.** Simpler than freeform chat: input = recent context +
app state; output = QR candidates in a **fixed structure**. Two output categories: **text QRs**
(continue the conversation) and **app-navigation responses** (to a screen, e.g. `AccountsScreen`,
`SpendScreen`). Constrained outputs → easier to evaluate/train. They already had a behaviorally
grounded **training signal** (real interactions in production).

**Training approach & data.** Baseline **GPT-4.1-mini** (good QRs, latency too high). Fine-tuned
**GPT-4.1-nano** (inadequate alone, but fine-tuning on Cleo data was expected to close the gap while
keeping speed). Strategy = real product behavior, not hand labels: pulled **~2,000 conversations**
from logs, filtered to the QR step, kept cases **with engagement** (a clicked QR ≈ the product
objective); where engagement was missing, an **LLM judge** filtered good QRs; then **balanced** across
routes so rare destinations weren't underrepresented.

**Diagram — training pipeline (recreated):**
```
                          ┌─ WITH engagement ──► keep where user CLICKED the QR ──┐
 Pull QR conversations    │                                                        │
 from LLM logs ──► Filter ┤                                                        ├─► Balance
 (~2,000)         for cases└─ WITHOUT engagement ─► keep where LLM judge = "good" ─┘  training set
                                                                                        │
                                  Validate offline ◄── Fine-tune GPT-4.1-nano ◄─────────┘
```

**Validation (offline, two axes):** (1) **Guardrail** — agreement with the production model (safety
check vs distribution), on response type and route; (2) **Improvement signal** — agreement with a
stronger oracle (GPT-4.1 as LLM judge) for routing. Gains: `AccountsScreen` **39% → 78%** (+39 pts);
`SpendScreen` **58% → 72%** (+14 pts). Qualitatively, the fine-tuned model was **more conservative** in
navigation — several "offline regressions" were actually product improvements (it stayed in chat with
text QRs instead of pushing to a wrong screen).

**Production results (A/B):** QR engagement **+13.5%** at event level (button QRs +18%, and buttons are
>90% of volume); **P50 latency −53%** (1,310 ms → 631 ms); downstream **−5% token cost** (fewer turns).
"The latency change is what enabled the engagement gains."

**Sensitivity to schema changes (operational cost).** Weeks after launch, navigation-button rate rose
(users pushed to navigate at odd points). Cause: a **response-schema change** for a new feature,
deployed **without retraining**. Controlled test: **prompt change** → distributions ~unchanged;
**response-format change** (new field, same prompt, no retrain) → **+65% UI-button predictions** plus
hallucinations. Why: **constrained decoding** restricts tokens to keep JSON valid; fine-tuning on a
fixed schema makes the model fit it naturally, so the constraint rarely overrules it — change the
schema and the constraint must overrule more often → drift/hallucinations. A prompt has no equivalent
enforcement. **Lesson:** keep schema and fine-tuned model in **sync**; schema changes must trigger
re-fine-tuning; monitor output-type distributions for drift.

**What they learned:** model choice should match the workflow; the right fit for fine-tuning is a
**narrow, high-frequency task with stable prompt and schema**; specialization introduces brittleness
invisible in offline metrics.

---

## 5. How we taught Cleo to talk back

> *Building Cleo · 06/10/26.* Extending the chat engine to **real-time voice** while keeping
> personality/tone, high accuracy, low latency. **Voice Mode** (Cleo 3.0): tap the equalizer icon next
> to chat input to talk out loud in real time.

**Why voice:** **personality** (consistent identity across voice features), **empathy** (intonation
conveys warmth in an emotionally charged domain), **accessibility/efficiency** (hands-free, faster).

**Design — voice is not a separate surface.** Splitting "text Cleo" / "voice Cleo" would fragment UX
and architecture. Instead, Voice Mode **sets a flag on the existing chat pipeline**, routing outputs
to text-to-speech. Challenge: keep text/audio synced, low latency, personality intact.

**How it works (high level):** (1) user speaks → transcribed via **native on-device dictation APIs**
(shipped without building an STT pipeline from scratch); (2) the **partial transcript streams** into
Cleo's model pipeline (same as text chat); (3) as the model produces tokens, they're **mirrored to
ElevenLabs' v2** voice model for synthesis; (4) audio frames stream back and are **stitched for
playback before the full response is complete**.

**Diagram — Voice Mode cycle (recreated):**
```
        ┌──────────────────┐          ┌──────────────┐
   ┌───►│  Speech-to-Text  │ ───────► │   Chat 3.0   │
   │    │ (native dictation)│         │ (LLM pipeline)│
   │    └──────────────────┘          └──────┬───────┘
┌──────────┐                                 │ (tokens)
│User Speaks│                                ▼
└──────────┘                          ┌──────────────┐
   ▲                                  │ Text-to-Speech│
   │       ┌──────────────┐           │ (ElevenLabs v2)│
   └───────│  Cleo Speaks │ ◄─────────┴──────────────┘
           └──────────────┘   (audio streamed + stitched, before response is complete)
```

**Voice selection:** sourced multiple actors, cloned with ElevenLabs, compared cadence/emotional
range, picked one that captures "wit and empathy without tipping into the cartoonish."

**Latency–fluency tradeoff.** Early approach (emit tokens, split on punctuation, send to ElevenLabs)
caused stilted delivery and misreads: lists broke mid-stream, Markdown read literally, decimals wrong
— in finance, "$40.60" read as "forty dollars [pause] sixty" instead of "forty dollars and sixty
cents." Fixed with heuristics:
- **Token classification** (numeral, Markdown symbol, etc.).
- **Dynamic buffering** (adjacent numerals held and recombined into a complete value before speaking).
- **Length bounds** (min/max phrase length: no abrupt single-word flushes or run-ons).
- **First-audio delay** (wait enough to pair quick lead-ins with the next clause).

**Voice-first personality:** masked swear words (`sh*t`) were read as "asterisk" → now softened
variants (`sh`); exclamation marks sounded angry → **downgrade many `!` to `.`** for tone consistency.
Also: rules for **user interrupting mid-reply** and **graceful fallback to text** when audio fails.

**Takeaways:** the right **architecture** matters as much as the models (single pipeline avoids
fragmentation); **latency, not raw model quality**, is often the limiting factor; **personality and
brand consistency** matter alongside accuracy to sustain trust.

---

## 6. Service objects and the missing abstraction

> *Building Cleo · 03/25/26 · by Cassie Johnstone (Staff Engineer).* Why "service objects" can signal a
> **missing domain abstraction** in a Rails codebase.

Typical Rails top-level structure:
```
app/
 ├── controllers
 ├── models
 ├── serializers
 ├── services      ← full of "stuff you want to do"
 ├── views
 └── workers
```
Real Cleo examples: `GivePlusToCleoEmployee`, `Gpt::GenerateCompletionResponse`. Sometimes fine —
sometimes the impulse to reach for a service is the codebase telling you a **concept exists in the
domain but hasn't been named/modeled** (a *hidden abstraction*).

**Before.** Old Cleo chat history = a single long stream (WhatsApp-like), not discrete conversations
(ChatGPT-like). Three tables: `bot_requests`, `bot_responses`, `chat_messages` (polymorphic join).
Pre-LLM there was little need to understand conversation context; post-ChatGPT, history became vital
to the LLM payload. Their fix: a service, `Gpt::FetchBaseConversationHistory` (walk `chat_messages`
back within a time window). Slow, edge-case-ridden, hacks to avoid DB-in-a-loop, brittle N+1s. And it
wasn't one service but **four** (`FetchBaseConversationHistory`, `FetchDynamicConversationHistory`,
`ExtractConversationChatHistory`, `GenerateChatCompletionMessages`).

**The hidden abstraction.** They were missing the concept of a **conversation**. Enter
`ConversationSession` — a model that is a **parent collection of `chat_messages`**. The four services
collapsed to:
```ruby
conversation_history = conversation_session
  .chat_messages
  .includes(:message)
  .map(&:as_chat_completion_message)
```
Leaning on ActiveRecord (eager-loading, scoping). One abstraction killed four services "because the
domain model now better reflected reality."

**Balance.** Services are useful but **blunt** — they paper over cracks in domain modeling. A service
is a useful check: "Is my domain model missing something here?"

> *Relevance to Cuadra:* validates our **screaming/hexagonal** approach and the **ledger** (model the
> domain — Conversation, Asiento, Movimiento, Perfil — instead of patching with services). Our
> per-conversation `thread_id` in LangGraph is the equivalent of their `ConversationSession`.

---

## 7. How we built Cleo's visual world

> *Building Cleo · 03/27/26.* Behind Cleo's first **brand photography shoot** and the "futuristic but
> warm" visual language. *(Non-technical — branding; included for completeness, and useful for Cuadra's
> visual direction.)*

Cleo's mission is to change people's relationship with money → show life with financial stress lifted,
**vivid and believable**, with intentional friction/contrast (sophistication + credibility alongside
Cleo's playfulness/roast personality).

**The visual direction (relevant to UI/brand):** a technology-driven future that **rejects the tech
stereotype** of "cool blue light and metal." Instead: **greenery, earth tones, warm light**, built
environment + nature coexisting. Shot in **Cape Town** (brutalist concrete + green hills). Casting:
people "with lives beyond the frame," near-future "2031" feel, minimal makeup, natural styling.
Product depicted via **outcomes** (social experience of sharing on a device) rather than foregrounding
screens/UI — phones/smartwatches appear with **subtle screen-glow tints from Cleo's interface**.

> *Relevance to Cuadra:* Cleo deliberately avoids the cold fintech look for a **warm, human, earth-tone**
> world. Cuadra's green theme already leans this way — keep the warmth; lead imagery with **outcomes and
> people**, not dashboards. (Cleo's own UI palette = warm cream + dark brown + sparing accents.)

---

## 8. Cleo's Gender Pay Gap Report 2025

> *Life at Cleo · 04/01/26.* Cleo's first published UK gender pay gap report. *(Non-technical — HR;
> included for completeness.)*

The gender pay gap measures the difference in **average pay** between all men and all women regardless
of role/seniority (≠ equal pay). UK headcount on snapshot: 286 (277 full-pay).

**Gap:** mean **17.8%**, median **16.8%** — a **representation-distribution gap** (highest-paid senior
& technical roles skew male). Engineering & data science (highest market salaries) have the lowest
female representation.

**Diagram — % female across functions (recreated from the bar chart):**
```
 Engineering          ████████████████ 33%
 Data Science         ██████████████████ 37%
 Experience           █████████████████████████████ 58%
 Product              ███████████████████████ 46%
 Commercial & Finance ██████████████████████████ 53%
 People               ██████████████████████████████████ 68%
 Other                █████████████████████████ 50%
```

**Diagram — pay quartiles (% female / % male):**
```
 Q1 (Lower)        75 / 25
 Q2 (Lower-Mid)    36 / 64
 Q3 (Upper-Mid)    30 / 70
 Q4 (Upper)        33 / 67
```

**Bonus:** no discretionary annual bonus; only 22% received any classified bonus (**24.2% F, 20.3%
M**). Mean bonus gap **−18.9%** (women higher); median **0.0%**. **Pay progression** Apr-2024→Apr-2025:
women **+8.5%** vs men **+8.0%**.

**Actions:** compensation framework (bigger raises at the bottom of bands); enhanced tenure-based
maternity policy + full pension contributions during leave; "promote before hiring" (documented review
of internal female candidates before opening senior technical roles externally); visible progression
criteria; structured career conversations for women in tech (L3/L4) every 8–9 months.

---

## 9. How Cleo learns what your transactions actually mean

> *Building Cleo · 01/28/26.* The deep dive on the **transaction enrichment** foundation (the layer
> Autopilot depends on). "Accurate enough to trust and fast enough to scale."

**The problem.** Bank descriptions follow no universal standard (`SQ *BLUE BOTTLE` vs `BLUBTTLE NYC`);
a Venmo to a friend is structurally identical to a Venmo to a landlord; subscriptions and installment
plans both recur; income and reimbursements both arrive via ACH. Cleo gets transactions via open
banking in whatever form the bank provides — the **same sparse records the user sees**, no
point-of-sale merchant data. Rule-based systems handle obvious cases; real meaning needs **context**.

**What "enriched" means.** Raw record (description, date, amount, account) → structured, queryable
data, where **every attribute carries a confidence score** (so downstream can pick the
highest-confidence income stream instead of guessing). Layers of context added:
- **Counterparty identification** — resolve cryptic descriptions to real businesses (+ website, logo).
- **Hierarchical categorization** — two-level taxonomy: **19 top-level categories, ~175 total items**
  (e.g., Housing, Utilities & Bills → Energy → Electricity). Downstream reasons at any granularity.
- **Essential vs non-essential** — necessities (housing, food, healthcare, utilities) vs discretionary;
  description-based, with category-based fallback when description confidence is low.
- **Recurring vs one-off** — requires analyzing **sequences** of transactions, not discrete records.
- **Location** — geographic data where possible.

**Diagram — raw vs enriched (recreated):**
```
   TRANSACTION IN                          TRANSACTION OUT (enriched + confidence)
 ┌──────────────────────────┐          ┌──────────────────────────────────────────────┐
 │ Description: CECONY XX4508│          │ Counterparty: Con Edison (website, logo)      │
 │ Amount:      $45.21       │   ───►   │ Category:     House, Utilities & Bills         │
 │ Date:        2025-09-10   │          │                > Energy > Electricity         │
 │ Account:     Chase Checking│         │ Essential? Yes  ·  One-off/Recurring? Recurring│
 └──────────────────────────┘          │ Location:     US > NY                          │
                                        └──────────────────────────────────────────────┘
```

**Classification at scale — the "Swiss cheese model"** (layer strategies; any one has holes, stack
enough and little falls through):
```
 1. Tree-based models        → fast, lightweight; common patterns (feature pattern-matching)
        │ low confidence ↓
 2. Fine-tuned SLMs          → nuanced cases (ambiguous descriptions, similar merchants); cheap+fast
        │ still no confident answer ↓
 3. Frontier LLM fallback    → only ~1 in 10,000 transactions; max capability for max difficulty
```
(A cache layer for exact-match descriptions was designed but dropped — **local model latency beat
cache lookup**.) Result: accurate AND cheap enough to run on **every** transaction in real time.

**Training pipeline (high-capability model generates training data for smaller models):**
```
 ┌─ GOLDEN SET ──────► ORACLE ──────► SILVER SET ──────► PRODUCTION MODELS ──┐
 │ hand-labeled        best possible   oracle-labeled     tree-based +        │
 │ benchmark (user +   classifier      training data       fine-tuned SLMs    │
 │ domain expert)      (frontier+web)   (large volume)      (trained on silver)│
 └──── Evaluation ◄────────────────────────────────────────────┘             │
                                          LLM-AS-JUDGE (ongoing) ─Performance signal─┘
   "Oracle's expensive inference happens once, amortized across production classifications."
```
- **Golden set:** hand-labeled full history of a small user group — each tx verified by **the user who
  made it + a domain expert** → unusually high-quality ground truth; the benchmark for all models.
- **Oracle:** the best classifier regardless of cost (frontier LLM + web search).
- **Silver set:** oracle labels a large volume (not hand-verified) → training data for production.
- **Production models:** tree + SLM trained on silver, evaluated vs golden.
- **LLM-as-judge:** a frontier model evaluates classifications on new unseen transactions → drift
  signal without manual annotation.

**Results.** Accuracy **55% → 82%** — but not apples-to-apples: the old system measured a flat,
flawed taxonomy (transfers dumped in "excluded"); the new one classifies a **richer hierarchical**
taxonomy AND a **harder standard** (the *purpose* for the user, not just merchant type — a grocery
purchase could be weekly essentials or wine for a dinner). The confusion matrix shows strong diagonal
performance; residual confusion at genuinely ambiguous boundaries (dining vs takeout, household vs
groceries). "Transaction enrichment isn't the flashiest part… but it's what makes everything else
possible." Confidence scoring lets agents flag ambiguity upfront.

> *Applied to Cuadra:* this is the blueprint for our §5.6 enrichment layer (Swiss cheese + golden/oracle/
> silver/judge + confidence scores + 19/175 taxonomy).

---

## 10. What do people really want from an AI financial assistant?

> *Research · 01/28/26.* "Financial literacy isn't always what holds people back. The real challenge is
> **acting on what they already know.**" Survey of **10,000 adults aged 28–40, US + UK**. *(Strategy
> gold — directly validates Cuadra's thesis.)*

**The confidence–anxiety paradox.** **88%** felt confident managing finances; yet **~23%** reported
**both** feeling confident **and** losing sleep over money. Education isn't the right lever for people
who already understand their finances.
```
 The Confidence–Anxiety Paradox (US+UK, n=10,000)
 Feel confident managing money   ████████████████████████████████████  88%
 Lose sleep over money           ███████████                           28%
 Both (the paradox)              █████████                             23%
```

**It's not a knowledge problem.** "Not knowing how much to save" ranked **lowest (13%)**. The biggest
challenges fall into **execution** and **volatility**:
```
 Biggest challenges managing money (n=10,000, select up to 3)
 Unpredictable outgoings (surprise bills/repairs) ███████████████████  43%   ← volatility
 Balancing today vs tomorrow                      █████████████████    38%   ← execution
 Self-discipline                                  ████████████████     37%   ← execution
 Supporting family/friends                        ████████████         27%   ← volatility
 Unpredictable income (gig/flex)                  █████████            21%   ← volatility
 Not monitoring spending                          ████████             18%   ← execution
 Not knowing how much to save                     █████                13%   ← knowledge (lowest)
```

**Where people want AI help.** Roughly **binary** ("am I OK with AI acting on my money, or not?").
Those who say yes don't distinguish much by task — comfort spans just ~10 pts:
```
 Comfort with AI financial tasks (n=10,000)
 Advise on disposable income  ████████████████████████  58%
 Help hit savings target      ███████████████████████   55%
 Pay bills                    █████████████████████     50%
 Avoid overdrafts             █████████████████████     50%
 Move savings to higher int.  █████████████████████     50%
 Invest & manage money        ████████████████████      48%
```

**Building trust.** Direct experience beats external validation; the leading answer (**22%**) was
"**start small and see results**" (vs track record, regulation, recommendations).

**Cleo's takeaway / how they build around it.** AI is a **support layer between intention and action**;
it responds faster than someone checking their account every few days and helps follow through. This is
the thinking behind Autopilot: **lead with insight**, then **act** (move to savings, cash advance to
avoid overdraft, adjust budget when circumstances change) — **with the user watching** and clarity on
the rationale. "Most people are smarter about money than the financial industry gives them credit for."

> *Applied to Cuadra:* **massive validation of the concept's "fear/execution" insight.** The RD informal
> worker has *even more* volatility (irregular income, family support, surprise expenses). Strategy
> implications: (1) wedge is **execution + absorbing volatility**, not education; (2) **"start small,
> see results"** = onboarding/trust design; (3) proactive agent + actions (§7.9) are the answer, not
> more tutorials. Data source: Cleo internal, January 2026.

---

## 11. Memory as a step toward more human AI

> *AI · 07/22/25.* The architecture that helps Cleo remember what matters. Before memory, "Cleo felt
> forgetful" — asked the same questions, gave generic advice → emotional disconnect, lower trust,
> higher churn. Appending full chat history to every prompt = needle-in-a-haystack (LLM overlooks key
> details).

**Three approaches considered:**
```
 ┌──────────────┬─────────────────────┬──────────────────────┬──────────────────────┐
 │ Approach     │ Knowledge graphs    │ Agent-centric        │ Semantic insight     │
 │              │                     │ stateful systems     │ retrieval  ★CHOSEN   │
 ├──────────────┼─────────────────────┼──────────────────────┼──────────────────────┤
 │ Core paradigm│ temporal graph of   │ persistent internal  │ conversation         │
 │              │ entities/relations  │ agent state vs       │ summaries stored as  │
 │              │                     │ archival memory      │ vector embeddings    │
 │ Storage      │ graph DB (Neo4j,    │ relational (PG,      │ vector DB (Chroma,   │
 │              │ FalkorDB)           │ SQLite) + vector     │ LanceDB, OpenSearch) │
 │ Retrieval    │ hybrid semantic +   │ LLM-guided tool calls│ semantic similarity  │
 │              │ BM25 + graph + time │ + SQL for core mem   │ over embeddings      │
 │ Overhead     │ ✓ rich multi-hop    │ ✓ autonomous/adaptive│ ✓ lightweight, rapid │
 │              │ ✗ heavy to build    │ ✗ major refactor     │ ✗ low retrieval conf │
 │ OSS examples │ Graphiti(Zep),Memary│ Letta (MemGPT)       │ Mem0                 │
 └──────────────┴─────────────────────┴──────────────────────┴──────────────────────┘
```
Chose **semantic insight retrieval** (lightweight, clean integration, RAG), reinforced with
**structured metadata tagging** (knowledge-graph-inspired) → filter by topic, recency, identity.

**Memory pipeline (p95 < 500 ms):**
```
 1. CAPTURE & PARSE  → after a meaningful free-text exchange, a service summarizes it (via
                        GPT-4o / Gemini 2.0 Flash) + extracts metadata (topics e.g. goal_setting,
                        cash_advance; sentiment).
 2. EMBED & STORE    → summary → vector embedding in vector DB (+ summary text + metadata).
 3. RETRIEVE & FILTER→ agent decides when memory helps; semantic search, filter by recency/topic.
 4. INJECT & GENERATE→ retrieved memories injected into the prompt → fluent, history-aware reply.
```
Risk mitigations: filtering avoids surfacing **outdated info conflicting with real-time data** (e.g.,
bank balance); topic/sentiment analysis avoids recalling **overly sensitive** memories. Key learning:
memory was **counterproductive for narrow transactional queries** ("What's my balance?") → tuned to
trigger primarily on **open-ended** conversations.

**What's next:** richer memory structures (reflect/consolidate across sessions); **proactive
retrieval** (link memory to **push + app-entry messages**); a **user-facing UI to view/manage stored
memories** (correct/clarify → trust + feedback loop).

> *Applied to Cuadra:* refines §7.5 — semantic insight retrieval (pgvector) + metadata tagging,
> don't-retrieve-for-transactional, **editable-memory UI for trust**, proactive retrieval → push.

---

## 12. Evaluating Cleo vs. generalist AI models

> *Research · 07/24/25.* "If your AI can't add, you probably shouldn't ask it to manage your budget."
> One widely-used LLM reported a user spent **$28,000+** on bills last month; actual: **~$3,000** — a
> $25K error delivered with total confidence.

**Method.** Benchmarked Cleo vs **GPT-4o (OpenAI)**, **Gemini Flash 2.5 (Google)**, **Claude Sonnet 4
(Anthropic)** on **129 real transactions** ($29,502 in / $29,958 out). Six representative budgeting
questions (multi-step aggregation, time grouping, merchant analysis), e.g. "What was my total bill
spend last month, and what % of income?", "Most expensive subscription?", "Groceries at Walmart/Costco/
Target — total + visit count each."

**Results — overall accuracy (across 6 questions, 21 data points; Cleo 17/21):**
```
 Gemini 2.5 Flash  ████████████          28.6%
 Claude Sonnet 4   ██████████████        33.4%
 GPT-4o            █████████████████████████  61.9%
 Cleo              ████████████████████████████████  81.0%
```

**Example — bill spend & % of income:**
```
 Model            Reported bill spend   Reported % of income   Accuracy
 Correct Answer   $3,047.00             51.0%                  —
 Cleo             $3,047.00             51.0%                  2/2  ✓
 OpenAI GPT-4o    $3,930.04             12.7%                  0/2
 Gemini Flash 2.5 $28,812.93            97.7%                  0/2
 Claude Sonnet 4  $2,831.88              9.5%                  0/2
```

**Why.** Standalone LLMs answer from **internal statistical associations**; Cleo is **agentic** and
routes all calculations through **deterministic tools** — the LLM is strictly interpretive (parse
query, format output), **not doing the math**. This eliminates mathematical hallucinations. Remaining
hard case for everyone: categorizing one-off transfers (reimbursements between friends).

> *Applied to Cuadra:* hard reinforcement of our core ADR — **LLM razona / tools calculan** (§7.3).

---

## 13. Building a financial agent on top of commodified LLMs

> *AI · 07/23/25.* "Cleo 3.0 extends off-the-shelf LLMs by adding memory, tools, and real-time agentic
> reasoning." Thesis: baseline conversational intelligence is now commodity (off-the-shelf LLMs); the
> **differentiator is the systems/experiences built around it.** Cleo treats commodified LLMs as a
> **substrate**, layering agentic reasoning + long-term memory + multimodal interaction.

**What makes Cleo different:** most finance products (even AI ones) behave like help centers — reactive,
templated, forget interactions. Cleo 3.0 **remembers and adjusts in real time**: a **background agent**
monitors transaction history + prior conversations to detect changes (spending shifts, missed goals)
and surfaces insights/follow-ups automatically. Memory is **personal** (why goals were set, what's
stressful). Input isn't only transactions — **typed messages, voice, UI interactions** integrated.

**Four core capabilities:**
```
                    ┌──────────────────┐
                    │ Agentic reasoning │
                    └──────────────────┘
                            │
 ┌──────────────┐   ┌──────────────┐   ┌──────────┐
 │ Multimodality │──│   Cleo 3.0   │──│  Memory  │
 └──────────────┘   └──────────────┘   └──────────┘
                            │
                       ┌─────────┐
                       │  Tools  │
                       └─────────┘
```
- **Agentic reasoning:** plans actions, invokes tools, decomposes goals via recursive tool calls;
  **dynamically scales compute** (light for simple, deep planning when needed).
- **Memory:** structured summaries (goals, preferences, stressors), retrieved selectively.
- **Tools:** library of purpose-built tools, structured schema, invoked by the LLM; multi-step
  workflows, precision, less prompt bloat.
- **Multimodality:** real-time two-way voice + text on the same reasoning engine.

**Three challenges → design principles:**
1. **Unpredictable model behavior → evaluation-first design** (test against a wide suite of real-world
   queries; small wording/context changes cause inconsistent multi-step outputs).
2. **Emotionally sensitive timing → personalized, opinionated AI** (proactive messages draw on memory
   + sentiment to decide what/when; **confidence thresholds + content filters** for emotional risk
   around debt/overspending/missed goals; neutrality "can feel cold").
3. **Fragmented input modes → multimodal by default** (voice/text/UI unified; same memory/tools/state).

**Results:** emotionally resonant check-ins ("how are you feeling, not just what you're spending") →
longer, deeper conversations; background planning agents → higher goal completion without manual
prompts; **81% accuracy** vs generalist LLMs (offloading math to deterministic tools).

---

## 14. Introducing Cleo 3.0

> *Release · 07/22/25.* "The biggest leap yet for the world's first AI financial assistant." Agentic
> reasoning, personalized memory, real-time voice. "Cleo 3.0 doesn't just understand what you said.
> She figures out how to get it done."

**What's changed:** **Agentic architecture** (multi-step tasks in chat, autonomously selects tools);
**Proactive reasoning** (OpenAI **o3**, chain-of-thought over recent transactions, unprompted);
**Memory** (remembers goals/stressors across chats); **Voice** (real-time two-way + trivia games).

**Evaluations:** 129 transactions (~$29,500 in / ~$29,900 out); **Cleo 81%**, decisively beating
OpenAI/Anthropic/Google models. Architecture = deterministic tools do the math; LLM interprets.

**Diagram — conversational architecture, Cleo 2.0 (RAG) vs 3.0 (LLM agents) (recreated):**
```
 CLEO 2.0 — RAG SYSTEM
   Context ─► text classification (LLM + handcrafted rules) ─► text templates populated
            with user data ─[Prompt]► LLM text generation ─► Output
            (reads: relational DB + vector DB via embedding & semantic-search service)

 CLEO 3.0 — LLM AGENTS
   Context ─► ORCHESTRATOR (LLM decides which agent responds) ─► LLM agent ─► Output
              │  └─ tool calls until response ready ─► Tools (abstract data read/write ops)
              │        reads: relational DB (Read) + vector DB (Read via semantic search)
```

**Proactive financial reasoning — the Smart Insights Agent (uses o3):** analyzes the **past six
months**, enriched with **merchant names, spending categories, social comparison signals**;
**multi-step reasoning, multiple passes**; generates structured insights **tagged by category and
confidence level**, loaded into a vector DB (**OpenSearch**) so insights surface the moment you open
the app.

**Diagram — Financial Reasoning Agent / Smart Insights pipeline (recreated):**
```
 ┌──────────────── FINANCIAL REASONING AGENT ─────────────────────────────────┐
 │ Task description ──┐                  Tools:                                 │
 │ Output schema      ├─► Agent definition  • API endpoints (top merchants,     │
 │ (Pydantic models) ─┘   (OpenAI SDK:        top categories, social compare)   │
 │                         task + LLM +      • Data warehouse (6mo transactions) │
 │           ┌─ LLM ─►     output schema) ──► Prompt (input + user data + ctx)   │
 │           │            └──────────────► AGENT LOOP RUNNER ◄─┘                 │
 └───────────┴─────────────────────────────────│──────────────────────────────┘
                                                ▼
        Scheduled/event-driven  ┄┄►  Amazon S3  { fact, category, confidence,
        batch job               ┄┄►              suggested_action, reasoning_trace,
                                                  supporting_data }
                                                ▼
                                     Humanization prompt  ─►  Insight pool (OpenSearch)
```

**Tools** (~40, defined with structured instructions: when to use, inputs, how to interpret).
Two kinds — **retrieval** and **action**:
```
 Category         Example tools                 Database     Access control
 Data lookup      get_budget, get_transactions  PostgreSQL   Read-only, scoped to user
 Semantic search  product_faq, retrieve_memories OpenSearch  Read-only
 Actions          set_budget, create_subscription PostgreSQL Write
```

**Memory:** summarizes/stores conversations (goals, recurring patterns, stress points) — key
takeaways, not every word; recalls proactively.

**Voice:** two-way STT + TTS pipeline + a **dynamic visual representation of Cleo** that responds as
she listens/speaks.

**What's next (roadmap):** **Finhealth score** (composite metric), **visualizations in chat** (graphs/
trendlines rendered in conversation), **account aggregation** (connect multiple accounts, cross-account
insights).

> *Applied to Cuadra:* concrete **insight schema** `{fact, category, confidence, suggested_action,
> reasoning_trace, supporting_data}` (→ §7.9/§10); the **retrieval/action + read-only-scoped/write tool
> taxonomy** (→ §12.1 RBAC); **Finhealth-style score** and **in-chat visualizations** as roadmap ideas.
