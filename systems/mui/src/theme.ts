import { createTheme } from '@mui/material/styles'

/**
 * The theme this port renders under, and the motion tokens the sheet's travel
 * is declared with.
 *
 * `reducedMotion: 'system'` is MUI 9's own switch for honouring
 * `prefers-reduced-motion`: with it set, MUI's transition components collapse
 * their own animations under the preference instead of leaving every consumer
 * to remember. The sheet's travel is declared in CSS rather than run through
 * one of those components (see ThumbzoneMenu), so it carries its own
 * reduced-motion rule too — this setting is what keeps everything else in the
 * port (a ripple, a focus ripple) consistent with it.
 */
export const thumbzoneTheme = createTheme({ motion: { reducedMotion: 'system' } })

/**
 * The sheet's transition, as a pair of tokens off MUI's own motion scale
 * rather than a duration tuned by hand.
 *
 * `enteringScreen` (225ms) is Material's recommendation for a surface arriving
 * on screen, and is what MUI's `Drawer` already passes to its own enter
 * transition — so this sheet moves at the speed every other MUI surface does.
 * The pattern's bounds are 120–400ms (`e2e/support/motion.ts`): under the floor
 * the sheet reads as already-arrived and stops saying it came up from the
 * trigger the thumb just touched, over the ceiling the user is waiting on a
 * menu. Nothing here retunes MUI's scale to land inside them — every duration
 * on it already does, so picking the semantically right token is the whole
 * exercise, which is the point of the bound being a range.
 *
 * `easeOut` is the curve Material pairs with an entering surface, and its
 * deceleration is what gives the sheet weight; a linear ramp would fail the
 * pattern's non-linearity requirement as well as looking mechanical.
 */
export const SHEET_MOTION = {
  duration: thumbzoneTheme.transitions.duration.enteringScreen,
  easing: thumbzoneTheme.transitions.easing.easeOut,
} as const

/**
 * How MUI itself cancels a component-owned transition under
 * `prefers-reduced-motion` — this is the reset `theme.motion.reducedMotion`
 * applies to MUI's own components, reused verbatim so the port's surfaces
 * collapse exactly the way every MUI surface around them does, rather than
 * through a near-zero duration of the port's own invention.
 */
export const REDUCED_MOTION_RESET = { transition: 'none' } as const

/**
 * MUI's own fixed footprint for the default "circular" `Fab` (`@mui/material`'s
 * `Fab.js`; not published as a theme token, so it is pinned here from the
 * library's own source rather than eyeballed off a screenshot).
 *
 * The trigger is a `Fab` that floats *above* the open sheet by design —
 * tapping it is a close path, so it has to stay hit-testable over the sheet
 * rather than sliding beneath it (see the trigger's own `zIndex` in
 * `ThumbzoneMenu`). That only reads as "floating above" rather than
 * "covering" if the sheet's own last row never ends up underneath it, which
 * is what this is for: reserving that much clearance at the sheet's bottom
 * edge, rather than a bare pixel count with no traceable origin.
 */
export const FAB_SIZE_PX = 56

/**
 * How much of the viewport the open sheet may occupy.
 *
 * A sheet that filled the screen would be a page: leaving a strip of scrim
 * above it is what keeps "tap outside to dismiss" discoverable and what says
 * the page is still there behind it. `dvh`, never `vh` — iOS Safari resolves
 * `vh` against the expanded viewport, so the sheet's top edge would end up
 * under the collapsing URL bar.
 */
export const SHEET_MAX_BLOCK_SIZE = '85dvh'
