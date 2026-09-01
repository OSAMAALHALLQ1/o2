# Low-RAM Environment Execution Guardrails (4GB RAM)

## 1. Sequential & Filtered Command Execution
- Never execute unconstrained parallel builds or tests across all monorepo packages simultaneously.
- Prefer package-scoped execution (e.g., `pnpm --filter=@o2/api test` followed by `pnpm --filter=@o2/game-core test`) over full monorepo `--parallel` runs.
- When running `turbo`, avoid spawning unbounded worker threads; run tasks sequentially per workspace where feasible.

## 2. Resource-Conscious Testing
- Use in-process Node test runner (`node --experimental-strip-types --test`) and lightweight PGlite instances for PostgreSQL tests.
- Avoid spawning heavy external containers or background services unless explicitly available and requested.
- Run tests file-by-file or package-by-package instead of spawning wide parallel worker pools.

## 3. Memory Caps & Process Hygiene
- Clean up interval timers, background watchers, and hanging child processes immediately after task completion.
- Set Node memory allocation conservatively where appropriate (e.g. `--max-old-space-size=1536`).
