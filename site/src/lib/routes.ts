/**
 * Joins a deployment base onto a root-relative route.
 *
 * Astro rewrites nothing for `base` except the asset URLs it emits itself, so
 * a route written as a literal — and every demo route is one, straight out of
 * `systems/registry.ts` — points above the base and 404s on a project-site
 * deployment. Every link into a demo goes through this.
 *
 * The route is assumed root-relative, which `e2e/registry.spec.ts` already
 * requires of every registered system rather than leaving to chance.
 */
export function joinBase(base: string, route: string): string {
  // Astro normalises BASE_URL to a trailing slash and the routes carry a
  // leading one, so the separator has to come from exactly one of them.
  return `${base.replace(/\/+$/, '')}${route}`
}
