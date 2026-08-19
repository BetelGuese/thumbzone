/**
 * A one-shot latch that reports when the port's component has mounted.
 *
 * This is the missing channel between a page that wires the pattern during load
 * and the framework that arrives afterwards to hydrate the same markup. The page
 * needs one fact from the framework — "you are done claiming these nodes" — and
 * it cannot get it from anywhere else:
 *
 * - The framework's own island markers say when hydration was *scheduled*, not
 *   when it committed. React's is scheduled inside a transition, so the call that
 *   starts it returns long before the render it started has finished.
 * - Timers, microtasks and animation frames all run *between* the tasks React
 *   splits a concurrent render over, so none of them is a barrier.
 * - Only an effect is guaranteed to run after the commit, which is why the one
 *   place this is marked from is `useThumbzone`'s.
 *
 * Why the page cares: initialising reorders the menu's items in the DOM, and
 * hydration walks those items as siblings while holding a pointer into the list
 * across the tasks it yields between. A reorder that lands in one of those gaps
 * leaves the framework short of the nodes it still expects, which it answers by
 * discarding the tree and re-rendering it — replacing the very elements the page
 * already wired. The first reorder is safe, because it happens before hydration
 * can have started; a *later* one (a teardown, a re-initialisation) has to wait
 * for this. Awaiting it is what makes that ordering a guarantee instead of a
 * race.
 *
 * Deliberately framework-free and document-wide rather than keyed by element: a
 * page has one of these, and a latch keyed by the sheet it was wired over would
 * never resolve in exactly the case worth diagnosing — a tree that *was*
 * discarded, whose replacement mounts over new nodes. Resolving anyway turns
 * that into a failed assertion about a dead handle rather than a hang.
 */

let mounted = false
const waiting: Array<() => void> = []

/** Records that the component has mounted, releasing every pending `whenMounted`. */
export function markMounted(): void {
  if (mounted) return
  mounted = true
  // Drained before resolving, so a `whenMounted()` called from one of these
  // callbacks queues nothing behind a latch that is already open.
  for (const resolve of waiting.splice(0)) resolve()
}

/**
 * Resolves once the component has mounted, immediately if it already has.
 *
 * Never rejects, and never resolves on its own: a page that renders the component
 * without a client-side framework at all has nothing to wait for and should not
 * be awaiting this.
 */
export function whenMounted(): Promise<void> {
  if (mounted) return Promise.resolve()
  return new Promise<void>((resolve) => {
    waiting.push(resolve)
  })
}
