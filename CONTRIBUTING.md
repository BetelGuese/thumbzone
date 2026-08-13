# Contributing

Thanks for considering a contribution. This project has one job: prove that a
bottom-centre menu trigger is reachable, accessible and portable across every
major design system. Contributions are judged against that.

## Repository layout

```
core/               everything no design system gets to decide. Imports no
                    framework and no design system, anywhere.
  index.js          the maths, the tuned constants and the focusable
                    selector — touches no DOM, so it unit-tests without a
                    browser, which is what keeps it separate
  behaviour.js      the shared behaviour: lifecycle, focus trap, reorder,
  gestures.js       pointer state machine and scroll-aware tucking. These
  scroll.js         touch the DOM; a port drives them rather than porting them
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

### What you inherit, and what you write

Import `createThumbzoneBehaviour` from `core/behaviour.js` and it wires itself
over your markup. You do **not** write a focus trap, an Escape handler, the
`inert` sequence, the thumb-first reorder, drag-to-dismiss, swipe-to-open, the
scroll-aware tucking, or the teardown that restores the DOM the markup
authored. Reimplementing any of them is how a port drifts.

```js
import { createThumbzoneBehaviour } from '../../../core/behaviour.js'

const behaviour = createThumbzoneBehaviour({ trigger, sheet, scrim, menu, inertRoot })
// → { open, close, destroy }
```

The five elements are a precondition: validate them yourself, in your own
idiom, and fail with a message naming what was missing. `destroy()` is not
idempotent — it undoes init-time DOM mutations, and undoing one twice puts it
back — so if your port's handle can have two owners (a component's unmount and
the published test hook, say), latch it yourself.

What is yours to write: the markup, built from your system's own components;
the styling, tokens and motion; the framework binding, if your system has one;
the hydration strategy, including `__thumbzoneReady`; and anything your
system's own rendering leaves in the markup before the pattern reads it — the
Material UI port's hoist of Emotion's server-rendered `<style>` elements out of
the menu is the worked example.

### Expect to reach past your system's drawer component

Three ports built on a system that ships a drawer of its own have had to, for
the same structural reason each time, so a porter may as well know it before
starting rather than halfway through.

Material UI's temporary `Drawer` could not work: `Slide` writes the transform
imperatively and occupies the inline style the drag needs, and `Modal` sets
`aria-hidden` on its siblings — *including the trigger*, which has to stay
reachable, because tapping it is one of the close paths. The port uses
`variant="permanent"`, the only entry point to a drawer `Paper` with neither.

shadcn/ui's `Drawer` is Vaul, and the outcome was the same for a different
reason. The convergence deserves stating first, because it is the strongest
independent evidence this pattern has: Vaul arrives at the same 0.25 dismiss
ratio, the same `cubic-bezier(0.32, 0.72, 0, 1)` release curve, ships
handle-only dragging as a first-class prop, and carries an attribute
(`data-vaul-no-drag`) for the regions a drag must not begin in. Two
implementations reached those four decisions without consulting each other,
which says more for them than either could say alone. The divergence is a
single constant: Vaul flings at 0.4 where this contract's threshold is 0.5,
hard-coded with no way to configure it.

That constant is why this port drives `core/behaviour.js` rather than Vaul's
gesture engine — and it is worth being exact about what conformance would have
done about it, which is nothing. The suite asserts that a fast downward fling
dismisses the sheet; it does not assert the velocity at which one starts to,
and it has no way to ask whether a port's release went through the shared maths
at all rather than through a threshold of its own. The lower bound is pinned in
`core/test/logic.test.js`, against the maths, with no browser involved. Pinning
it at the port level was attempted and dropped: synthetic pointer input cannot
be paced finely enough to land inside a 0.4–0.5 window — a run targeting
0.3 px/ms measured between 0.19 and 0.28 px/ms across instances, a spread wider
than the window it needed to sit in. So a Vaul-based port would have passed
every assertion here while running a retuned feel, and `core/` is the only
thing standing in its way.

Bootstrap 5's `Offcanvas` is the third case, and it is the strongest of the
three, because it fails for a different kind of reason. Where MUI's `Drawer`
and Vaul each merely *hold* state — a transform, an ARIA attribute, a
hard-coded constant — Bootstrap's is the first primitive here that actively
*runs*. Opening one constructs a `Backdrop`, activates a `FocusTrap`, calls
`new ScrollBarHelper().hide()` to lock body scroll, sets `aria-modal`, and
binds `keydown.dismiss` for Escape: five responsibilities this pattern
already owns, carried out by code rather than merely represented in markup.

Its CSS conflicts just as hard, in three ways worth checking for in any
candidate primitive, not only this one. It is `visibility: hidden` while
closed, made visible only through `.showing`/`.hiding`/`.show` — exactly what
disqualified MUI's `Modal`, for the same reason: a hidden element makes
`inert` decorative, since the element was already unreachable, and leaves the
transition into view with nothing to animate from. It sizes itself in `vh` —
`30vh` for the panel, `100vh` for the backdrop — against a pattern that
forbids the unit outright, because iOS Safari's collapsing URL bar resolves
it to the expanded viewport height and pushes the sheet under the browser's
own chrome; Bootstrap has no `dvh` anywhere to fall back on. And
`.offcanvas-bottom` sizes that height as a fixed value rather than a
content-driven maximum, so it cannot be raised to fit a longer menu without
also giving up the very thing that makes it fixed.

Overriding all of that while keeping Bootstrap's own class names would be a
costume rather than a port, so the structure here is written by hand and
Bootstrap is left to supply only the vocabulary — colour, radius and border
width, each still read from a `--bs-*` token.

Three systems, three primitives, three different reasons, one outcome. The
lesson worth carrying to the next one: **check a candidate primitive's closed
state before its open one.** `visibility: hidden` while closed is what
disqualified both MUI's `Modal` and Bootstrap's `Offcanvas`, and it is
invisible if the only state you inspect is the primitive open — which,
absent this instruction, is usually the only state a porter thinks to look
at.

The pattern is not being awkward. A design system's drawer owns open/close,
focus management and motion; this pattern already owns those, and two owners of
one lifecycle is not a thing that can be made to work. Take the system's
surface, its tokens and its components, and let `core/behaviour.js` drive.
**Reaching past the drawer primitive is the expected shape of a port, not a
sign that one has failed.**

### A utility-first system can say almost all of this

The Tailwind CSS port is the first here written in utility classes rather than
components, so it is the first that could answer whether this contract is
expressible in utilities at all. Nearly. Three requirements were not, and each
needed something that is not a class. This is one framework at one major
version rather than a general result about utility-first systems — but all
three follow from how such a system works rather than from Tailwind's
vocabulary, so expect to meet them again.

- **The breakpoint is not your framework's.** The pattern hides itself above
  `DESKTOP_BREAKPOINT` in `core/index.js`, which is 768. Tailwind states its own
  `md` breakpoint in its theme as 48rem — a different unit, resolved against the
  root font size, and free to move on a major release. The two agree today; a
  port leaning on `md:` would drift silently the moment either constant changed.
  Declare the pattern's own instead — this port writes
  `@custom-variant desktop (@media (min-width: 768px));` in its stylesheet, so
  the utilities using it still read as utilities.
- **A length two elements have to agree on.** The trigger floats above the open
  sheet, and the sheet has to reserve the trigger's own footprint or the menu's
  last row ends up underneath it — one rule on each element, depending on the
  same two lengths. A utility class carries a *value*, not a reference, so it
  cannot say "the same length as that other element's". Nor can you assemble the
  class name from a shared constant: the scanner reads source text, so a name
  built by interpolation never appears in it and nothing is emitted at all.
  Two custom properties on `[data-tz-trigger], [data-tz-sheet]` — the trigger's
  size and its gap from the edge — read from both elements' arbitrary values,
  is the answer.
- **A value that lives in JavaScript.** `MIN_HIT_TARGET` is the handle's height,
  and for the same scanning reason it cannot be a class either. It is an inline
  style. `--tz-trigger-max-bottom-gap` belongs in this category too, not the one
  above it: only the trigger reads it. It restates `MAX_TRIGGER_BOTTOM_GAP` from
  `core/index.js` as a third custom property alongside the two shared ones,
  because a stylesheet cannot import a JavaScript constant any more than it can
  assemble a class name from one.

**The failure mode of an invalid utility is silence.** It emits nothing, the
page still renders, and it renders almost right — a dropped
`env(safe-area-inset-bottom)` or a `touch-action` that never compiled looks
like nothing until the one device that needed it. A port on a utility system
therefore owes itself a read of the built CSS rather than a look at the screen.
This port verified every requirement that lives or dies on a class actually
compiling — a breakpoint, a shared length, a `touch-action` value, a timing
curve — the same way: by locating, in the built CSS, the rule its class should
have produced, rather than trusting that it did. Anchor those reads on
something the build does not rewrite: the pipeline minifies to the shortest
equivalent, so `duration-200` arrives as `.2s` rather than `200ms` and the
`768px` media query as range syntax, and a check pinned to the literal you
authored reports a failure that is only the serialisation.

**Two of this port's rules win on emit order rather than specificity.**
`motion-reduce:` utilities are emitted after their unvariant counterparts at
equal specificity, so `motion-reduce:duration-[1ms]` beats `duration-200` and
`motion-reduce:translate-y-0` beats `translate-y-full` by position alone. A
framework upgrade that reordered them would break reduced motion without failing
to compile. The reduced-motion specs are parameterised per system, so it would
redden loudly rather than ship — which is the reason to know the ordering is
load-bearing, not the reason to leave it unread.

**Physical and logical is where the vocabulary is thinnest.** `inset-x-*`,
`rounded-ss-*`/`rounded-se-*` and `pbe-*` are logical. The sizing utilities have
no logical form at all, so `max-h-`, `min-h-` and `size-` stand in where the
reference stylesheet writes `max-block-size`, `min-block-size` and
`inline-size`/`block-size`.

**Two Tailwind entries in one repository cross-pollinate their utility sets.** A
second Tailwind-based port is the first thing that could discover this, and it
did. Each entry scans the whole repository for candidate class names and
compiles every candidate valid under *its own* theme, regardless of which file
wrote it: shadcn/ui's CSS bundle is 17333 bytes with this port absent and
19756 with it present — a delta of 2423 bytes, all of it rules shadcn has no
element for. The delta is the finding, not the endpoints: each port added to
this repository shifts both figures by its own contribution and leaves the
gap between them alone, so the absolute pair will move again the next port
that lands while the delta holds. What does not cross is anything needing a
declaration the other entry lacks — this port's custom `desktop` variant,
shadcn's `@theme` colour tokens. It is inert on two independent grounds: no
element on the other route carries those classes, and the `--tz-*` custom
properties are referenced there but never defined — six references, no
definition, because the definition stays in this port's own
stylesheet. It does not touch the isolation that matters: vanilla and Material
UI import no Tailwind stylesheet at all, so nothing crosses into them. If you
add a second entry for a framework already present, expect the neighbour's
bundle to gain rules, and check that what arrived is unmatchable rather than a
restyle.

**And a utility-first system compiles your comments.** Two comments in this port
abbreviated a class in the bracketed arbitrary-value shorthand — a `pbe-` and a
`bottom-`, each with an ellipsis standing in for the length. The scanner reads
candidate class names out of raw file text and has no concept of a comment, so
both compiled: two real rules whose declared value was the ellipsis itself,
shipped in the built bundle and crossed into shadcn's alongside the rest. Dead,
because nothing carries those classes, but junk in a production build produced
by prose. Both are gone — the comments name the declaration now instead of
abbreviating the class, and no ellipsis-bearing rule survives in any demo
bundle. This and the crossover are the same property seen twice: the scanner
reads text, not code, and does not care which file the text is in or whether a
human would call it a comment. It reads this file too — which is why the
paragraph you are reading names those two classes without their brackets. Write
a class name in a comment either in full or not in brackets at all.

That framing understated it. The hazard is not particular to a utility-first
port at all — **any scanner anywhere in the repository compiles any file in
it**, regardless of which system wrote the file or whether the system doing
the scanning is itself utility-first. The Bootstrap 5 port ships no scanner of
its own and touches no Tailwind class deliberately, and it still grew both
Tailwind bundles: shadcn's from 19639 to 19756 bytes, tailwind's from 18275 to
18392 — +117 either way. Three selectors cross: `.flex-nowrap`, a class its
markup genuinely carries; `.flex-wrap`, from a comment explaining why
Bootstrap's `.nav` needs overriding; and `.border`, from the bare English word
sitting in prose, nowhere near a bracket or a class attribute. All three are
dead where they land — nothing on either Tailwind route carries them — but no
amount of careful writing would have stopped the third one, because `border`
is not a mistake to correct; it is an ordinary English word that also happens
to be a utility name. This cannot be fully avoided. The mitigation is knowing
that a scanner's rules for a file outside its own system are inert, and
checking that they stay that way, rather than trying to write around every
word one might recognise.

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
  `Promise.resolve()` if nothing does — and only if nothing does: a hydrating
  port that reaches for it regardless is not caught by the suite in the act,
  since the promise resolves anyway, and the violation it hides resurfaces
  later as an intermittent flake rather than a clean failure. Publish it
  either way, and publish it no later than the document's own `load` event —
  the one `page.goto` resolves on — rather than from inside an async chunk,
  or the suite's wait for it can throw a "must expose" error against a port
  that was only ever late, not missing it.

### A CSS reset can leave your demo route too short to scroll

This symptom points squarely at the wrong place, so it is worth recognising by
shape. The scroll-aware tuck never engages: `data-tz-tucked` is never set, and
the scroll assertions fail against your system while passing against every
other one. It reads as broken tuck logic. It is usually a fixture that cannot
scroll far enough.

The suite scrolls a fixed distance and expects to land mid-document.
`e2e/scroll-and-order.spec.ts` documents the underlying rule in a comment on
the constant: a scroll that lands on the document's actual end trips the
tracker's "always visible at the end" behaviour, which untucks the trigger for
a reason that has nothing to do with the scroll under test. What the shadcn
port added is the name of the thing that causes it. Tailwind's preflight zeroes
the user-agent block margins on ordinary prose, so a demo route authoring the
same 40 paragraphs as the other two systems rendered 456px shorter — leaving
`maxScrollY` at 145 where vanilla's is 601, under the scroll the suite
performs. Every scroll landed at the end of the document, and the first
conformance run produced six failures that all looked like a broken tuck and
were none of them in the pattern.

Bootstrap 5 ships Reboot, a global reset too, which made the same hazard look
likely to recur. It was tested rather than assumed, and the forecast did not
hold: Bootstrap's fixture measures `maxScrollY` of 902 on an iPhone 14 Pro Max
and 803 on a Pixel 7, against vanilla's 700 and 601 on the same two devices —
taller than the reference, not shorter, and comfortably clear of the fixed
distance the suite scrolls. The reason is one line of difference between the
two resets: Reboot keeps `p { margin-bottom: 1rem }` where Tailwind's preflight
zeroes the same rule outright. The finding above is real, and it belongs to
Tailwind's reset specifically — "any CSS reset" was this document
over-generalising from one system to a category, and the honest correction is
to say so rather than carry a forecast the project's own evidence has since
contradicted.

It already came round again within this same branch, when the Tailwind CSS
port's own preflight hit its demo route the same way and took the same fix.

The third one is what a framework-based port needs, and it is worth understanding
before you write one. If your port renders its markup on the server and hydrates
it, two parties claim the same DOM: the pattern, wired during load so the sheet
works as soon as the document is loaded, and the framework, arriving later to
adopt what it rendered. The thumb-first reorder is what they collide over, in two
separate ways — and the hook answers only the second. **Implementing the hook
perfectly and skipping the first still fails.**

**The order your components render.** The reorder runs at init, so the served
menu is already thumb-first before your framework looks at it, while your
component still describes the authored order — every label held against the wrong
node. Reordering moves text between nodes without moving any element the
framework expects, so it surfaces as one kind of mismatch: text. Do not assume a
mismatch is a warning. React *throws* on an unannounced text mismatch, discards
the tree and renders a fresh one, which replaces the elements `__thumbzone`
holds. Two mitigations, and the first is the one that does the work:

- **Render the order the DOM already has.** Ask the DOM once, on the render that
  has to agree with the page, and trust the answer only when it is unambiguous —
  an exact reversal of the items that render was given. Anything else (an
  opted-out menu, a consumer's own order, a client-only render with no server
  markup to consult) renders the authored order, which is what the server
  rendered too. Capture the direction once rather than recomputing it, or a later
  re-render lets the framework write the order back — the wrong way round.
- **Annotate the moved text, on the node whose text moved.** The flag is consulted
  at the fiber the mismatch is found at and nowhere else, so annotating the menu
  several levels up does nothing. It covers only the residue the point above
  cannot — a served order that is neither authored nor an exact reversal. On its
  own it silences the report while leaving every label bound to the wrong node,
  so it is never a substitute for rendering the DOM's own order.

**When the reorder happens.** This is what the hook is for. Hydration walks the
menu's items as siblings and holds a pointer into that list across the tasks it
yields between. The reorder that runs at init is safe — the framework cannot have
started yet — but a reorder arriving mid-hydration leaves the framework short of
nodes, and it responds by discarding its tree and rendering a fresh one. No
annotation reaches that: a node which *moved* is not a text mismatch anything can
suppress. The page goes on working because the replacement wires itself over the
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

### A design system's own defaults can sit under the contract's floor

Two of Bootstrap's stock components do, and nothing here would have caught it
without measuring. `.nav-link` renders at 40px with its default padding; `.btn`
renders at 36px. Both are under the pattern's 48px minimum, silently — neither
the conformance suite nor axe attributes a rendered height to the system's own
defaults, so a component that happens to clear the floor and one that happens
to fall short of it look identical from the outside.

The menu's fix raises Bootstrap's own token rather than reaching for a
`min-height` override: `--bs-nav-link-padding-y: 1rem` in place of the
default, which is how a Bootstrap developer would close the gap without
inventing a new declaration. Measured after the change: 56px, comfortably
above the floor rather than sitting on it. Check a system's stock interactive
defaults against the 48px minimum before trusting that a real component
clears it — a design system's own choices are not guaranteed to agree with
this pattern's floor any more than a bespoke one is.

### The tall-menu fixture is not a formality

Every port is asked to ship an overflow fixture — a menu long enough to
exceed the sheet's own maximum height — and until this port, none of them had
found anything with it. Bootstrap did, on the first attempt.

Bootstrap's `.nav` sets `flex-wrap: wrap`, because it is built for horizontal
navbars that need to wrap onto a second line rather than run off the screen.
`.flex-column` only changes the axis; it does not reset the wrap it inherited.
A column flex container that is both height-bounded and allowed to wrap does
not overflow when its content exceeds its box — it lays the excess out in a
second column instead, so `scrollHeight` never grows past `clientHeight`
because nothing is ever asked to scroll. Measured against the sixteen-item
fixture, before the fix: `scrollHeight` equalled `clientHeight` — 508 against
508 on an iPhone 14 Pro Max, 592 against 592 on a Pixel 7 — a ratio of exactly
1.0 on both. Not marginal. Zero.

That is a real defect a real user would have seen: a long menu rendering as
two truncated columns rather than one scrollable list. The primary route's
five items can never reveal it, because five rows fit in a single column with
room to spare; the sixteen-item fixture reveals it on the first run, because
sixteen do not. That is the entire argument for requiring the fixture at
all — not that a short route might theoretically hide something, but that
this port's short route structurally could not have shown this one, no matter
how carefully it was reviewed.

The fix stayed inside Bootstrap's own vocabulary: `.flex-nowrap`, the system's
own answer to exactly this combination, added alongside `.flex-column` rather
than a raw `flex-wrap: nowrap` declaration dropped into the port's stylesheet.
Measured after: `scrollHeight` against `clientHeight` is 912 against 508 on an
iPhone 14 Pro Max — a 1.80× overflow ratio — and 912 against 592 on a Pixel 7,
a 1.54× ratio. Comfortably overflowing on both, as the fixture is meant to be.

One port finding this does not make it universal. It makes the fixture's
place in the contract something other than a formality for the next one.

## Design principles

- **SOLID** — each module has one reason to change; depend on narrow interfaces
  rather than concrete implementations.
- **DRY** — within an implementation, and across systems for the part that is
  not a system's to decide. `core/` holds that part: the tuned constants, the
  drag and velocity maths, the scroll-direction tracker and the
  focusable-element definition. Every port and the reference implementation
  import them from there, so no port can quietly retune them.
  `core/behaviour.js` and the two modules beside it hold the rest: the
  lifecycle, the focus trap, the pointer state machine and the reorder. They
  touch the DOM but import no framework, which is the line that keeps them
  shareable — `core/index.js` touches no DOM at all, which is what lets it be
  unit-tested without a browser. `systems/vanilla` stays normative: it is where
  a disagreement is settled, and it now delegates the same behaviour every port
  does rather than owning a second copy of it.
- **YAGNI** — build what is needed now, and extract only once there is evidence
  of what repeats. `core/` is where that judgement was made twice, and it is
  worth being honest about both. The maths and the constants came out while
  there was still one implementation, because they were separable without a
  second one to compare against: a number with no DOM and no framework in it —
  a dismiss ratio, a fling velocity, a hit target — either is the contract or
  is a port's own styling choice, and the specs had to import it from
  *somewhere* rather than restate it per assertion.

  The behaviour layer came out later, and the right way round. With two systems
  shipped, the same state machine existed twice under the same function names,
  and roughly 250 lines of order-dependent policy per port — the sequence
  `inert` comes off in, the focus trap's `-1` branch, committing a drag only
  after pointer capture succeeds, the order `destroy()` restores in. The
  conformance suite would catch most of a porter getting one wrong, which is
  exactly why the cost stayed invisible: it would have been paid eleven more
  times before anyone noticed. Extracting it then was the principle being
  satisfied, not broken.

  What is still per-system is what a system genuinely decides: its markup, its
  styling and motion tokens, its framework binding and hydration strategy, and
  how it validates what it is handed.
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
  `aria-controls`. Author that name yourself, in your own words and language.
  The pattern's own fallback name exists only for a *consumer's* unnamed
  markup — a port that relies on it is caught directly: the suite fails a
  trigger whose accessible name is exactly that fallback string, since axe and
  every other check here would otherwise wave it through as a name that
  happens to be in English.
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
