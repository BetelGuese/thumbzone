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
 * nothing nested inside the sheet, the menu or the first item's anchor. So
 * this is the first port to pass no pre-init hook at all, and
 * `systems/mantine/test/served-markup.test.js` is what keeps that true. The
 * port's own rules are not injected at the point of use either: they are a
 * stylesheet, `systems/mantine/src/thumbzone.css`, which the routes import.
 *
 * Mantine's own `Drawer` is deliberately absent, and it is the first drawer
 * primitive here that offered to stay mounted while closed. It offered twice
 * and neither reaches the contract, which needs the sheet fully rendered while
 * closed — a page wires the pattern during load, the thumb-first reorder has
 * to happen before hydration, and the open transition needs something to
 * animate. Its `Transition` keeps a closed drawer in one of two states:
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
