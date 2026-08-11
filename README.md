# thumbzone

**Your menu is in the wrong corner.**

On a 6.7" phone, the top-left corner sits roughly 640px from a thumb resting at
the bottom of the screen. Reaching it needs a grip shift or a second hand. Yet
every design system's default app bar puts the primary navigation trigger exactly
there.

thumbzone moves it to the bottom centre — the one point comfortably reachable by
either thumb, one-handed — and proves the pattern works in every major design
system without looking foreign in any of them.

```
        top-left trigger              thumb-zone trigger
    ┌──────────────────┐          ┌──────────────────┐
    │ ☰                │          │                  │
    │                  │          │                  │
    │                  │          │                  │
    │                  │          │                  │
    │              ╭───┤          │       ╭──────╮   │
    │           ╭──╯   │          │    ╭──╯      ╰─╮ │
    │        ╭──╯ ✋    │          │  ╭─╯    ✋      ╰│
    │        │         │          │  │              │
    └────────┴─────────┘          └───────(☰)───────┘
      out of reach                  reachable either-handed
```

## Status

**Foundation complete.** One reference implementation and the conformance suite
that every future port must pass.

| Design system | State |
| --- | --- |
| Vanilla (no dependencies) | shipped — normative reference |
| Tailwind CSS, Bootstrap 5, Material UI, shadcn/ui | planned |
| Chakra UI, Ant Design, Mantine, Radix/Ark, Bulma, Vuetify, Quasar, Ionic | planned |

There is no showcase site yet. The demo routes below run locally.

## The pattern

A trigger fixed at the bottom centre opens a sheet that rises from the bottom
edge. Menu items are ordered **most-used nearest the thumb** — the reverse of the
desktop convention. The trigger tucks away while you scroll down and returns when
you scroll up. A drag handle inside the sheet dismisses it; the trigger itself can
be swiped upward to open.

Above 768px the whole thing steps aside and the host system's conventional
navigation takes over. This is a mobile pattern, not a replacement for one.

## What is enforced, not just claimed

Behaviour is defined by an executable conformance suite rather than prose. It is
parameterised over `systems/registry.ts`: adding a design system is a one-line
change, and the suite then runs against it automatically — there is no way to
register a system and not be tested, and no route literal anywhere in the suite.

Every port must satisfy, on both a WebKit and a Chromium mobile profile:

- The trigger sits within a bounded distance of the bottom edge, at a minimum
  48×48px target, and disappears above the breakpoint.
- The open sheet is anchored to the bottom edge of the viewport.
- A real dialog: `role="dialog"`, `aria-modal`, an accessible name, and
  `aria-controls` resolving to it.
- Focus moves in on open, is trapped while open, and returns to the trigger on
  close. Cycling is managed explicitly, because WebKit omits un-tabindexed
  anchors from native tab order unless Full Keyboard Access is on.
- A closed panel is unreachable by keyboard and absent from the accessibility
  tree — **including before scripts run and with JavaScript disabled.**
- Drag dismisses past 25% of sheet height or on a downward fling; velocity is
  windowed over time, so behaviour does not change with device refresh rate.
- `touch-action` blocks panning where the gesture lives while preserving
  pinch-zoom, and never changes with scroll position.
- Motion honours `prefers-reduced-motion` on release; a 1:1 finger-follow drag is
  deliberately exempt, because freezing direct manipulation reads as broken.
- Zero axe violations across WCAG 2.0/2.1/2.2 A and AA, with the sheet both
  closed and open.

## Why drag-to-dismiss needs a handle

No browser engine reliably lets one element grant native scrolling in only one
direction while reserving the other for a custom gesture. Chromium supports
`touch-action: pan-up`/`pan-down`; WebKit silently treats them as `auto`; and
Pointer Events 3 removed the directional values from the specification entirely.

A single element that both scrolls and owns a dismiss-drag therefore either blocks
the one scroll direction that could move it away from the top — a permanent
deadlock once its content overflows — or permits panning in both directions and
loses the gesture. Splitting them apart is the only arrangement that works
everywhere.

## Running it

```bash
npm install
npm run dev            # http://localhost:4321
```

Demo routes: `/demo/vanilla` and `/demo/vanilla-overflow` (a tall menu, for
testing internal scrolling against the drag gesture).

```bash
npm test               # unit
npm run test:e2e       # conformance suite, both device profiles
npm run typecheck
```

## Adding a design system

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: build it with the target
system's own components and tokens so it looks native there, add a demo route,
add one entry to `systems/registry.ts`, and run the suite. Use the target
system's own sheet or drawer primitive — most already have one.

## Licence

MIT
