import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from './cn'

/**
 * shadcn/ui's Button, reduced to the variants this port actually uses.
 *
 * Copied in rather than imported, which is how shadcn/ui is meant to be
 * consumed — there is no package to depend on. The variants are its own; only
 * the two the trigger needs are kept, because a port shipping unused variants
 * would be padding the diff rather than demonstrating the system.
 */
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium transition-colors ' +
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ' +
    'disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        ghost: 'hover:bg-muted hover:text-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2 rounded-md',
        // Clears the contract's 48px minimum hit target with headroom in both
        // axes. Named for what it is rather than given a t-shirt size, so it
        // cannot be swapped for a smaller one by someone tidying the variants.
        target: 'h-14 w-14 rounded-full',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
)

export type ButtonProps = ComponentProps<'button'> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
