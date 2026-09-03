/**
 * The Material UI port's adapter onto the shared behaviour.
 *
 * The lifecycle, the focus trap, the pointer machine, the thumb-first reorder
 * and the teardown are `core/behaviour.js`'s, and the wiring between this
 * port's markup and that behaviour — including the ownership registry that lets
 * a late mount adopt an instance already running — is
 * `shared/react/adapter.ts`. Emotion's server-rendered `<style>` elements have
 * to be moved out of the pattern's markup before anything reads it, and that
 * hoist is no longer this port's own: Chakra UI needs the identical one, so it
 * lives in `shared/react/hoist-emotion.ts` and this file only asks for it. What
 * is left here is the choice to ask.
 *
 * It imports no framework, deliberately — see `useThumbzone` for the React
 * binding that mounts it.
 *
 * Material UI supplies none of the pattern's services here, and that is a
 * consequence of the markup rather than a gap in the library. The services a
 * porter reaches for — a focus trap, Escape-to-close, a backdrop, return-focus
 * — all belong to `Modal`, not to `Drawer`, and the contract rules the
 * `Modal`-backed temporary variant out (see `ThumbzoneMenu` for why). What is
 * left is a `Paper` rendered in place. MUI still owns everything it can: the
 * components, the theme, the motion tokens, and the `Fab` that is a real
 * `<button>` for the trigger to be.
 */

import { createReactThumbzoneAdapter } from '../../../shared/react/adapter'
import { hoistServerRenderedStyles } from '../../../shared/react/hoist-emotion'

export type { ThumbzoneRefs, ThumbzoneHandle } from '../../../shared/react/adapter'

/** This port's adapter. Exported for `useThumbzone` to bind the React hook to. */
export const adapter = createReactThumbzoneAdapter({ beforeInit: hoistServerRenderedStyles })

export const { initThumbzone, liveThumbzone, hasThumbzoneOwner } = adapter
