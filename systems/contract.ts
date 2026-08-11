/**
 * The port-side type for the contract's own attributes.
 *
 * `data-*` is legal on every element and appears in no React prop type.
 * TypeScript waives that only for hyphenated names written directly as JSX
 * attributes — not for the object a design system's `slotProps` (or any other
 * typed prop bag) takes. Every React port hits this the moment a contract
 * attribute has to ride on a system's slot rather than on a plain element, so
 * the escape hatch lives here once rather than being re-derived per port.
 *
 * A template-literal key resolves to an index signature, so any subset of the
 * contract's attributes satisfies it while it stays a *typed* signature rather
 * than an `any` bag: a misspelt `data-tx-sheet` is still rejected, and so is a
 * non-string value.
 */
export type ContractAttributes = { [attribute: `data-tz-${string}`]: string }
