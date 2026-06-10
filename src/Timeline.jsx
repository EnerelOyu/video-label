import React, { useRef, useCallback } from 'react'
import { textColorFor, fmtTime } from './utils'

const MIN_DUR = 0.2 // minimum segment length in seconds

export default function Timeline({
  segments,
  totalDuration,
  colorMap,
  currentTime,
  selectedIndex,
  onSeek,
  onSelect,
  onMoveBoundary,
}) {
  const trackRef = useRef(null)
  const dragRef = useRef(null)

  const timeFromClientX = useCallback(
    (clientX) => {
      const rect = trackRef.current.getBoundingClientRect()
      const ratio = (clientX - rect.left) / rect.width
      return Math.max(0, Math.min(totalDuration, ratio * totalDuration))
    },
    [totalDuration]
  )

  const segmentAtTime = useCallback(
    (t) => {
      for (let i = 0; i < segments.length; i++) {
        if (t >= segments[i].start_time && t < segments[i].end_time) return i
      }
      return segments.length ? segments.length - 1 : -1
    },
    [segments]
  )

  const handleTrackClick = (e) => {
    if (dragRef.current) return
    const t = timeFromClientX(e.clientX)
    onSeek(t)
    const idx = segmentAtTime(t)
    if (idx >= 0) onSelect(idx)
  }

  // Boundary between segment[i] and segment[i+1]
  const startBoundaryDrag = (boundaryIndex) => (e) => {
    e.stopPropagation()
    e.preventDefault()
    dragRef.current = { boundaryIndex }
    const move = (ev) => {
      const t = timeFromClientX(ev.clientX)
      const left = segments[boundaryIndex]
      const right = segments[boundaryIndex + 1]
      const clamped = Math.max(
        left.start_time + MIN_DUR,
        Math.min(right.end_time - MIN_DUR, t)
      )
      onMoveBoundary(boundaryIndex, clamped)
    }
    const up = () => {
      dragRef.current = null
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  if (!totalDuration) return null

  const playheadPct = (currentTime / totalDuration) * 100

  // Time axis ticks
  const tickStep = niceStep(totalDuration)
  const ticks = []
  for (let t = 0; t <= totalDuration + 0.001; t += tickStep) ticks.push(t)

  return (
    <div className="timeline-wrap">
      <div className="timeline-track" ref={trackRef} onClick={handleTrackClick}>
        {segments.map((seg, i) => {
          const left = (seg.start_time / totalDuration) * 100
          const width = ((seg.end_time - seg.start_time) / totalDuration) * 100
          const bg = colorMap[seg.label] || '#888'
          const selected = i === selectedIndex
          return (
            <div
              key={i}
              className={'segment' + (selected ? ' selected' : '')}
              style={{
                left: left + '%',
                width: width + '%',
                background: bg,
                color: textColorFor(bg),
              }}
              title={`${seg.label}\n${fmtTime(seg.start_time)} – ${fmtTime(seg.end_time)}`}
            >
              {width > 3 && <span className="segment-label">{seg.label}</span>}
            </div>
          )
        })}

        {/* boundary drag handles */}
        {segments.slice(0, -1).map((seg, i) => {
          const pos = (seg.end_time / totalDuration) * 100
          return (
            <div
              key={'h' + i}
              className="boundary-handle"
              style={{ left: pos + '%' }}
              onPointerDown={startBoundaryDrag(i)}
              onClick={(e) => e.stopPropagation()}
            />
          )
        })}

        {/* playhead */}
        <div className="playhead" style={{ left: playheadPct + '%' }} />
      </div>

      <div className="axis">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="tick"
            style={{ left: (t / totalDuration) * 100 + '%' }}
          >
            <span>{fmtTime(t)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function niceStep(total) {
  // aim for ~10 ticks
  const target = total / 10
  const pow = Math.pow(10, Math.floor(Math.log10(target)))
  const candidates = [1, 2, 5, 10].map((m) => m * pow)
  return candidates.find((c) => c >= target) || candidates[candidates.length - 1]
}
