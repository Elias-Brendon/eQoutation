import { useEffect, useState } from 'react'

// Debounced so rapid resize drags (e.g. dragging the window edge) don't
// re-render on every pixel — only settles ~120ms after resizing stops.
export function useWindowWidth(debounceMs = 120): number {
  const [width, setWidth] = useState(() => window.innerWidth)

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>
    const handleResize = (): void => {
      clearTimeout(timeout)
      timeout = setTimeout(() => setWidth(window.innerWidth), debounceMs)
    }
    window.addEventListener('resize', handleResize)
    return () => {
      clearTimeout(timeout)
      window.removeEventListener('resize', handleResize)
    }
  }, [debounceMs])

  return width
}
