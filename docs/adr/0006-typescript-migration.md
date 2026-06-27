# ADR 0006: Gradual TypeScript migration

## Status
Accepted

## Context

Senior-dev review of the architecture refactor named TypeScript "the
single biggest architectural improvement still missing" — typed models,
typed Supabase responses, typed status enums, typed API contracts,
autocomplete. The codebase was 100% JavaScript at the time (82 source
files across 11 features + `shared/` + the app shell), with zero
type-checking anywhere in the stack.

## Decision

Migrate the entire codebase to TypeScript, gradually, file-by-file,
mirroring the exact feature order the architecture refactor itself used
(`shared/` first since everything depends on it, then `auth`, then each
feature in dependency order, then the app shell last) — not a big-bang
rewrite. Two things confirmed with the user before starting:

- **`strict: true` from day one**, not loosened-then-tightened later.
  `allowJs: true` in `tsconfig.json` meant this only ever affected files
  that had actually been converted — every still-`.js` file was
  unaffected and unchecked in the meantime, so there was no risk to
  enabling strict mode immediately rather than retrofitting it onto 80
  files at once at the end.
- **Real generated Supabase types over hand-written ones**, in principle
  — the user ran `supabase login`/`link`/`gen:types` themselves in
  parallel with this work (see `src/shared/types/README.md`), since I
  have no path to generate them myself without either their login
  session or a DB connection string, neither of which should pass
  through me. In practice the generated file wasn't ready before the
  migration needed feature `api.ts` files typed, so every feature's
  row/input interfaces are hand-written for now (see "Types" in
  `docs/architecture.md`) — explicitly a stand-in, not the end state.

Per-file conversion pattern, repeated 13 times (once per feature plus
`shared/` and the app shell): rename `.js`→`.ts` / `.jsx`→`.tsx`, add real
types (function signatures, component props, hook return shapes), fix
whatever `tsc --noEmit` flags, run that feature's tests, commit. Each
commit left the app fully working, tested, and buildable — never a
"half-migrated, currently broken" state.

## Consequences

- Two real, repeatable patterns emerged that aren't obvious going in:
  1. **TS doesn't propagate flow-narrowing into nested closures.** A
     `if (!booking) return` early return does not make `booking` non-null
     inside a `function handleX() { ... }` declared earlier in the same
     component — caught in `BookingDetailPage.tsx`, fixed by rebinding to
     a fresh `const booking = rawBooking` after the null check, which has
     a fixed non-null type at every closure that captures it.
  2. **Supabase's real `.from()`/`.rpc()` types don't expose mock
     methods.** Every `api.test.ts` mocking the client needed
     `vi.mocked(supabase.from)` / `vi.mocked(supabase.rpc)` rather than
     calling `.mockReturnValue()` directly on the import, plus a
     test-files-only eslint override disabling
     `@typescript-eslint/no-explicit-any` for the deliberately loose fake
     chain objects.
- `tsconfig.json` no longer has `allowJs`/`checkJs` — removed once the
  last `.js`/`.jsx` file was converted, confirmed via `find src -name
  "*.js" -o -name "*.jsx"` returning nothing.
- `vite.config.js`, `eslint.config.js`, `postcss.config.js` stay `.js` —
  explicitly out of scope (build tooling, not application code); `vite.config.js`
  is consequently no longer part of `tsconfig.json`'s `include`.
- `npm run typecheck` (`tsc --noEmit`) is wired into CI alongside lint and
  test — the "type checking" gate the original senior-dev review asked
  for, now actually enforced rather than aspirational.

## Alternatives considered

- **Big-bang conversion** (all 82 files in one pass). Rejected for the
  same reason the architecture refactor itself wasn't big-bang: an
  enormous, unreviewable diff with no safe rollback point partway
  through, on a live app with real production data.
- **Loose mode now, `strict: true` later.** Rejected — see Decision
  above; `allowJs` already made strict mode zero-risk from the start, so
  deferring it would only have deferred the (real, necessary) work
  without buying anything.
- **Hand-author the `Database` type now instead of waiting for
  generation.** Considered, since `docs/database.md` is already fully
  verified against the live schema. Didn't, because the entire point of
  using generated types is staying in sync with whatever's actually
  live — including any future change made via the Supabase dashboard
  rather than a checked-in `.sql` file — and a hand-written stand-in
  would misrepresent that provenance to whoever reads it next.
