import Box from '@mui/material/Box'
import Drawer from '@mui/material/Drawer'
import Fab from '@mui/material/Fab'
import List from '@mui/material/List'
import ListItem from '@mui/material/ListItem'
import ListItemButton from '@mui/material/ListItemButton'
import ListItemText from '@mui/material/ListItemText'
import type { PaperProps } from '@mui/material/Paper'
import SvgIcon from '@mui/material/SvgIcon'
import { ThemeProvider, alpha } from '@mui/material/styles'
import { DESKTOP_BREAKPOINT, MAX_TRIGGER_BOTTOM_GAP, MIN_HIT_TARGET } from '../../../core/index.js'
import type { ContractAttributes } from '../../contract'
import { REDUCED_MOTION_RESET, SHEET_MAX_BLOCK_SIZE, SHEET_MOTION, thumbzoneTheme } from './theme'

/** Target of the trigger's `aria-controls`, and the sheet's own `id`. */
const SHEET_ID = 'tz-mui-sheet'

/**
 * The sheet: MUI's `Drawer`, but its **docked** variant rather than the
 * temporary one, because the pattern and MUI's `Modal` cannot both own the
 * sheet.
 *
 * A temporary `Drawer` is a `Modal` wrapping a `Slide`, and each of those
 * takes something the contract requires the pattern to hold:
 *
 * - `Slide` writes the sheet's `transform` and its transition inline, for the
 *   duration of the animation only. The contract wants the travel *declared*
 *   as a CSS transition on `transform` — readable while the sheet is closed —
 *   and wants the inline `transform` free for a drag to track the finger with.
 * - `Modal` marks its container's other children `aria-hidden` while open.
 *   That would include the trigger, which has to stay a live, named control
 *   with a readable `aria-expanded` throughout — tapping it is a close path.
 * - Even with `keepMounted`, a closed `Modal` (and `Slide`'s own exited state)
 *   resolves to `visibility: hidden`, which already removes the sheet from the
 *   tab order and the accessibility tree. The contract deliberately keeps a
 *   closed sheet rendered so that `inert` is what does that, and so the open
 *   transition has something to animate.
 *
 * The docked variant renders the same `MuiDrawer-paper` in place, with no
 * portal, no `Modal` and no `Slide` — so the sheet is always in the DOM, its
 * transform is the port's, and `inert` is load-bearing. The portal was never
 * what put the sheet outside `[data-tz-app]` anyway: the island renders as a
 * sibling of it, exactly as vanilla's markup authors the sheet as a sibling of
 * `<main>`.
 */
const sheetSlotProps: PaperProps & ContractAttributes = {
  id: SHEET_ID,
  role: 'dialog',
  'aria-modal': true,
  // The dialog names itself in the port's own words, as the contract asks; the
  // trigger's name below is separate and stays put in both states.
  'aria-label': 'Site navigation',
  // Authored closed and inert, and rendered either way: this is also what a
  // reader gets before hydration, or with the bundle blocked entirely.
  inert: true,
  'data-tz-sheet': '',
  'data-tz-open': 'false',
  sx: (theme) => ({
    display: 'flex',
    flexDirection: 'column',
    maxBlockSize: SHEET_MAX_BLOCK_SIZE,
    // `MuiDrawer-paper` scrolls its own overflow. Here the menu does instead,
    // so that a menu taller than the sheet keeps scrolling by touch while the
    // sheet's own chrome stays a drag surface.
    overflow: 'hidden',
    paddingBlockEnd: 'env(safe-area-inset-bottom, 0px)',
    // Two artefacts of the docked variant, both of which assume a drawer sitting
    // against page content rather than floating over a scrim: elevation is
    // forced to 0, and the edge facing the content gets a divider hairline. The
    // elevation the temporary variant defaults to is the right one here, and
    // the hairline reads as a stray line above a floating sheet.
    boxShadow: theme.shadows[16],
    borderBlockStart: 'none',
    // Static and explicit, not inherited: an ancestor's touch-action does not
    // change this element's own computed value, which is what a test reads and
    // what a pan starting here is arbitrated against. pinch-zoom rather than
    // none so a pinch that lands here still zooms the page (WCAG 1.4.4) —
    // panning is what has to stay ours.
    touchAction: 'pinch-zoom',
    transform: 'translateY(100%)',
    transition: theme.transitions.create('transform', SHEET_MOTION),
    '&[data-tz-open="true"]': { transform: 'none' },
    // A drag is direct manipulation: the sheet has to sit under the finger,
    // not chase it a transition-duration behind.
    '&[data-tz-dragging="true"]': { transition: 'none' },
    [theme.breakpoints.up(DESKTOP_BREAKPOINT)]: { display: 'none' },
    '@media (prefers-reduced-motion: reduce)': {
      // No travel at all under the preference — the sheet stays where it rests
      // and only its opacity changes, instantly.
      ...REDUCED_MOTION_RESET,
      transform: 'none',
      opacity: 0,
      pointerEvents: 'none',
      '&[data-tz-open="true"]': { opacity: 1, pointerEvents: 'auto' },
    },
  }),
}

/**
 * The pattern's markup, in Material UI's components.
 *
 * Attributes are authored explicitly rather than derived from styling hooks:
 * Emotion generates the class names, so nothing the contract is expressed in
 * can ride on them. Everything here renders the sheet's **closed** state; the
 * attributes it authors are the ones the behaviour reads and rewrites.
 */
export default function ThumbzoneMenu({ items }: { items: string[] }) {
  return (
    <ThemeProvider theme={thumbzoneTheme}>
      {/* MUI's `Backdrop` fades through `Fade`, which writes its opacity
          inline from a React prop. The pattern's scrim is driven by
          `data-tz-open` on the element itself, so it is built from `Box` and
          MUI's own backdrop colour instead of fighting that. */}
      <Box
        data-tz-scrim=""
        data-tz-open="false"
        sx={(theme) => ({
          position: 'fixed',
          inset: 0,
          // One step under the drawer level MUI gives the paper, so the scrim
          // covers the page and nothing else.
          zIndex: theme.zIndex.drawer - 1,
          bgcolor: alpha(theme.palette.common.black, 0.5),
          opacity: 0,
          pointerEvents: 'none',
          // The scrim scrolls nothing of its own but sits over a page that
          // does, and pointer-events alone does not stop a touch pan reaching
          // it. pinch-zoom, never none: this covers the whole viewport while
          // open, so blocking zoom here is a screen-wide regression
          // (WCAG 1.4.4).
          touchAction: 'pinch-zoom',
          transition: theme.transitions.create('opacity', SHEET_MOTION),
          '&[data-tz-open="true"]': { opacity: 1, pointerEvents: 'auto' },
          [theme.breakpoints.up(DESKTOP_BREAKPOINT)]: { display: 'none' },
          '@media (prefers-reduced-motion: reduce)': REDUCED_MOTION_RESET,
        })}
      />

      <Drawer variant="permanent" anchor="bottom" slotProps={{ paper: sheetSlotProps }}>
        {/* A sibling of the menu and authored above it: the menu owns the
            sheet's scrolling, so this is the one place a dismiss drag can
            start. aria-hidden because it says nothing the dialog's own name
            has not already said. */}
        <Box
          data-tz-handle=""
          aria-hidden="true"
          sx={{
            flex: '0 0 auto',
            display: 'grid',
            placeItems: 'center',
            // The whole drag target clears the pattern's minimum, not just the
            // pill drawn inside it.
            blockSize: `${MIN_HIT_TARGET}px`,
            boxSizing: 'border-box',
            cursor: 'grab',
            touchAction: 'pinch-zoom',
            '[data-tz-dragging="true"] &': { cursor: 'grabbing' },
          }}
        >
          <Box
            sx={(theme) => ({
              inlineSize: theme.spacing(5),
              blockSize: theme.spacing(0.5),
              borderRadius: '999px',
              // text.secondary rather than a dimmed text.primary: it clears
              // WCAG 1.4.11's 3:1 floor for a non-text control against the
              // paper behind it without a hand-picked opacity.
              bgcolor: 'text.secondary',
            })}
          />
        </Box>

        <List
          data-tz-menu=""
          sx={{
            flex: '1 1 auto',
            // Without this a flex child's automatic minimum is its content's
            // height, so a long menu would push the sheet past its own
            // max-block-size instead of scrolling inside it.
            minBlockSize: 0,
            overflowY: 'auto',
            // Unconditional, unlike every other surface here: this region must
            // stay pannable by touch at every scroll position and on every
            // engine. A value that changed with scrollTop is what deadlocks —
            // it blocks the very scroll that would move scrollTop off zero.
            touchAction: 'pan-y pinch-zoom',
            // Keeps a scroll that reaches the boundary from chaining into the
            // page behind the sheet on iOS.
            overscrollBehavior: 'contain',
          }}
        >
          {items.map((item) => (
            <ListItem key={item} disablePadding>
              <ListItemButton
                component="a"
                href="#"
                sx={{ minBlockSize: `${MIN_HIT_TARGET}px` }}
              >
                <ListItemText primary={item} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </Drawer>

      {/* A Fab is a real <button>, which the trigger has to be. Its name is
          the port's own and describes the menu rather than the state:
          aria-expanded reports open or closed, so a name that changed with it
          would say the same thing twice. */}
      <Fab
        data-tz-trigger=""
        color="primary"
        aria-label="Browse menu"
        aria-expanded={false}
        aria-controls={SHEET_ID}
        sx={(theme) => ({
          position: 'fixed',
          left: '50%',
          // Placed on MUI's spacing scale, then clamped by the pattern's own
          // ceiling on how far a thumb-reachable trigger may sit from the
          // bottom edge — so neither a larger spacing token nor a tall
          // home-indicator inset can quietly push it out of the thumb zone.
          bottom: `min(calc(${theme.spacing(2)} + env(safe-area-inset-bottom, 0px)), ${MAX_TRIGGER_BOTTOM_GAP}px)`,
          // MUI's Fab is already 56px square, comfortably past the floor. The
          // floor is still declared from the constant, so a change to MUI's
          // own sizing cannot drop the trigger under it unnoticed.
          minInlineSize: `${MIN_HIT_TARGET}px`,
          minBlockSize: `${MIN_HIT_TARGET}px`,
          // Above the sheet, not at MUI's fab level below it: tapping the
          // trigger while the sheet is up is a close path, so it has to stay
          // hit-testable over it.
          zIndex: theme.zIndex.drawer + 1,
          // The trigger scrolls nothing, so this can be static: without it a
          // real swipe-to-open is read as an attempt to pan the page and the
          // pointer stream is cancelled before the gesture completes.
          touchAction: 'pinch-zoom',
          transform: 'translateX(-50%)',
          // Composed, not replaced: a bare `transform` declaration would drop
          // the Fab's own colour and elevation transitions, since one element
          // has a single transition list. MUI's half keeps its tokens.
          transition: [
            theme.transitions.create(['background-color', 'box-shadow', 'border-color'], {
              duration: theme.transitions.duration.short,
            }),
            theme.transitions.create('transform', SHEET_MOTION),
          ].join(', '),
          '&[data-tz-tucked="true"]': {
            transform: `translateX(-50%) translateY(calc(100% + ${theme.spacing(4)} + env(safe-area-inset-bottom, 0px)))`,
          },
          [theme.breakpoints.up(DESKTOP_BREAKPOINT)]: { display: 'none' },
          '@media (prefers-reduced-motion: reduce)': REDUCED_MOTION_RESET,
        })}
      >
        {/* The Material "menu" glyph, drawn with SvgIcon rather than pulled
            from @mui/icons-material, which this project does not depend on. */}
        <SvgIcon>
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </SvgIcon>
      </Fab>
    </ThemeProvider>
  )
}
