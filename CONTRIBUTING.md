# Contributing

Thanks for considering a contribution. This project has one job: prove that a
bottom-centre menu trigger is reachable, accessible and portable across every
major design system. Contributions are judged against that.

## Repository layout

```
systems/            one directory per design system
  vanilla/          the reference implementation — no dependencies
e2e/                Playwright specs, including the conformance suite
site/               the Astro showcase and the standalone demo routes
```

`systems/vanilla` is **normative**. Every other system is a port of it and must
behave identically where behaviour is observable. If you find the two
disagreeing, the vanilla implementation is right and the port is wrong.

## Adding a design system

1. Create `systems/<name>/`.
2. Add a standalone demo route under `site/src/pages/demo/<name>.astro`.
3. Register it in `systems/registry.ts`.
4. Run the conformance suite. It is parameterised over the registry, so your
   system is picked up automatically — no new test file needed.

A port is complete when the conformance suite passes against it on both device
projects and the accessibility gate reports zero violations. Use the target
system's own components and design tokens: the result should look native to
that system, not like a foreign widget dropped into it.

### Drag-to-dismiss and the handle

The reference implementation recognises a drag-to-dismiss gesture only on a
dedicated handle element inside the panel, never on the panel's own
scrollable content.

This is a deliberate split, not a stylistic choice. No browser engine
reliably lets one element grant native scrolling in only one direction while
reserving the other for a custom gesture: Chromium supports
`touch-action: pan-up`/`pan-down`, but WebKit does not, and silently treats
them as `auto` (fully permissive) rather than honouring or rejecting them. A
single element that both scrolls and owns a dismiss-drag therefore either
blocks the one native-scroll direction that would ever move it away from the
top — a permanent deadlock once its content is taller than the panel — or
grants native panning in both directions and loses the dismiss gesture to it.
Splitting the two apart — a small, static, non-scrolling handle that always
owns the drag, and a scrollable region with static `touch-action` that
always permits panning, regardless of scroll position — is the only
combination that keeps both working on every engine.

A port whose panel can contain a menu taller than the panel itself must
reproduce this split: a non-scrolling drag target whose `touch-action`
blocks panning (but not pinch-zoom, per WCAG 1.4.4), and a scrollable region
with static, panning-permitting `touch-action` that never changes with
scroll position — changing it with scroll position is exactly what
reproduces the deadlock. A panel with no scrollable menu, or one guaranteed
never to overflow, is not required to include a handle; omitting one is not
an error, and nothing will complain. It simply will not offer a
drag-to-dismiss gesture that survives real touch input, since there is no
non-scrolling region left to provide the entry point for it — a stated
trade-off for that case, not a bug to chase down.

## Design principles

- **SOLID** — each module has one reason to change; depend on narrow interfaces
  rather than concrete implementations.
- **DRY** — shared gesture and scroll logic lives in one place and is consumed
  by each system's implementation, never copied.
- **YAGNI** — build what is needed now. No speculative abstraction: a shared
  core gets extracted when several implementations prove what actually repeats,
  not before.
- **KISS** — the simplest thing that works, then refactor for clarity.
- **Composition over inheritance.**

## Code

- Small functions with one responsibility. Clear, accurate names that describe
  what something does rather than how it works.
- Validate inputs. Fail with specific, actionable messages that include the
  offending value. Never swallow an error.
- Assume external systems fail: handle async properly, and degrade gracefully
  where a feature is not critical.
- Comments explain **why**, not what. If the "what" is unclear, fix the code
  instead. Document any workaround and what would let it be removed.
- JSDoc on public APIs.
- Prefer an existing dependency over adding a new one. The vanilla
  implementation must stay dependency-free.

## Accessibility

Non-negotiable, because it is the point of the project:

- The trigger is a real `<button>` with an accessible name, `aria-expanded` and
  `aria-controls`.
- The panel is a `role="dialog"` with `aria-modal="true"` and an accessible name.
- Focus moves into the panel on open, is trapped while open, and returns to the
  trigger on close.
- A closed panel is unreachable by keyboard and absent from the accessibility
  tree — including before scripts run and with JavaScript disabled.
- Everything works by keyboard alone, and honours
  `prefers-reduced-motion: reduce`.

Do not rely on native tab order through links: WebKit omits un-tabindexed
anchors unless Full Keyboard Access is enabled. Manage focus explicitly.

## Tests

- Write tests as you implement, not afterwards.
- **Generate randomised values within the valid range rather than hardcoding
  fixtures.** Derive bounds from the exported constants so tests cannot drift
  out of step with the implementation.
- Cover edge cases and error paths, not just the happy path.
- Every assertion must be able to fail. Before trusting a new test, break the
  code it covers and confirm it goes red. Assertions that hold for every
  possible input are worse than no test, because they read as coverage.
- Test observable behaviour rather than implementation details where you can.

```bash
npm test          # unit
npm run test:e2e  # Playwright, both device projects
```

## Commits

- [Conventional Commits](https://www.conventionalcommits.org): `type: subject`,
  e.g. `feat:`, `fix:`, `chore:`, `test:`, `docs:`.
- Imperative subject under 72 characters. Explain *why* in the body when the
  change is not self-evident.
- One logical change per commit. Keep build and tooling fixes out of feature
  commits so either can be reverted alone.
