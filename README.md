# thumbzone

**Your menu is in the wrong corner.**

On a 6.7" phone — the one this project's own suite runs against, 430 × 932 CSS
px — the navigation icon in the top app bar sits roughly **920px** from a thumb
resting on the bottom edge. That is 152mm on a display measuring 154mm from top
to bottom: the reach is as long as the phone is tall, so it needs a grip shift or
a second hand rather than a stretch. Yet every design system's default app bar
puts the primary navigation trigger exactly there.

The figure is derived rather than asserted — `CORNER_REACH_DISTANCE` in
`core/index.js` names both endpoints, and the unit suite recomputes the distance
from them rather than restating it.

thumbzone moves it to the bottom centre — the one point comfortably reachable by
either thumb, one-handed — and proves the pattern works in every major design
system without looking foreign in any of them.

**[See it running →](https://betelguese.github.io/thumbzone/)** — a live demo of
every shipped system, framed at phone width. Best opened on a phone, where the
argument is about reach and reach is something you feel.

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

**Five systems shipped**, all held to the same conformance suite.

| Design system | State |
| --- | --- |
| Vanilla (no dependencies) | shipped — normative reference |
| Material UI | shipped |
| shadcn/ui | shipped |
| Tailwind CSS | shipped |
| Bootstrap 5 | shipped |
| Chakra UI, Ant Design, Mantine, Radix/Ark, Bulma, Vuetify, Quasar, Ionic | planned |

Each is held to 134 conformance instances — 67 per mobile device profile, the
same groups across two of them, against materially different implementations.
Six of the 134 drive real touch through Chromium's debug protocol and report as
skipped on WebKit, so 128 have to pass and none may fail: 640 passes across the
five. A further 62 instances belong to no system — the registry guard, the scan
for `vh` where `dvh` is required, the contract predicates, the showcase checks —
and pass too. The whole run is 732 instances: 702 passed, 30 skipped, nothing
failed, no retries.

## What the first port changed

Material UI went first because it stresses the contract hardest, and it did. Four
things about the pattern are only known because a real design system disagreed
with it:

- **A drawer that animates itself cannot own this gesture.** MUI's temporary
  `Drawer` writes its transform imperatively, hides siblings — including the
  trigger, which must stay reachable to close the sheet — and resolves to
  `visibility: hidden` while closed, which would make `inert` decorative. The port
  uses the docked variant and owns the transform itself.
- **Hydration is a contract concern, not an implementation detail.** A framework
  that hydrates after the page's `load` event cannot have wired the pattern in
  time, so the contract now requires a readiness signal any port must publish.
- **Reordering the menu before hydration makes React discard the tree**, taking
  the live handle with it. Two mitigations are documented for any hydrating port.
- **A framework's server-rendered styles can land inside the markup the pattern
  owns.** Emotion put `<style>` elements between menu items, so "the menu's
  children are its items" is an assumption a port has to defend.

The port also found a defect in the reference it was being measured against — the
sheet reserved no clearance for the floating trigger, so the last menu row sat
under it on short viewports. Both are fixed, and the check now runs against every
system.

## What the second port confirmed

shadcn/ui is components copied into a repository rather than a package installed
into it, so the port had more latitude over the markup than the Material UI one
did. It found two things anyway.

- **A gesture library built independently agrees with the pattern.** shadcn's
  `Drawer` is Vaul, and Vaul arrives at the same 0.25 dismiss ratio, the same
  `cubic-bezier(0.32, 0.72, 0, 1)` release curve, handle-only dragging as a
  first-class prop, and an attribute for the regions a drag must not begin in.
  That is the strongest outside evidence the pattern has. It differs in one
  hard-coded constant — it flings at 0.4 where this contract's threshold is
  0.5 — and conformance could not have caught the difference, because it asserts
  that a fling dismisses rather than the speed at which one starts to. So the
  port drives the shared maths instead of Vaul's gesture engine, and the
  convergence stands as corroboration rather than as a dependency.
- **A CSS reset can leave a demo route too short to test.** Tailwind's preflight
  removes the browser's default paragraph margins, so identical fixture content
  rendered 456px shorter than the other systems' — short enough that every
  scroll the suite performs landed on the end of the document, which is exactly
  where the trigger is deliberately untucked. Six failures that read as broken
  tuck logic were a fixture with nothing left to scroll. The Tailwind CSS port
  met the same preflight and restored the spacing in its demo route before its
  first conformance run. Bootstrap 5 ships Reboot, a different reset, and its
  fixture did not repeat the hazard: `maxScrollY` measured 902 against
  vanilla's 700, taller rather than shorter.

Material UI and shadcn/ui both had to reach past their design system's own
drawer, for the same structural reason: a drawer owns open/close, focus and
motion, and so does this pattern. Two owners of one lifecycle cannot be made to
work, so that is now written down as the expected shape of a port rather than a
surprise each porter meets alone.

## What the third port established

Tailwind CSS is the first port written in utility classes rather than
components, which made it the first that could test whether this contract's
CSS is expressible in utilities at all. Almost all of it is — three
requirements need something else, and each follows from how a utility-first
system works rather than from Tailwind's own vocabulary.

- **The breakpoint is not the framework's.** Core's own breakpoint is 768px;
  Tailwind states its own `md` breakpoint in its theme as 48rem — a different
  unit, resolved against the root font size, and free to move on a major
  release. The two agree today, but a port leaning on that variant would drift
  silently the moment either constant changed. The port declares its own
  `@custom-variant desktop (@media (min-width: 768px));` instead, so the
  breakpoint stays the contract's rather than the framework's.
- **A length two elements must agree on.** The trigger floats above the open
  sheet, and the sheet has to reserve the trigger's own footprint or the
  menu's last row ends up underneath it. A utility class carries a *value*,
  not a reference to another element's, and a class name assembled from a
  shared constant is never scanned at all — custom properties, read by both
  elements, are the answer.
- **A value that lives in JavaScript.** `MIN_HIT_TARGET` sizes the handle, and
  for the same scanning reason it cannot be a class either — it is an inline
  style.

A utility-first system also compiles your comments. Two comments in this port
named classes in bracket shorthand, and the scanner — which reads raw file
text and has no concept of a comment — turned them into real rules with
meaningless values. Both are gone; no such rule survives in any bundle.

Two Tailwind entries in one repository cross-pollinate. Each scans the whole
repository and compiles every candidate valid under its own theme, so this
port's stock utilities appear in shadcn/ui's bundle and shadcn's appear in
this one — measured, shadcn's bundle is 17333 bytes with this port absent and
19756 with it present. The gap between them, 2423 bytes, was unchanged by the
Bootstrap port, which moved both figures equally — one data point, not a
guarantee. It is inert: nothing on the other route carries those classes. It
does not touch the isolation that matters — vanilla and Material UI import no
Tailwind stylesheet at all.

## What the fourth port settled

Bootstrap 5 is the fourth port, and the first to ship a drawer of its own that
actively runs rather than merely holding state — its `Offcanvas` constructs a
backdrop, activates a focus trap, locks body scroll and binds Escape, all
responsibilities this pattern already owns. It settles a question three ports
have now answered the same way.

- **A design system's drawer cannot own this gesture, for a third and
  different reason.** Material UI's problem was an imperative transform and a
  sibling `aria-hidden`; shadcn's was a hard-coded fling threshold inside an
  otherwise-faithful gesture library; Bootstrap's is a primitive that runs its
  own lifecycle in code. Three systems, three different reasons, one
  outcome — reaching past the drawer is confirmed as the normal shape of a
  port, not a coincidence of the first two.
- **Check a primitive's closed state before its open one.** Bootstrap's
  `Offcanvas` is `visibility: hidden` while closed — the same defect that
  disqualified Material UI's `Modal` — and it is invisible unless that is the
  first thing checked rather than the last.
- **A design system's own defaults can sit under the contract's floor.**
  Bootstrap's `.nav-link` renders at 40px and its `.btn` at 36px, both under
  the 48px minimum, and neither the conformance suite nor axe would say why.
  Raising Bootstrap's own token, `--bs-nav-link-padding-y`, closes the gap
  without an override: 56px, measured.

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
- The trigger carries an accessible name the **port** authored, not the fallback
  the pattern supplies — otherwise a non-English port silently ships English, and
  neither the suite nor axe would notice.
- The open sheet reserves clearance for the floating trigger, so the last menu row
  is never underneath it.

The suite refuses to be quietly narrowed. Where a check depends on a fixture a port
has not supplied, it is registered and **skipped by name** rather than omitted, so
missing coverage shows up in the report instead of vanishing.

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

## Prior art, and where this disagrees with it

Three objections are worth meeting before they are raised. Each rests on real
evidence, and none of them is answered by leaving it out.

**Hidden navigation is worse than visible navigation. That is not what this
argues.** Nielsen Norman Group's [quantitative study of hidden
navigation](https://www.nngroup.com/articles/hamburger-menus/) — 179
participants, six live sites, phones and desktops — found it measurably worse on
every metric collected: content discoverability fell by more than 20%,
self-reported task difficulty rose 21% against visible navigation and 11% against
a combination of the two, and mobile task times ran 15% longer than the
combination's. If you can show your navigation, show it.

That study varies *whether* navigation is concealed. It never varies where the
trigger sits. It measures discoverability; this pattern addresses reach, and the
two are independent. The claim here is conditional and stays inside those bounds:
if you are shipping a hamburger — and most of the mobile web is, for room it does
not have — its trigger belongs where a thumb already rests.

Note also what that study recommends for phones, which is the combination rather
than concealing nothing: on mobile that was the only comparison available to it,
since a wholly exposed condition was not tested there. A combination is
compatible with this pattern rather than opposed to it. A bottom-centre trigger
with two or three destinations beside it *is* that recommendation, moved into
reach.

**Apple and Google already put controls within thumb reach. The trigger is the
part nobody moved.** Both place primary actions and tab bars near the bottom
edge, and neither is news. What has not moved is the navigation trigger: all five
design systems ported here still put it in a top corner by default, which is why
each needed the work in this repository rather than a configuration flag. The
claim is not that the bottom edge is reachable. It is that the pattern survives
being moved there across five materially different systems under one suite, and
that is a claim you can run rather than read.

**iOS Safari owns the bottom of the screen, and this is the hardest constraint
the pattern faces.** Safari's URL bar sits at the bottom by default and changes
height as the page scrolls. Two separate problems follow, and only one of them is
solvable in CSS.

- `vh` resolves against the expanded viewport, so a sheet sized in it is pushed
  under the browser's own chrome. Every port here sizes in `dvh`, and the suite
  fails the build if a `vh` length reaches an element this pattern owns — in the
  source and in the built output both, because Astro inlines stylesheets under a
  size threshold, and a scan of the source alone reported clean while a planted
  `85vh` shipped.
- `env(safe-area-inset-bottom)` describes the home indicator, not browser chrome,
  and no `env()` value exposes the toolbar. The trigger's offset and the sheet's
  reserved clearance both add that inset, and the trigger's gap is clamped to
  `MAX_TRIGGER_BOTTOM_GAP` — but that arithmetic is against the home indicator.
  It is not against Safari's bar.

What remains is whether a tap near the bottom edge reaches the trigger or merely
expands Safari's chrome. No check in this repository can answer that: every one
of them drives synthetic input, and this is a question about what the browser
does with a real finger. **It has not yet been measured on hardware, and this
section will name the result rather than an expectation once it has been.**

<!-- Replace the paragraph above with the measured result after the device pass:
     which iOS version, whether the bar was at the top or the bottom, and what
     the first tap near the bottom edge actually did. State a negative result if
     that is what comes back — the section is worth less if it can only report
     good news. -->

## Running it

```bash
npm install
npm run dev            # http://localhost:4321
```

`/` is the showcase: the argument, the contract's own figures, and a live demo
framed at a phone's width with a switcher for the five systems — narrow the
window below 768px and the frame gives way to direct links to the routes below.

Demo routes: `/demo/vanilla`, `/demo/mui`, `/demo/shadcn`, `/demo/tailwind` and
`/demo/bootstrap`, each with an `-overflow` variant carrying a menu taller than
the sheet, for testing internal scrolling against the drag gesture. The same
routes are served from
[the deployed site](https://betelguese.github.io/thumbzone/) if you only want to
look.

```bash
npm test               # unit
npm run test:e2e       # conformance suite, both device profiles
npm run typecheck
```

## Adding a design system

See [CONTRIBUTING.md](CONTRIBUTING.md). In short: build it with the target
system's own components and tokens so it looks native there, add a demo route,
add one entry to `systems/registry.ts`, and run the suite. Expect to reach past
the system's own sheet or drawer primitive rather than build on it — three
design systems shipping a drawer of their own have each forced their port to
reach past it, for three different reasons, and CONTRIBUTING.md explains why
that is the normal outcome.

The behaviour comes from `core/`, and a port drives it rather than rewriting it:
the open/close lifecycle, the focus trap, the pointer state machine, the
thumb-first reorder and the teardown, on top of the gesture maths and the tuned
thresholds. What a port writes is the part that is genuinely its own: the markup,
the styling, and — if the system hydrates — the strategy for wiring the pattern
before the page finishes loading. That split is why the gesture *feel* is
identical across systems without anyone copying the arithmetic, and why no port
has to get a focus trap right on its own.

## Licence

MIT
