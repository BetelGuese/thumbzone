/**
 * The React binding for the port's behaviour: it wires an instance over the
 * elements the component rendered, and tears it down when they go away.
 */

import { useEffect, useMemo, useRef } from 'react'
import type { RefObject } from 'react'
import { hasThumbzoneOwner, initThumbzone, liveThumbzone, type ThumbzoneHandle } from './thumbzone'

/**
 * Where the page content the open sheet covers is found.
 *
 * A selector, not a ref: that element belongs to the page around the island —
 * the sheet is rendered as its sibling, exactly as the reference authors it as
 * a sibling of `<main>` — so React has nothing to attach a ref to there.
 */
const INERT_ROOT_SELECTOR = '[data-tz-app]'

/** The elements the component holds refs to, all of them inside the island. */
export interface ThumbzoneRefObjects {
  trigger: RefObject<HTMLElement | null>
  sheet: RefObject<HTMLElement | null>
  scrim: RefObject<HTMLElement | null>
  menu: RefObject<HTMLElement | null>
  /** Overrides where the content the sheet covers is looked up. */
  inertRootSelector?: string
}

/**
 * Wires the pattern over the referenced elements once they are mounted, and
 * tears down whatever it wired when they unmount.
 *
 * One sheet takes one instance. On a server-rendered page the markup can be live
 * before this component's framework has finished downloading — the behaviour
 * module needs no framework, so a page can wire it during load — and a mount
 * that finds the sheet already claimed leaves it with its owner rather than
 * competing for the same listeners. In an application that just renders the
 * component, nothing else claims it and the mount is what wires it.
 *
 * @param refs Refs to the trigger, sheet, scrim and menu the component renders.
 * @returns A handle that reaches whichever instance is live on the sheet.
 */
export function useThumbzone(refs: ThumbzoneRefObjects): ThumbzoneHandle {
  const { trigger, sheet, scrim, menu, inertRootSelector = INERT_ROOT_SELECTOR } = refs
  // Whether the previous run of the effect was the one that wired the sheet,
  // which is what tells a re-run (a development double-mount, say) apart from a
  // first mount over markup that already has an owner.
  const wiredHere = useRef(false)

  useEffect(() => {
    // Someone got here first and is still running: adopt it, and leave the
    // teardown to whoever owns it.
    if (liveThumbzone(sheet.current)) return
    // Claimed, then deliberately torn down by that owner. Putting a replacement
    // in place would resurrect what they had just dismantled.
    if (hasThumbzoneOwner(sheet.current) && !wiredHere.current) return

    const wired = initThumbzone({
      trigger: trigger.current,
      sheet: sheet.current,
      scrim: scrim.current,
      menu: menu.current,
      inertRoot: document.querySelector(inertRootSelector),
    })
    wiredHere.current = true
    return () => wired.destroy()
  }, [trigger, sheet, scrim, menu, inertRootSelector])

  // Resolved per call rather than captured: refs are empty on the first render,
  // so there is nothing to capture yet, and an instance can be replaced under
  // this component (torn down and re-initialised over the same elements) without
  // the handle a caller is holding going stale.
  return useMemo<ThumbzoneHandle>(
    () => ({
      open: () => liveThumbzone(sheet.current)?.open(),
      close: () => liveThumbzone(sheet.current)?.close(),
      destroy: () => liveThumbzone(sheet.current)?.destroy(),
    }),
    [sheet],
  )
}
