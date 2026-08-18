/**
 * Loads the weights Material UI's type scale actually uses.
 *
 * Imported as a module rather than through a CSS `@import` inside the route's
 * style element, and the difference is not cosmetic: a nested CSS import is
 * passed through without asset rewriting, so the `@font-face` rules survive
 * into the build pointing at font files that were never emitted. The page then
 * requests a font that is not there and falls back to Helvetica — precisely
 * the defect loading Roboto was meant to fix, made harder to spot by the
 * presence of plausible-looking `@font-face` rules. Verified against the built
 * output rather than the source.
 *
 * Latin only, deliberately. The full family ships Cyrillic, Greek and
 * Vietnamese subsets too, which cost a reader nothing at runtime — every
 * subset carries a `unicode-range` and a browser fetches only what the page
 * needs — but they are carried in the build and deployed regardless, and this
 * fixture's prose is English. A port serving other scripts should import the
 * unsuffixed entrypoints (`@fontsource/roboto/400.css`) instead, which pull
 * every subset.
 */
import '@fontsource/roboto/latin-400.css'
import '@fontsource/roboto/latin-500.css'
import '@fontsource/roboto/latin-700.css'
