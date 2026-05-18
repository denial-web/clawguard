# ForceMemory Integration Contract

For agent frameworks and custom agent runtimes.

Version: draft contract for ForceMemory 0.1.x  
Status: source-unverified  
Date: May 17, 2026

This document is a paste-ready integration specification for wiring ForceMemory into an AI agent runtime. It is intentionally framework-agnostic and compatible with ClawGuard Agent by treating ForceMemory as an optional advanced persistent-memory backend, not as the default ClawGuard memory engine.

Important: ForceMemory source is not included in this repository. All schemas and method names below are provisional until Codex or an implementer verifies the actual ForceMemory package source.

## 0. Source Verification Required

Before implementing any adapter, Codex must verify the real ForceMemory source.

Required preflight:

1. Locate the ForceMemory source checkout or installed package.
2. Confirm the package version and current public API.
3. Inspect the actual schema/type definitions.
4. Run the current ForceMemory test suite.
5. Replace provisional dataclasses in this document with actual exported types.
6. Measure benchmark latency instead of inventing numbers.
7. Stop implementation if source behavior contradicts this contract.

If source and this document disagree, the implementation must follow source and report the deltas.

Expected review output:

1. Source path and version.
2. Field-name diff against this contract.
3. Test and benchmark results.
4. Any contradictions or missing source features.

## 1. What ForceMemory Is

ForceMemory is an auditable persistent-memory backend for AI agents. It treats durable memory writes, revisions, and rejections as explicit decisions under uncertainty. A decision spine records the submitted candidate, policy version, score bundle, action, fidelity, provenance, and result.

ForceMemory owns persistent cross-session memory. It does not own:

- the LLM context window
- current session state
- in-flight tool state
- prompt templates
- short-term scratchpad memory

In ForceMemory 0.1.x, writes/revisions/rejections are governed. Retrieval may return fidelity and provenance, but fully scored retrieval should be treated as roadmap unless the verified source proves it already exists.

## 2. Integration Goals

- Route every persistent memory candidate through ForceMemory. No raw vector inserts, summary appends, or side-channel durable writes.
- Preserve the host agent's working context and session state. ForceMemory only replaces or augments persistent memory.
- Render fidelity and provenance into the agent's reasoning context so recalled memory is not treated as absolute truth.
- Make the ForceMemory decision log the audit trail for memory drift, contradiction, hallucination poisoning, and policy decisions.
- Keep the integration reversible. Agent code talks to a memory interface; ForceMemory is one backend behind that interface.

For ClawGuard Agent, the default memory backend remains local JSONL. ForceMemory should be introduced later as an optional advanced backend:

```text
ClawGuard Agent memory interface
  -> JSONL memory backend (default)
  -> ForceMemory backend (optional, advanced)
```

## 3. Memory Pipeline

ForceMemory receives submitted memory candidates, not raw agent traffic.

Use this pipeline:

```text
raw observation
  -> classify/filter
  -> redact sensitive data
  -> extract zero, one, or many WriteCandidate records
  -> request approval if sensitive or business-rule memory
  -> submit candidate to ForceMemory decision spine
  -> persist decision and audit result
```

Examples:

- User says "hi" -> zero candidates.
- User says "Remember I prefer TypeScript" -> one preference candidate.
- Tool result includes a verified package version -> one tool-provenance candidate.
- Agent drafts a long final answer -> zero candidates unless a specific verified fact or user-approved rule is extracted.

Do not persist an entire user message, tool output, or assistant response just because it exists. Persist only candidate facts, preferences, rules, decisions, or corrections that are meaningful across sessions.

## 4. Sensitive Data Policy

Adapters must classify and redact before submitting candidates.

Sensitive categories:

- secrets and API keys
- passwords, tokens, seed phrases, private keys
- personal data and identifiers
- financial, payment, bank, payroll, tax, or customer data
- health, legal, employment, or regulated data
- internal credentials, URLs, infrastructure names, and incident details

Required behavior:

- Never store raw secrets.
- Redact sensitive values before persistence.
- Mark sensitive candidates with `sensitivity="sensitive"` or `sensitivity="regulated"`.
- Require user or policy approval for sensitive memory and business-rule memory.
- Support deletion/export requests at the host layer, even if ForceMemory implements the underlying storage.
- Store evidence references where possible instead of copying sensitive payloads.

For ClawGuard, sensitive and business-rule memory must remain approval-gated.

## 5. Adapter Interface

The canonical adapter is async-first. Sync wrappers are allowed for simple hosts.

```python
class ForceMemoryAdapter:
    def __init__(self, config: ForceMemoryConfig): ...

    async def submit_candidate(self, candidate: WriteCandidate) -> Decision: ...
    async def recall(self, query: RecallQuery) -> list[RecalledChain]: ...
    async def end_session(self, session_id: str) -> None: ...

    async def submit_tool_result(
        self,
        tool_name: str,
        result: str,
        session_id: str,
        agent_id: str,
        metadata: dict | None = None,
    ) -> list[Decision]: ...

    async def submit_belief_update(self, candidate: WriteCandidate) -> Decision: ...
    async def submit_contradiction(self, event_a: str, event_b: str, note: str) -> Decision: ...
    async def switch_policy(self, new_policy_id: str) -> None: ...

    async def get_decision(self, decision_id: str) -> Decision: ...
    async def list_decisions(self, session_id: str, limit: int = 100) -> list[Decision]: ...
    async def explain_chain(self, chain_id: str) -> ChainExplanation: ...
```

Recommended sync wrapper:

```python
class SyncForceMemoryAdapter:
    def __init__(self, async_adapter: ForceMemoryAdapter): ...

    def submit_candidate(self, candidate: WriteCandidate) -> Decision: ...
    def recall(self, query: RecallQuery) -> list[RecalledChain]: ...
    def end_session(self, session_id: str) -> None: ...
```

Policy-switch semantics:

- New decisions use the active policy at submission time.
- In-flight decisions complete under the policy they started with.
- Old decisions are never redecided silently.
- Re-evaluation must create a new decision that references the older decision.

## 6. Provisional Data Shapes

These types are provisional until verified against ForceMemory source.

```python
from dataclasses import dataclass
from datetime import datetime
from typing import Literal

FidelityLabel = Literal["low", "medium", "high", "verified"]
MemorySensitivity = Literal["public", "internal", "sensitive", "regulated"]

@dataclass
class WriteCandidate:
    content: str
    source: str
    session_id: str
    agent_id: str
    topic_hints: list[str] | None
    timestamp: datetime
    sensitivity: MemorySensitivity
    redacted: bool
    evidence_refs: list[str]
    policy_id: str | None
    metadata: dict | None

@dataclass
class Decision:
    decision_id: str
    op_type: Literal["append", "revise", "reject"]
    chain_id: str | None
    event_id: str | None
    policy_version: str
    score_bundle: dict[str, float]
    fidelity_label: FidelityLabel
    fidelity_score: float
    calibration_source: str
    action_reason: str
    timestamp: datetime

@dataclass
class RecallQuery:
    goal: str
    session_id: str
    agent_id: str
    topic_hints: list[str] | None
    max_chains: int = 8
    min_fidelity_score: float = 0.0
    include_superseded: bool = False

@dataclass
class RecalledChain:
    chain_id: str
    topic_key: str
    summary: str
    events: list["RecalledEvent"]
    fidelity_label: FidelityLabel
    fidelity_score: float
    calibration_source: str
    provenance: dict
    last_updated: datetime

@dataclass
class RecalledEvent:
    event_id: str
    content: str
    source: str
    timestamp: datetime
    fidelity_label: FidelityLabel
    fidelity_score: float
    superseded_by: str | None
    evidence_refs: list[str]
```

Fidelity guidance:

- `fidelity_label` is the agent-facing qualitative signal.
- `fidelity_score` is a relative ranking signal in 0.1.x, not a calibrated probability unless source proves calibration.
- `calibration_source` explains how the fidelity value was produced.
- Agents should render fidelity in prompts and prefer higher-fidelity memories, but should not treat any recalled memory as unquestionable truth.

## 7. Required Invariants

- Every submitted `WriteCandidate` produces exactly one `Decision`.
- One raw observation may produce zero, one, or many candidates.
- Rejections create decision rows.
- No silent memory drops after a candidate is submitted.
- Session ID and agent ID are mandatory for writes and recalls.
- Tool provenance must use `tool:<name>`, not plain `tool`.
- Adapter code must not rescale fidelity silently.
- Adapter code must not swallow ForceMemory errors.
- Adapter code must not maintain persistent caches of decisions or recalls.
- Per-turn recall snapshots are allowed and encouraged.
- Recall should be stable for the same query and same database state.
- Schema mismatch must fail startup.

Signed-delta guidance:

- Treat "signed deltas" as hash-chained memory deltas unless source proves cryptographic signing exists.
- Cryptographic signatures are future work unless verified in ForceMemory source.

## 8. Reference Adapter Patterns

### 8.1 Candidate Extraction

All adapters should use an extraction step before ForceMemory submission.

```python
from datetime import datetime

def extract_memory_candidates(
    observation: str,
    source: str,
    session_id: str,
    agent_id: str,
    metadata: dict | None = None,
) -> list[WriteCandidate]:
    text = observation.strip()
    if len(text) < 12:
        return []

    # Host-specific extraction belongs here.
    # This placeholder is intentionally conservative.
    if "remember" not in text.lower() and source == "user":
        return []

    redacted_text, was_redacted, sensitivity = redact_and_classify(text)

    return [
        WriteCandidate(
            content=redacted_text,
            source=source,
            session_id=session_id,
            agent_id=agent_id,
            topic_hints=None,
            timestamp=datetime.utcnow(),
            sensitivity=sensitivity,
            redacted=was_redacted,
            evidence_refs=[],
            policy_id=None,
            metadata=metadata,
        )
    ]
```

### 8.2 Vanilla Python Agent Loop

```python
from datetime import datetime
import uuid

class SimpleAgent:
    def __init__(self, llm_client, fm_adapter):
        self.llm = llm_client
        self.memory = fm_adapter
        self.session_id = str(uuid.uuid4())
        self.agent_id = fm_adapter.config.agent_id

    async def turn(self, user_message: str) -> str:
        for candidate in extract_memory_candidates(
            user_message,
            source="user",
            session_id=self.session_id,
            agent_id=self.agent_id,
        ):
            await self.memory.submit_candidate(candidate)

        recalled = await self.memory.recall(RecallQuery(
            goal=user_message,
            session_id=self.session_id,
            agent_id=self.agent_id,
            topic_hints=None,
            max_chains=8,
            min_fidelity_score=0.3,
        ))

        prompt = f"{render_memory(recalled)}\n\nUser: {user_message}"
        response = await self.llm.complete(prompt)

        # Do not store the whole response as memory.
        # Extract only explicit, durable, verified candidates.
        for candidate in extract_memory_candidates(
            response,
            source="agent_belief",
            session_id=self.session_id,
            agent_id=self.agent_id,
            metadata={"in_response_to": user_message[:200]},
        ):
            await self.memory.submit_candidate(candidate)

        return response

    async def end_session(self):
        await self.memory.end_session(self.session_id)
```

### 8.3 LangGraph Adapter

```python
from typing import TypedDict

class AgentState(TypedDict):
    session_id: str
    agent_id: str
    user_message: str
    recalled_chains: list[RecalledChain]
    llm_response: str | None

class ForceMemoryNodes:
    def __init__(self, adapter: ForceMemoryAdapter):
        self.fm = adapter

    async def observe_node(self, state: AgentState) -> AgentState:
        candidates = extract_memory_candidates(
            state["user_message"],
            source="user",
            session_id=state["session_id"],
            agent_id=state["agent_id"],
        )
        for candidate in candidates:
            await self.fm.submit_candidate(candidate)
        return state

    async def recall_node(self, state: AgentState) -> AgentState:
        chains = await self.fm.recall(RecallQuery(
            goal=state["user_message"],
            session_id=state["session_id"],
            agent_id=state["agent_id"],
            topic_hints=None,
            max_chains=8,
            min_fidelity_score=0.3,
        ))
        return {**state, "recalled_chains": chains}

    async def record_response_node(self, state: AgentState) -> AgentState:
        response = state.get("llm_response")
        if not response:
            return state

        candidates = extract_memory_candidates(
            response,
            source="agent_belief",
            session_id=state["session_id"],
            agent_id=state["agent_id"],
        )
        for candidate in candidates:
            await self.fm.submit_candidate(candidate)
        return state
```

Recall once at the start of a turn and pass `recalled_chains` through downstream nodes. Do not recall between every LLM hop unless the database state intentionally changed and the new recall is required.

### 8.4 Claude Agent SDK Adapter

```python
class ClaudeAgentMemoryHooks:
    def __init__(self, fm: ForceMemoryAdapter, session_id: str, agent_id: str):
        self.fm = fm
        self.session_id = session_id
        self.agent_id = agent_id
        self._turn_recall = None

    async def before_turn(self, user_message: str):
        for candidate in extract_memory_candidates(
            user_message,
            source="user",
            session_id=self.session_id,
            agent_id=self.agent_id,
        ):
            await self.fm.submit_candidate(candidate)

        self._turn_recall = await self.fm.recall(RecallQuery(
            goal=user_message,
            session_id=self.session_id,
            agent_id=self.agent_id,
            topic_hints=None,
            max_chains=8,
            min_fidelity_score=0.3,
        ))

    def memory_for_prompt(self) -> str:
        return render_memory(self._turn_recall or [])

    async def on_tool_result(self, tool_name: str, result: str):
        candidates = extract_memory_candidates(
            result,
            source=f"tool:{tool_name}",
            session_id=self.session_id,
            agent_id=self.agent_id,
        )
        for candidate in candidates:
            await self.fm.submit_candidate(candidate)

    async def after_turn(self, final_response: str):
        for candidate in extract_memory_candidates(
            final_response,
            source="agent_belief",
            session_id=self.session_id,
            agent_id=self.agent_id,
        ):
            await self.fm.submit_candidate(candidate)
        self._turn_recall = None

    async def end_session(self):
        await self.fm.end_session(self.session_id)
```

`_turn_recall` is allowed because it is a per-turn snapshot, not a persistent adapter cache.

## 9. Rendering Recalled Memory

Render memory with fidelity and provenance.

```python
def render_memory(chains: list[RecalledChain]) -> str:
    if not chains:
        return ""

    lines = ["Relevant persistent memory. Treat lower-fidelity items as uncertain:"]
    for chain in chains:
        lines.append(
            f"- [{chain.fidelity_label}:{chain.fidelity_score:.2f}] "
            f"{chain.summary} "
            f"(source={chain.provenance.get('source', 'unknown')}, "
            f"updated={chain.last_updated.isoformat()})"
        )
    return "\n".join(lines)
```

Never render recalled memory as hidden, unquestionable system truth. The agent should see uncertainty.

## 10. Operational Concerns

Latency:

- ForceMemory benchmark numbers must be measured from the verified source.
- Do not fill p50/p99 values by estimation.
- Report hardware, Postgres version, dataset size, and benchmark command.

Failure modes:

| Failure | Required behavior |
| --- | --- |
| Postgres unreachable | Raise; host may continue without memory but must know memory is degraded. |
| Policy exception | Raise a policy error; do not fake a decision. |
| Schema mismatch | Refuse startup. |
| Embedding backend unavailable | Use source-defined fallback only; otherwise raise or return explicit degraded metadata. |
| Duplicate decision ID | Raise; caller decides whether to retry. |
| Approval denied | Return or raise a blocked result according to host convention; do not persist memory. |

Concurrency:

- A single ForceMemory client instance per agent is preferred.
- Writes to the same chain must serialize at the storage layer.
- Parallel tool results may be extracted concurrently, but candidate submission should preserve ForceMemory's consistency model.

Multi-agent:

- `agent_id` must partition writes and recalls by default.
- Cross-agent reads are unsupported unless explicitly enabled by config and policy.
- If unsupported, adapters should prevent cross-agent reads rather than relying on convention.

Letta:

- Wrap Letta first. Do not replace Letta memory by default.
- For Letta users, ForceMemory should act as a governed persistence/audit backend behind or alongside Letta's memory lifecycle.
- Full replacement is a later migration path after users can compare behavior.

## 11. Validation Suite

These tests must pass before declaring an integration complete.

```python
async def test_candidate_produces_decision(adapter, candidate):
    decision = await adapter.submit_candidate(candidate)
    assert decision.decision_id
    assert decision.op_type in ("append", "revise", "reject")
    assert decision.fidelity_label in ("low", "medium", "high", "verified")
    assert 0.0 <= decision.fidelity_score <= 1.0

def test_raw_hi_produces_zero_candidates():
    candidates = extract_memory_candidates(
        "hi",
        source="user",
        session_id="s1",
        agent_id="a1",
    )
    assert candidates == []

async def test_sensitive_memory_requires_approval(adapter, approval_gate):
    candidate = make_candidate(
        "My API key is sk-live-redacted",
        sensitivity="sensitive",
        redacted=True,
    )
    result = await approval_gate.submit_with_policy(adapter, candidate)
    assert result.status in ("pending_approval", "blocked")

async def test_rejected_candidate_has_decision_row(adapter):
    decision = await adapter.submit_candidate(make_rejected_candidate())
    assert decision.decision_id
    assert decision.op_type == "reject"

async def test_recall_includes_fidelity_and_provenance(adapter):
    await adapter.submit_candidate(make_candidate("User prefers TypeScript."))
    chains = await adapter.recall(make_recall("language preference"))
    assert chains
    assert chains[0].fidelity_label
    assert chains[0].provenance is not None

async def test_recall_is_stable(adapter):
    query = make_recall("stable query")
    first = await adapter.recall(query)
    second = await adapter.recall(query)
    assert [c.chain_id for c in first] == [c.chain_id for c in second]

async def test_broken_db_raises(adapter_with_broken_db):
    with pytest.raises(MemoryStoreError):
        await adapter_with_broken_db.submit_candidate(make_candidate("hello"))

def test_schema_mismatch_refuses_startup():
    with pytest.raises(SchemaMismatchError):
        ForceMemoryAdapter(load_config_with_old_schema())
```

End-to-end scenario:

1. Submit ten meaningful observations across three sessions.
2. Submit one trivial observation and confirm it creates zero candidates.
3. Submit one sensitive candidate and confirm approval is required.
4. Trigger a deliberate contradiction.
5. Query `explain_chain`.
6. Verify event history includes the contradiction and decision.
7. Verify policy version matches submission-time policy.
8. Verify recall renders fidelity and provenance.

## 12. Codex Implementation Instructions

When using this contract as a Codex task, ask Codex to produce:

1. Source verification report.
2. Schema diff against this document.
3. One implemented adapter for the selected framework.
4. Validation test results.
5. Answers to unresolved source questions.

Do not ask Codex to:

- invent ForceMemory field names
- invent latency numbers
- store full raw messages by default
- silently ignore source mismatches
- add persistent adapter caches
- turn agent beliefs into verified facts without evidence

Minimum correct integration:

```text
candidate extraction
  + redaction/sensitivity classification
  + async ForceMemory adapter
  + decision logging
  + fidelity/provenance rendering
  + validation suite
```

Anything beyond that is optional.
