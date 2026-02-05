# AgentEscrow invariants (v1.x)

These are the *contract-level* rules we rely on for correctness, auditability, and judge-legibility.

## Definitions
- A job **exists** iff `jobs[jobId].client != address(0)`.
- A job is **settled** iff `jobs[jobId].released == true`.

## Invariants

### Existence & identity
1) **No overwrite:** a jobId cannot be reused.
   - Enforced by: `require(jobs[jobId].client == address(0), "Job exists")` in `createJob`.
2) **Existence checks:** all state-changing functions require job existence.
   - Enforced by: `require(job.client != address(0), "No job")`.

### Consent & authorization
3) **Explicit provider consent:** only `provider` can accept.
   - Enforced by: `acceptJob`: `require(msg.sender == job.provider, "Not provider")`.
4) **Provider completion:** only `provider` can mark complete, and only after acceptance.
   - Enforced by: `markComplete`: `require(job.accepted, "Not accepted")`.

### Settlement & funds safety
5) **Single settlement:** funds for a job can move out of escrow at most once.
   - Enforced by: `require(!job.released, "Already settled")` + setting `released=true` before transfers.
6) **Two terminal paths (mutually exclusive):**
   - Release path: `accepted && completed && !released` ⇒ transfer `amount` to `provider`.
   - Refund path: `expired && !completed && !released` ⇒ transfer `amount` to `client`.
7) **Third-party finalization is safe:** anyone may call `releasePayment` / `refundIfExpired` if and only if the preconditions are satisfied.
   - Motivation: reduces coordination friction; does not weaken correctness due to invariant #5.
8) **Conservation (per job):** escrowed `amount` must end up with either provider (release) or client (refund).
   - Verified by tests that compare balances before/after settlement.

### Time logic
9) **Expiry is monotonic:** once `block.timestamp > deadline`, the job is expired forever.
   - Enforced by: `refundIfExpired` uses `block.timestamp > job.deadline`.

## Notes
- These invariants are *intentionally minimal* for the hackathon demo: no disputes, no milestones, no fees.
