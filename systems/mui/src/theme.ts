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
 * Motion for the reduced-motion path, expressed through the same MUI helper so
 * that the declaration a reader compares against `SHEET_MOTION` has the same
 * shape. Zero rather than a token: MUI's scale has no "instant" step, and the
 * preference asks for no perceptible movement at all.
 */
export const NO_MOTION = { duration: 0 } as const
