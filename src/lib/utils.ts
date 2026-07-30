import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Prevents Radix focus restoration that can leave the app unresponsive after nested overlays close. */
export function preventRadixAutoFocus(event: Event) {
  event.preventDefault()
}

/** Use on DropdownMenuItem when opening a Dialog/AlertDialog from a menu item. */
export function openDialogFromMenu(handler: () => void) {
  return (event: Event) => {
    event.preventDefault()
    handler()
  }
}
