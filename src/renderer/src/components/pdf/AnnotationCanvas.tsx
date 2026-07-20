import { useEffect, useRef } from 'react'
import { MessageCircle } from 'lucide-react'
import type { Annotation, AnnotationPoint } from '@shared/types/entities'

const MAX_DEVICE_PIXEL_RATIO = 2

interface AnnotationCanvasProps {
  cssWidth: number
  cssHeight: number
  annotations: Annotation[]
  liveStroke: AnnotationPoint[] | null
  liveColor: string
  onPinClick: (annotation: Annotation) => void
}

export function AnnotationCanvas({
  cssWidth,
  cssHeight,
  annotations,
  liveStroke,
  liveColor,
  onPinClick
}: AnnotationCanvasProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DEVICE_PIXEL_RATIO)
  const renderWidth = Math.round(cssWidth * dpr)
  const renderHeight = Math.round(cssHeight * dpr)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 2.5 * dpr

    const strokePath = (points: AnnotationPoint[], color: string): void => {
      if (points.length < 2) return
      ctx.strokeStyle = color
      ctx.beginPath()
      points.forEach((p, i) => {
        const x = p.x * canvas.width
        const y = p.y * canvas.height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    for (const annotation of annotations) {
      if (annotation.shapeType === 'freehand') strokePath(annotation.points, annotation.color)
    }
    if (liveStroke) strokePath(liveStroke, liveColor)
  }, [annotations, renderWidth, renderHeight, liveStroke, liveColor, dpr])

  const pins = annotations.filter((a) => a.shapeType === 'pin' && a.points.length > 0)

  return (
    <div
      className="pointer-events-none absolute left-0 top-0"
      style={{ width: cssWidth, height: cssHeight }}
    >
      <canvas
        ref={canvasRef}
        width={renderWidth}
        height={renderHeight}
        style={{ width: cssWidth, height: cssHeight }}
        className="absolute left-0 top-0"
      />
      {pins.map((pin) => (
        <button
          key={pin.id}
          onClick={(e) => {
            e.stopPropagation()
            onPinClick(pin)
          }}
          className="pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 shadow"
          style={{
            left: `${pin.points[0].x * 100}%`,
            top: `${pin.points[0].y * 100}%`,
            backgroundColor: pin.color
          }}
          title={pin.commentText ?? ''}
        >
          <MessageCircle className="h-3 w-3 text-white" />
        </button>
      ))}
    </div>
  )
}
