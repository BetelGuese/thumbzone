import { describe, it, expect } from 'vitest'
import { createTheme } from '@mui/material/styles'
import { extendThemeForThumbzone, sheetMotion } from '../src/theme'

const rand = (min, max) => min + Math.random() * (max - min)
const randInt = (min, max) => Math.floor(rand(min, max))
// A colour no MUI default could coincide with is not something a range can
// promise, so the draw is over the whole 24-bit space and the assertions compare
// against the drawn value rather than against "not the default".
const randHex = () => `#${randInt(0, 0x1000000).toString(16).padStart(6, '0')}`

/**
 * An application's theme, with the tokens a foreign-looking widget would ignore
 * set to values nothing else in MUI would produce.
 */
const randomApplicationTheme = () => {
  const primary = randHex()
  const spacingUnit = randInt(2, 32)
  const fontFamily = `Test-${randInt(0, 1e6)}`
  return {
    primary,
    spacingUnit,
    fontFamily,
    theme: createTheme({
      palette: { primary: { main: primary } },
      spacing: spacingUnit,
      typography: { fontFamily },
    }),
  }
}

describe('extendThemeForThumbzone', () => {
  // The whole point of the port: dropped into a themed application it must look
  // native to it. Every one of these is a token the port's own styling reads, so
  // a theme of the port's own making would leave the menu the one surface in the
  // application ignoring the application's design.
  it("keeps the application's palette, spacing scale and typography", () => {
    const { primary, spacingUnit, fontFamily, theme } = randomApplicationTheme()
    const extended = extendThemeForThumbzone(theme)

    expect(extended.palette.primary.main).toBe(primary)
    // Read through the scale's own function rather than off a raw value: that is
    // how the port consumes it, and a merge that kept the number while losing the
    // callable would pass a property comparison and break every style.
    const steps = randInt(1, 8)
    expect(extended.spacing(steps)).toBe(`${spacingUnit * steps}px`)
    expect(extended.typography.fontFamily).toBe(fontFamily)
  })

  // The one thing the port does impose. Honouring the preference is a
  // requirement of the pattern rather than a taste of the port's, so it has to
  // survive an application that turned MUI's own handling off — asserted against
  // an outer theme that did exactly that, since an outer theme which merely left
  // it unset could not tell "imposed" from "defaulted".
  it("overrules an application that disabled MUI's reduced-motion handling", () => {
    const outer = createTheme({ motion: { reducedMotion: 'never' } })
    expect(outer.motion.reducedMotion).toBe('never')

    expect(extendThemeForThumbzone(outer).motion.reducedMotion).toBe('system')
  })

  // MUI hands a component no outer theme in an application that never adopted
  // MUI's theming, and `useTheme()` answers that case with MUI's own defaults —
  // so this is the theme the port actually renders under there, and it still has
  // to be a complete, usable one.
  it("falls back to a complete theme when the application provides none", () => {
    const extended = extendThemeForThumbzone(createTheme())

    expect(extended.palette.primary.main).toBe(createTheme().palette.primary.main)
    expect(typeof extended.spacing).toBe('function')
    expect(extended.motion.reducedMotion).toBe('system')
  })
})

describe('sheetMotion', () => {
  // Read from the theme in effect rather than captured once from the port's own,
  // for the same reason as the palette above: an application that tuned its
  // motion scale has tuned the sheet's travel with it.
  it("takes the sheet's duration and easing from the theme it is given", () => {
    const duration = randInt(80, 600)
    const easing = `cubic-bezier(${rand(0, 1).toFixed(3)}, 0, 1, 1)`
    const theme = createTheme({
      transitions: { duration: { enteringScreen: duration }, easing: { easeOut: easing } },
    })

    expect(sheetMotion(theme)).toEqual({ duration, easing })
  })
})
