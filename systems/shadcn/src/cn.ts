import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * shadcn/ui's one shared utility: conditional classes, with later Tailwind
 * utilities beating earlier ones of the same kind.
 *
 * `clsx` alone would concatenate `px-4` and `px-6` and leave the winner to
 * stylesheet order, which is not what a caller passing `className` means.
 * `twMerge` resolves them by Tailwind's own grouping, so a consumer can
 * override a component's padding by passing padding, which is the whole point
 * of shadcn components being copied into a project rather than imported.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
