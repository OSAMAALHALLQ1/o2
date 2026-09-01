# Node.js Strip-Types & Monorepo Contract Guidelines

## 1. TypeScript Strip-Only Mode (`--experimental-strip-types`)
When writing code intended to run under `node --experimental-strip-types`:
- **Explicit Property Declarations**: Never use constructor parameter properties (`constructor(private readonly x: ...)`). Declare properties on the class body and assign them in the constructor.
- **Pure Core Logic**: Keep core state machines, engines, utilities, and rate limiters pure (no `@Injectable()` or NestJS decorators in the core file). Export a thin `@Injectable() class ...Service extends ...` for NestJS DI.
- **Strict `import type`**: Always use `import type { ... }` when importing interfaces or type aliases from workspace packages to ensure full erase during stripping.

## 2. Workspace Dependency Isolation
- Before adding new dependencies to subpackage `package.json` files, check existing contract test assertions (e.g. `*.contract.spec.ts`) to avoid violating package-level boundary constraints.
