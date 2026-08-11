import { createTheme } from '@mui/material/styles'
import type { Theme, ThemeOptions } from '@mui/material/styles'

/**
 * What this port asks of the theme it renders under — and the whole of it.
 *
 * `reducedMotion: 'system'` is MUI 9's own switch for honouring
 * `prefers-reduced-motion`: with it set, MUI's transition components collapse
 * their own animations under the preference instead of leaving every consumer
 * to remember. The sheet's travel is declared in CSS rather than run through
 * one of those components (see ThumbzoneMenu), so it carries its own
 * reduced-motion rule too — this setting is what keeps everything else in the
 * port (a ripple, a focus ripple) consistent with it.
 *
 * Imposed rather than merely defaulted, which is the one place this port
 * overrules the application around it: honouring the preference is a
 * requirement of the pattern, not a taste of the port's, so it also holds in an
 * application that turned MUI's own handling off. It applies to the port's own
 * subtree and says nothing about anything outside it.
 */
const THUMBZONE_THEME_OPTIONS: ThemeOptions = { motion: { reducedMotion: 'system' } }

/**
 * The theme the port renders under: the application's own, extended — never
 * replaced.
 *
 * Everything the port's styling reads comes from whichever theme is in effect:
 * the palette the trigger and sheet are coloured from, the typography the menu's
 * labels inherit, the spacing scale the trigger is placed on, the elevation, the
 * stacking layers and the motion durations. A theme of the port's own would make
 * this menu the one surface in a themed application that ignores the
 * application's tokens — a foreign widget dropped into it, which is precisely
 * what a port is judged on not being.
 *
 * Merged here and handed to `ThemeProvider` as a finished object, rather than as
 * the callback MUI also accepts for extending an outer theme. The callback is the
 * documented way to do this and is the wrong tool in a *component*: it is only
 * legal where an outer theme exists, and MUI logs an error when there is none —
 * which is the ordinary case for an application that has not adopted MUI's
 * theming at all, and for this project's own demo route. Resolving the outer
 * theme with `useTheme()` instead removes the distinction: it answers with the
 * application's theme where there is one and with MUI's defaults where there is
 * not, so this receives a complete theme either way and the no-theme case needs
 * no fallback rather than needing one at every call site.
 *
 * @param outerTheme The theme in effect above the port; MUI's defaults if none is.
 * @returns That theme with the port's own requirement merged over it.
 */
export function extendThemeForThumbzone(outerTheme: Theme): Theme {
  return createTheme(outerTheme, THUMBZONE_THEME_OPTIONS)
}

/**
 * The sheet's transition, as a pair of tokens off the active theme's own motion
 * scale rather than a duration tuned by hand.
 *
 * `enteringScreen` (225ms on MUI's default scale) is Material's recommendation
 * for a surface arriving on screen, and is what MUI's `Drawer` already passes to
 * its own enter transition — so this sheet moves at the speed every other
 * surface in the same application does. The pattern's bounds are 120–400ms
 * (`e2e/support/motion.ts`): under the floor the sheet reads as already-arrived
 * and stops saying it came up from the trigger the thumb just touched, over the
 * ceiling the user is waiting on a menu. Nothing here retunes the scale to land
 * inside them — every duration on MUI's already does, so picking the
 * semantically right token is the whole exercise, which is the point of the
 * bound being a range.
 *
 * `easeOut` is the curve Material pairs with an entering surface, and its
 * deceleration is what gives the sheet weight; a linear ramp would fail the
 * pattern's non-linearity requirement as well as looking mechanical.
 *
 * Read from the theme each time rather than captured once at module scope: an
 * application that tuned its own motion scale has tuned this sheet's travel with
 * it, which is the same reason the palette and typography are not the port's to
 * fix either.
 */
export function sheetMotion(theme: Theme): { duration: number; easing: string } {
  return {
    duration: theme.transitions.duration.enteringScreen,
    easing: theme.transitions.easing.easeOut,
  }
}

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
