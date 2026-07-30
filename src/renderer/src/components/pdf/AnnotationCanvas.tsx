import { useEffect, useRef } from 'react'
import { MessageCircle, Sparkles } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import type { Annotation, AnnotationPoint, AnnotationShapeType } from '@shared/types/entities'

const MAX_DEVICE_PIXEL_RATIO = 2

interface LiveShape {
  shapeType: Extract<AnnotationShapeType, 'circle' | 'rectangle'>
  points: [AnnotationPoint, AnnotationPoint]
}

interface AnnotationCanvasProps {
  cssWidth: number
  cssHeight: number
  annotations: Annotation[]
  liveStroke: AnnotationPoint[] | null
  liveShape: LiveShape | null
  liveColor: string
  liveStrokeWidth: number
  onMarkerClick: (annotation: Annotation) => void
}

export function AnnotationCanvas({
  cssWidth,
  cssHeight,
  annotations,
  liveStroke,
  liveShape,
  liveColor,
  liveStrokeWidth,
  onMarkerClick
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

    const strokePath = (points: AnnotationPoint[], color: string, strokeWidth: number): void => {
      if (points.length < 2) return
      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth * dpr
      ctx.beginPath()
      points.forEach((p, i) => {
        const x = p.x * canvas.width
        const y = p.y * canvas.height
        if (i === 0) ctx.moveTo(x, y)
        else ctx.lineTo(x, y)
      })
      ctx.stroke()
    }

    const strokeBoxShape = (
      shapeType: 'circle' | 'rectangle',
      [a, b]: [AnnotationPoint, AnnotationPoint],
      color: string,
      strokeWidth: number
    ): void => {
      const x1 = a.x * canvas.width
      const y1 = a.y * canvas.height
      const x2 = b.x * canvas.width
      const y2 = b.y * canvas.height
      const left = Math.min(x1, x2)
      const top = Math.min(y1, y2)
      const width = Math.abs(x2 - x1)
      const height = Math.abs(y2 - y1)

      ctx.strokeStyle = color
      ctx.lineWidth = strokeWidth * dpr
      ctx.beginPath()
      if (shapeType === 'rectangle') {
        ctx.strokeRect(left, top, width, height)
      } else {
        ctx.ellipse(left + width / 2, top + height / 2, width / 2, height / 2, 0, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    for (const annotation of annotations) {
      if (annotation.shapeType === 'freehand') {
        strokePath(annotation.points, annotation.color, annotation.strokeWidth)
      } else if (
        (annotation.shapeType === 'circle' || annotation.shapeType === 'rectangle') &&
        annotation.points.length === 2
      ) {
        strokeBoxShape(
          annotation.shapeType,
          [annotation.points[0], annotation.points[1]],
          annotation.color,
          annotation.strokeWidth
        )
      }
    }
    if (liveStroke) strokePath(liveStroke, liveColor, liveStrokeWidth)
    if (liveShape) strokeBoxShape(liveShape.shapeType, liveShape.points, liveColor, liveStrokeWidth)
  }, [
    annotations,
    renderWidth,
    renderHeight,
    liveStroke,
    liveShape,
    liveColor,
    liveStrokeWidth,
    dpr
  ])

  const pins = annotations.filter((a) => a.shapeType === 'pin' && a.points.length > 0)
  const texts = annotations.filter((a) => a.shapeType === 'text' && a.points.length > 0)

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
            onMarkerClick(pin)
          }}
          className={cn(
            'pointer-events-auto absolute flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/50 shadow',
            pin.authorType === 'ai' && pin.resolvedAt !== null && 'opacity-50'
          )}
          style={{
            left: `${pin.points[0].x * 100}%`,
            top: `${pin.points[0].y * 100}%`,
            backgroundColor: pin.color
          }}
          title={pin.commentText ?? ''}
        >
          {pin.authorType === 'ai' ? (
            <Sparkles className="h-3 w-3 text-white" />
          ) : (
            <MessageCircle className="h-3 w-3 text-white" />
          )}
        </button>
      ))}
      {texts.map((text) => (
        <button
          key={text.id}
          onClick={(e) => {
            e.stopPropagation()
            onMarkerClick(text)
          }}
          className="pointer-events-auto absolute -translate-y-1/2 whitespace-pre-wrap rounded bg-bg/70 px-1 py-0.5 text-left text-xs font-medium shadow"
          style={{
            left: `${text.points[0].x * 100}%`,
            top: `${text.points[0].y * 100}%`,
            color: text.color
          }}
          title="Click to delete"
        >
          {text.commentText}
        </button>
      ))}
    </div>
  )
}
