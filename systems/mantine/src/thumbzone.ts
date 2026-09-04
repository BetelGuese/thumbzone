/**
 * The Mantine port's adapter onto the shared behaviour.
 *
 * The lifecycle, focus trap, pointer machine, thumb-first reorder and teardown
 * are `core/behaviour.js`'s, and the wiring — including the ownership registry
 * that lets a late mount adopt a running instance — is
 * `shared/react/adapter.ts`. The one thing that varies between React ports is
 * whether the styling system leaves nodes of its own inside the pattern's
 * markup, and Mantine leaves none: it styles with CSS modules compiled at
 * build time, not with a runtime that inserts a `<style>` at the point of use.
 * Measured on a server render of this port's own shape — `Overlay`, `Paper`,
 * `List`, `NavLink`, `ActionIcon` — which emits two style elements, both
 * `MantineProvider`'s own and both ahead of every element the pattern owns:
 * nothing nested inside the sheet, the menu or the first item's anchor. So this
 * port passes no pre-init hook at all, and
 * `systems/mantine/test/served-markup.test.js` is what keeps that true.
 *
 * It is the second React port to pass none, not the first — an earlier draft of
 * this comment claimed the latter and was wrong. `systems/shadcn/src/
 * thumbzone.ts:25` has called `createReactThumbzoneAdapter()` with no argument
 * since commit `5bb54a4`, and its own comment gives its reason: Tailwind emits
 * a static stylesheet, so nothing of the styling system lands between the menu
 * and its items either. Same outcome, two different styling architectures —
 * shadcn/ui because its utilities compile to a file ahead of time, Mantine
 * because it has no styling runtime to insert anything at the point of use.
 * `mui` and `chakra` are the two that do pass `{ beforeInit:
 * hoistServerRenderedStyles }`, both being Emotion-based.
 *
 * The port's own rules are not injected at the point of use either: they are a
 * stylesheet, `systems/mantine/src/thumbzone.css`, which the routes import.
 *
 * Mantine's own `Drawer` is deliberately absent, and what is distinctive about
 * it is that it offers *two* ways to stay mounted while closed and they fail
 * for two different reasons. Neither reaches the contract, which needs the
 * sheet fully rendered while closed — a page wires the pattern during load, the
 * thumb-first reorder has to happen before hydration, and the open transition
 * needs something to animate.
 *
 * (Not the first drawer here to offer keeping a closed sheet mounted, and an
 * earlier draft of this comment said so wrongly. Material UI's `Modal` takes a
 * first-class `keepMounted` prop, defaulted to false, which `Drawer` forwards
 * through `ModalProps` — and `systems/mui/src/ThumbzoneMenu.tsx` records why
 * that offer was still declined: a kept-mounted closed `Modal` is present in
 * the DOM but resolves to `visibility: hidden`, which removes the sheet from
 * the tab order and the accessibility tree before `inert` can be what does
 * that. Present-but-hidden is a different failure from the two below, which is
 * the comparison worth drawing rather than a claim about which came first.)
 *
 * Every claim below about what a `Drawer` renders was measured with
 * `withinPortal` turned off: at its default, `true`, the `Drawer`
 * server-renders nothing in *any* mode, open included, because a portal has no
 * server-side destination — so disabling it is what makes the closed state a
 * question at all, and a reader reproducing these renders at the default would
 * find every mode empty and conclude the readings were wrong. `README.md`
 * carries the same caveat beside the byte counts themselves.
 *
 * Mantine's `Transition` keeps a closed drawer in one of two states:
 * React's `<Activity mode="hidden">`, which server-renders nothing (a closed
 * render is byte-identical to `keepMounted: false`) and on the client writes
 * `display: none !important` inline on the drawer's own inner element, a node
 * this port does not author and author CSS cannot outrank; or
 * `keepMountedMode: 'display-none'`, which renders the sheet with `display:
 * none` on it, the declaration the contract forbids by name. The `Drawer` also
 * locks body scroll through `react-remove-scroll`, which this pattern
 * deliberately does not do — the page stays scrollable behind the scrim and
 * the scrim's own `touch-action` is what stops a pan reaching it.
 */

import { createReactThumbzoneAdapter } from '../../../shared/react/adapter'

export type { ThumbzoneRefs, ThumbzoneHandle } from '../../../shared/react/adapter'

/** This port's adapter. Exported for `useThumbzone` to bind the React hook to. */
export const adapter = createReactThumbzoneAdapter()

export const { initThumbzone, liveThumbzone, hasThumbzoneOwner } = adapter
