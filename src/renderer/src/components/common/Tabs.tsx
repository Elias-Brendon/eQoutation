import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

export interface TabItem<T extends string> {
  value: T
  label: string
}

interface TabsProps<T extends string> {
  items: TabItem<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}

export function Tabs<T extends string>({
  items,
  value,
  onChange,
  className
}: TabsProps<T>): React.JSX.Element {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  // Padding at each end of the strip so the first/last tab can be scrolled to
  // dead-center too, the same as every tab in between — sized to half the
  // visible width minus half that edge tab's own width.
  const [startSpacer, setStartSpacer] = useState(0)
  const [endSpacer, setEndSpacer] = useState(0)

  const updateArrows = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 1)
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
  }, [])

  const updateEdgeSpacers = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const buttons = el.querySelectorAll<HTMLButtonElement>('button[data-tab-value]')
    const first = buttons[0]
    const last = buttons[buttons.length - 1]
    if (!first || !last) return
    setStartSpacer(Math.max(0, el.clientWidth / 2 - first.offsetWidth / 2))
    setEndSpacer(Math.max(0, el.clientWidth / 2 - last.offsetWidth / 2))
  }, [])

  // Re-measure whenever the tab list or container size changes — overflow
  // (and therefore arrow visibility) and the edge padding both depend on it.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    updateArrows()
    updateEdgeSpacers()
    const observer = new ResizeObserver(() => {
      updateArrows()
      updateEdgeSpacers()
    })
    observer.observe(el)
    el.addEventListener('scroll', updateArrows, { passive: true })
    return () => {
      observer.disconnect()
      el.removeEventListener('scroll', updateArrows)
    }
  }, [updateArrows, updateEdgeSpacers, items.length])

  // Center the active tab whenever it changes — programmatic resets included,
  // not just clicks — so the current panel always sits in the middle with
  // its neighbors peeking on either side.
  useEffect(() => {
    const el = scrollRef.current
    const button = el?.querySelector<HTMLButtonElement>(`[data-tab-value="${value}"]`)
    if (!el || !button) return
    const target = button.offsetLeft + button.offsetWidth / 2 - el.clientWidth / 2
    el.scrollTo({ left: target, behavior: 'smooth' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, startSpacer, endSpacer])

  const scrollByOneTab = (direction: 1 | -1): void => {
    const el = scrollRef.current
    if (!el) return
    const tabWidth = el.querySelector<HTMLButtonElement>('button[data-tab-value]')?.offsetWidth ?? 100
    el.scrollBy({ left: direction * (tabWidth + 4), behavior: 'smooth' })
  }

  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-1 rounded-md border border-border p-0.5',
        className
      )}
    >
      {canScrollLeft && (
        <button
          type="button"
          onClick={() => scrollByOneTab(-1)}
          aria-label="Scroll tabs left"
          className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}
      <div
        ref={scrollRef}
        role="tablist"
        className="flex min-w-0 flex-1 snap-x snap-mandatory gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div aria-hidden className="shrink-0" style={{ width: startSpacer }} />
        {items.map((item) => (
          <button
            key={item.value}
            data-tab-value={item.value}
            role="tab"
            aria-selected={item.value === value}
            onClick={() => onChange(item.value)}
            className={cn(
              'shrink-0 snap-center rounded px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer',
              item.value === value
                ? 'bg-surface-hover text-text-primary'
                : 'text-text-muted hover:text-text-secondary'
            )}
          >
            {item.label}
          </button>
        ))}
        <div aria-hidden className="shrink-0" style={{ width: endSpacer }} />
      </div>
      {canScrollRight && (
        <button
          type="button"
          onClick={() => scrollByOneTab(1)}
          aria-label="Scroll tabs right"
          className="shrink-0 rounded p-1 text-text-muted hover:bg-surface-hover hover:text-text-primary"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}
