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

### Test hooks the demo route must expose

Three, on `window`. The doc comment on `System.route` in `systems/registry.ts` is
the normative version; this is the summary.

- `__thumbzone` — the live handle. `open()` and `destroy()` have no
  attribute-driven equivalent a test could reach from the DOM.
- `__initThumbzone` — the initialiser itself, so a test can tear an instance down,
  edit the markup it left behind, and re-create an instance over it. This is the
  only way to exercise init-time-only behaviour, the menu reorder included.
- `__thumbzoneReady` — a promise resolving once the instance is wired *and*
  anything that arrives after it has finished with the same markup.
  `Promise.resolve()` if nothing does; publish it either way.

The third one is what a framework-based port needs, and it is worth understanding
before you write one. If your port renders its markup on the server and hydrates
it, two parties claim the same DOM: the pattern, wired during load so the sheet
works as soon as the document is loaded, and the framework, arriving later to
adopt what it rendered. Hydration walks the menu's items as siblings and holds a
pointer into that list across the tasks it yields between. The reorder that runs
at init is safe — the framework cannot have started yet — but a reorder arriving
mid-hydration leaves the framework short of nodes, and it responds by discarding
its tree and rendering a fresh one. That replaces the elements `__thumbzone`
holds, and the page goes on working because the replacement wires itself over the
new nodes. A dead handle behind a live UI is not something an assertion about the
page can see, which is why the hook is part of the contract.

Resolve it from something that genuinely runs after the framework has committed —
an effect. Island markers tell you when hydration was *scheduled*; timers,
microtasks and animation frames all run between the framework's own tasks. None of
those is a barrier.

### Drag-to-dismiss and the handle

The reference implementation recognises a drag-to-dismiss gesture anywhere on
the panel *except* inside its scrollable menu. The handle is the panel's
dedicated, always-present drag target — and once the menu is tall enough to
fill the panel, the only place a touch can still start one.

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

Every port must reproduce this split: a non-scrolling drag target whose
`touch-action` blocks panning (but not pinch-zoom, per WCAG 1.4.4), and a
scrollable region with static, panning-permitting `touch-action` that never
changes with scroll position — changing it with scroll position is exactly
what reproduces the deadlock.

The handle is required markup, not an optimisation for tall menus. It is
listed under "What a port must provide" in `systems/registry.ts`, and the
conformance suite asserts it on every registered system whether or not that
system registers an overflowing fixture: its presence, its `aria-hidden`, its
position above the menu, and its hit target. (Its `touch-action` is checked
against the overflowing fixture, where the deadlock it exists to avoid is
observable.) A port whose menu is short today has no guarantee it stays
short: a consumer's own menu decides that, and the moment it overflows, a
panel with no handle has nowhere left for a touch-driven dismiss to begin.

## Design principles

- **SOLID** — each module has one reason to change; depend on narrow interfaces
  rather than concrete implementations.
- **DRY** — within an implementation. Across systems there is deliberately no
  shared core yet: `systems/vanilla` is normative, and a port reimplements the
  pattern in its own system's idiom, held to the conformance suite rather than
  to shared code. What the suite does share is the contract — the tuned
  constants and the focusable-element definition are imported from the vanilla
  implementation, so no port can quietly retune them.
- **YAGNI** — build what is needed now. No speculative abstraction, and the
  point above is the largest instance of it: a shared core gets extracted when
  several implementations have proved what actually repeats, not before.
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
