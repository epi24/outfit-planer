import type { AnchorHTMLAttributes, MouseEvent } from 'react'
import { navigate } from './router'

interface LinkProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string
  /** replace the current history entry instead of adding one */
  replace?: boolean
}

export function Link({ to, replace, onClick, ...rest }: LinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event)
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return
    }
    event.preventDefault()
    navigate(to, { replace })
  }

  return <a {...rest} href={'#' + to} onClick={handleClick} />
}
