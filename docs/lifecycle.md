# AgentEscrow lifecycle (v1.x)

This contract is intentionally a minimal single-shot escrow:

```
createJob -> acceptJob -> markComplete -> releasePayment

createJob -> (time passes, deadline exceeded) -> refundIfExpired
```

## State fields
A job is:
- **Created** when `client != 0`.
- **Accepted** when `accepted == true` (only provider can set).
- **Completed** when `completed == true` (only provider can set, after accept).
- **Settled** when `released == true` (terminal; set by either release or refund).

## Transition rules (preconditions)
- `createJob(jobId, provider, amount, duration)`:
  - jobId must be unused; provider nonzero; amount > 0; duration > 0
  - USDC transfers from client to escrow

- `acceptJob(jobId)`:
  - only provider
  - job exists, not settled, not already accepted

- `markComplete(jobId)`:
  - only provider
  - job exists, accepted, not already completed, not settled

- `releasePayment(jobId)` (callable by anyone):
  - job exists, completed, not settled
  - sets `released=true`, then transfers USDC to provider

- `refundIfExpired(jobId)` (callable by anyone):
  - job exists, `block.timestamp > deadline`, not completed, not settled
  - sets `released=true`, then transfers USDC back to client

## Why “anyone can finalize”
Settlement is permissionless to reduce coordination friction (any watcher/relayer can pay gas), while safety is preserved by strict preconditions + the single-settlement guard.
