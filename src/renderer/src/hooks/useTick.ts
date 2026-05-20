import { useEffect, useState } from 'react'

/**
 * Returns the current Date.now() and re-renders the consumer at the given
 * interval. Used by the Today view to keep elapsed times ticking without
 * touching the store on every second.
 */
export function useTick(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const h = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(h)
  }, [intervalMs])
  return now
}
