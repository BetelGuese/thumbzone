import { useImperativeHandle, useRef, useState } from 'react'
import type { Ref } from 'react'
import { MIN_HIT_TARGET } from '../../../core/index.js'
import { Button } from './Button'
import { cn } from './cn'
import type { ThumbzoneHandle } from './thumbzone'
import { useThumbzone } from './useThumbzone'

/** Target of the trigger's `aria-controls`, and the sheet's own `id`. */
const SHEET_ID = 'tz-shadcn-sheet'

/**
 * Whether the menu already on the page is the reverse of `items`.
 *
 * The pattern owns the menu's order, and on a server-rendered page it takes it
 * before this component renders on the client at all: the page wires the
 * behaviour during load, so the thumb-first reorder is already in the served DOM
 * by the time React comes to hydrate it. Rendering the authored order into that
 * would leave React holding every item's label against the wrong node.
 *
 * Reordering moves text between nodes without moving any element React expects,
 * so it surfaces as a text mismatch — and React *throws* on an unannounced one:
 * it discards the tree and renders a fresh one, replacing the very elements the
 * page's handle is holding.
 *
 * So the render asks. One boolean, read once, trusted only when the answer is
 * unambiguous — an exact reversal of the items this render was given. Anything
 * else (a menu that opted out, a consumer's own order, markup this component did
 * not produce, or a client render with no server markup to consult) reads as
 * false and renders the authored order, which is what the server rendered too.
 *
 * (A client-only render has no DOM to consult and initialises from an effect
 * instead, so the reorder lands after the commit and React's idea of the order
 * stays the authored one for the rest of the tree's life. That is the pattern
 * owning the DOM, which is the arrangement everywhere else too, and no hydration
 * is involved for it to break.)
 */
function menuIsReversed(items: string[]): boolean {
  if (typeof document === 'undefined') return false
  const menu = document.querySelector('[data-tz-menu]')
  if (!menu) return false
  const rendered = Array.from(menu.querySelectorAll('a')).map((link) => link.textContent?.trim())
  if (rendered.length !== items.length) return false
  return items.every((item, index) => rendered[items.length - 1 - index] === item)
}

/**
 * The pattern's markup in shadcn/ui's vocabulary, wired to the shared behaviour.
 *
 * Not built on Vaul, which is what shadcn/ui's own Drawer wraps. Vaul reaches
 * the same dismiss ratio and the same easing curve as this pattern and even
 * implements handle-only dragging natively, but its fling threshold is 0.4
 * against this contract's 0.5 and is not configurable — so it would pass
 * conformance while running a retuned constant. The drawer's *styling*
 * vocabulary is kept; its gesture engine is not used.
 *
 * The same shape as the Material UI port, and for the same reason: a design
 * system's drawer component owns open/close, focus and motion, and this pattern
 * already owns those. Reaching past the component to the surface underneath is
 * what a port does here.
 *
 * Every contract attribute is authored explicitly rather than derived from a
 * styling hook — Tailwind's class names are the styling system's, so nothing the
 * contract is expressed in may ride on one. Everything in the JSX renders the
 * sheet's **closed** state, which is also what a reader gets before hydration and
 * with the bundle blocked entirely; the behaviour takes those same attributes
 * over from there.
 */
export default function ThumbzoneMenu({
  items,
  ref,
}: {
  /** The menu's items, authored most-used-first. */
  items: string[]
  /**
   * Receives the sheet's `open`, `close` and `destroy`.
   *
   * The pattern is driven from the DOM — a tap, a swipe, a key — so nothing here
   * needs this; it is for the application around it, which may have its own
   * reason to open or dismiss the menu and no element of the pattern's to
   * dispatch through.
   */
  ref?: Ref<ThumbzoneHandle>
}) {
  const trigger = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  const scrim = useRef<HTMLDivElement>(null)
  const menu = useRef<HTMLUListElement>(null)

  const thumbzone = useThumbzone({ trigger, sheet, scrim, menu })
  useImperativeHandle(ref, () => thumbzone, [thumbzone])

  // Read once, on the render that has to agree with the page. Recomputing it
  // later would let a re-render write the order back — React deciding the
  // pattern's order, which is the wrong way round. The direction is captured
  // rather than the list itself, so a consumer who does change `items` still
  // gets all of the current items, thumb-first.
  const [reversed] = useState(() => menuIsReversed(items))
  const order = reversed ? [...items].reverse() : items

  return (
    <>
      <div
        ref={scrim}
        // The state attributes below are the pattern's from load onward, and by
        // the time this island hydrates the sheet may well have been opened
        // already. React would report that as a mismatch on attributes it does
        // not in fact own; this says so, for this element only.
        suppressHydrationWarning
        data-tz-scrim=""
        data-tz-open="false"
        className={cn(
          'fixed inset-0 z-40 bg-foreground/40 opacity-0 pointer-events-none',
          'transition-opacity duration-200 ease-out',
          'data-[tz-open=true]:opacity-100 data-[tz-open=true]:pointer-events-auto',
          // The scrim scrolls nothing of its own but sits over a page that
          // does, and pointer-events alone does not stop a touch pan reaching
          // it. Pinch-zoom must survive: this covers the whole viewport while
          // open, so blocking it here is a screen-wide regression (WCAG 1.4.4).
          'touch-pan-x touch-pinch-zoom',
          'motion-reduce:transition-none',
        )}
      />

      <div
        ref={sheet}
        id={SHEET_ID}
        role="dialog"
        aria-modal="true"
        // The dialog names itself in the port's own words; the trigger's name
        // below is separate and stays put in both states.
        aria-label="Main navigation"
        // Authored closed and inert, and rendered either way — never `hidden`
        // and never `display: none`, which would leave the open transition
        // nothing to animate and make `inert` decorative.
        inert
        // Focusable only as the fallback a menu with nothing focusable in it
        // needs, and never a stop in the tab sequence. Authored rather than left
        // to the behaviour so that a served page already matches what React
        // renders.
        tabIndex={-1}
        suppressHydrationWarning
        data-tz-sheet=""
        data-tz-open="false"
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 flex max-h-[80dvh] flex-col',
          'rounded-t-sheet border-t border-border bg-background',
          'translate-y-full transition-transform duration-200 ease-out',
          'data-[tz-open=true]:translate-y-0',
          // A drag drives the transform inline, and that must not be animated.
          'data-[tz-dragging=true]:transition-none',
          // Static and explicit, not inherited: an ancestor's touch-action does
          // not change this element's own computed value, which is what a pan
          // starting on the sheet's own chrome is arbitrated against.
          // pinch-zoom rather than none so a pinch landing here still zooms the
          // page — panning is what has to stay ours.
          'touch-pinch-zoom',
          // The trigger floats above the sheet and must stay hit-testable, so
          // the sheet reserves its footprint — the trigger's own size plus the
          // gap that lifts it off the bottom edge — rather than letting it cover
          // the last row of the menu. The safe-area inset is added outright
          // rather than folded into the trigger's (clamped) offset: this only
          // has to be at least as large as the trigger's real clearance, and
          // adding the inset can only make that truer.
          'pb-[calc(env(safe-area-inset-bottom,0px)+5rem)]',
          // No travel at all under the preference — the sheet stays where it
          // rests and only its opacity changes, instantly.
          'motion-reduce:translate-y-0 motion-reduce:opacity-0 motion-reduce:pointer-events-none',
          'motion-reduce:transition-opacity motion-reduce:duration-[1ms]',
          'motion-reduce:data-[tz-open=true]:opacity-100 motion-reduce:data-[tz-open=true]:pointer-events-auto',
        )}
      >
        {/* A sibling of the menu and authored above it: the menu owns the
            sheet's scrolling, so this is the one place a dismiss drag can
            start. aria-hidden because it says nothing the dialog's own name has
            not already said. */}
        <div
          data-tz-handle=""
          aria-hidden="true"
          className={cn(
            'mx-auto flex w-full shrink-0 cursor-grab items-center justify-center',
            'touch-none',
            '[[data-tz-dragging=true]_&]:cursor-grabbing',
          )}
          // The whole drag target clears the pattern's minimum, not just the
          // pill drawn inside it — declared from the constant rather than from
          // a spacing token that could be tidied under it.
          style={{ height: MIN_HIT_TARGET }}
        >
          <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" />
        </div>

        <ul
          ref={menu}
          // The order opt-out the pattern honours is read from this element's
          // own attributes rather than passed as a prop, so a consumer who sets
          // it before the island hydrates has not created a mismatch for React
          // to report. This covers the `<ul>`'s own attributes and nothing below
          // it — React consults the flag on the fiber a mismatch is found at, so
          // the reordered items each carry their own.
          suppressHydrationWarning
          data-tz-menu=""
          className={cn(
            // Without min-h-0 a flex child's automatic minimum is its content's
            // height, so a long menu would push the sheet past its own
            // max-block-size instead of scrolling inside it.
            'min-h-0 flex-1 list-none overflow-y-auto overscroll-contain p-2',
            // Unconditional, unlike every other surface here: this region must
            // stay pannable by touch at every scroll position and on every
            // engine. A value that changed with scrollTop is what deadlocks —
            // it blocks the very scroll that would move scrollTop off zero.
            'touch-pan-y touch-pinch-zoom',
          )}
        >
          {order.map((item) => (
            <li key={item}>
              <a
                href="#"
                className={cn(
                  'flex min-h-12 items-center rounded-md px-4 text-base text-foreground',
                  'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                )}
              >
                {/* Annotated on the node whose text moves. React consults the
                    flag at the fiber the mismatch is found at and nowhere else,
                    so putting it on the <ul> would do nothing for this text.

                    What it is *not* is a licence to disagree with the DOM: on
                    its own it would leave React binding every label to the wrong
                    node, which is silent rather than safe. `menuIsReversed`
                    above resolves the ordinary case by rendering the order the
                    DOM already has, and this covers only what that cannot — a
                    served menu whose order is neither the authored one nor an
                    exact reversal of it, where the render falls back to the
                    authored order and some text genuinely differs. Suppressed,
                    because the order was never React's to arbitrate. */}
                <span suppressHydrationWarning>{item}</span>
              </a>
            </li>
          ))}
        </ul>
      </div>

      {/* shadcn/ui's Button is a real <button>, which the trigger has to be. Its
          name is the port's own and describes the menu rather than the state:
          aria-expanded reports open or closed, so a name that changed with it
          would say the same thing twice. */}
      <Button
        ref={trigger}
        size="target"
        type="button"
        aria-controls={SHEET_ID}
        aria-expanded="false"
        aria-label="Browse the menu"
        suppressHydrationWarning
        data-tz-trigger=""
        className={cn(
          'fixed left-1/2 z-50 -translate-x-1/2 shadow-lg',
          // Placed a gap above the bottom edge, then clamped by the pattern's
          // own ceiling on how far a thumb-reachable trigger may sit from it —
          // so neither a larger spacing token nor a tall home-indicator inset
          // can quietly push it out of the thumb zone. The 96px restates
          // MAX_TRIGGER_BOTTOM_GAP from core/index.js, which a class name cannot
          // import; the conformance suite asserts the rendered position against
          // the constant itself, so a value that drifted from it fails a test
          // rather than moving the trigger somewhere no thumb reaches.
          'bottom-[min(calc(env(safe-area-inset-bottom,0px)+1rem),96px)]',
          'transition-transform duration-200 ease-out',
          'data-[tz-tucked=true]:translate-y-[calc(100%+2rem+env(safe-area-inset-bottom,0px))]',
          // The trigger scrolls nothing, so this can be static: without it a
          // real swipe-to-open is read as an attempt to pan the page and the
          // pointer stream is cancelled before the gesture completes.
          'touch-none',
          'motion-reduce:transition-none',
        )}
      >
        {/* Drawn inline rather than pulled from an icon package, which this
            project does not depend on. */}
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-6 fill-current">
          <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
        </svg>
      </Button>
    </>
  )
}
