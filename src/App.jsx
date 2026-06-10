import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react'
import Timeline from './Timeline.jsx'
import {
  buildColorMap,
  parseSegments,
  serializeSegments,
  fmtTime,
  KNOWN_COLORS,
} from './utils'

const MIN_DUR = 0.2

export default function App() {
  const [videoUrl, setVideoUrl] = useState(null)
  const [videoName, setVideoName] = useState('')
  const [videoDuration, setVideoDuration] = useState(0)

  const [segments, setSegments] = useState([])
  const [jsonName, setJsonName] = useState('labels.json')
  const [extraLabels, setExtraLabels] = useState([])

  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [error, setError] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const videoRef = useRef(null)
  const rafRef = useRef(null)

  const maxEnd = useMemo(
    () => segments.reduce((m, s) => Math.max(m, s.end_time), 0),
    [segments]
  )
  const totalDuration = Math.max(videoDuration || 0, maxEnd || 0)

  const allLabels = useMemo(() => {
    const set = new Set([
      ...segments.map((s) => s.label),
      ...extraLabels,
      ...Object.keys(KNOWN_COLORS),
    ])
    return Array.from(set)
  }, [segments, extraLabels])

  const colorMap = useMemo(() => buildColorMap(allLabels), [allLabels])

  // ---- rAF playhead sync (smoother than timeupdate) ----
  useEffect(() => {
    if (!playing) return
    const loop = () => {
      const v = videoRef.current
      if (v) setCurrentTime(v.currentTime)
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing])

  // ---- file handlers ----
  const onVideoFile = (file) => {
    if (!file) return
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    setVideoUrl(URL.createObjectURL(file))
    setVideoName(file.name)
  }

  const onJsonFile = async (file) => {
    if (!file) return
    try {
      const text = await file.text()
      const segs = parseSegments(JSON.parse(text))
      setSegments(segs)
      setJsonName(file.name)
      setSelectedIndex(segs.length ? 0 : -1)
      setError('')
    } catch (e) {
      setError('JSON алдаа: ' + e.message)
    }
  }

  // ---- seeking ----
  const seek = useCallback((t) => {
    const v = videoRef.current
    if (v && isFinite(t)) v.currentTime = t
    setCurrentTime(t)
  }, [])

  // ---- editing ----
  const moveBoundary = useCallback((i, t) => {
    setSegments((prev) => {
      const next = prev.map((s) => ({ ...s }))
      next[i].end_time = round(t)
      next[i + 1].start_time = round(t)
      return next
    })
  }, [])

  const changeLabel = (idx, label) => {
    setSegments((prev) => prev.map((s, i) => (i === idx ? { ...s, label } : s)))
  }

  const updateTime = (idx, field, value) => {
    const num = Number(value)
    if (!isFinite(num)) return
    setSegments((prev) => {
      const next = prev.map((s) => ({ ...s }))
      const seg = next[idx]
      if (field === 'start_time') {
        const min = idx > 0 ? next[idx - 1].start_time + MIN_DUR : 0
        const max = seg.end_time - MIN_DUR
        seg.start_time = round(clamp(num, min, max))
        if (idx > 0) next[idx - 1].end_time = seg.start_time
      } else {
        const min = seg.start_time + MIN_DUR
        const max = idx < next.length - 1 ? next[idx + 1].end_time - MIN_DUR : totalDuration
        seg.end_time = round(clamp(num, min, max))
        if (idx < next.length - 1) next[idx + 1].start_time = seg.end_time
      }
      return next
    })
  }

  const splitAtPlayhead = () => {
    const t = currentTime
    const idx = segments.findIndex(
      (s) => t > s.start_time + MIN_DUR && t < s.end_time - MIN_DUR
    )
    if (idx < 0) {
      setError('Playhead segment-ийн дунд биш байна (хуваах боломжгүй).')
      return
    }
    setSegments((prev) => {
      const next = []
      prev.forEach((s, i) => {
        if (i === idx) {
          next.push({ ...s, end_time: round(t) })
          next.push({ ...s, start_time: round(t) })
        } else {
          next.push({ ...s })
        }
      })
      return next
    })
    setSelectedIndex(idx + 1)
    setError('')
  }

  const deleteSegment = (idx) => {
    setSegments((prev) => {
      if (prev.length <= 1) return prev
      const next = prev.map((s) => ({ ...s }))
      const removed = next[idx]
      // fill the gap: extend previous segment, else pull next back
      if (idx > 0) next[idx - 1].end_time = removed.end_time
      else if (idx < next.length - 1) next[idx + 1].start_time = removed.start_time
      next.splice(idx, 1)
      return next
    })
    setSelectedIndex((i) => Math.max(0, Math.min(i, segments.length - 2)))
  }

  const addLabel = (label) => {
    const name = (typeof label === 'string' ? label : newLabel).trim()
    if (!name) return
    if (!allLabels.includes(name)) setExtraLabels((p) => [...p, name])
    if (selectedIndex >= 0) changeLabel(selectedIndex, name)
    setNewLabel('')
  }

  const download = () => {
    const data = serializeSegments(segments)
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = jsonName.replace(/\.json$/i, '') + '.edited.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  const togglePlay = () => {
    const v = videoRef.current
    if (!v) return
    if (v.paused) v.play()
    else v.pause()
  }

  const sel = selectedIndex >= 0 ? segments[selectedIndex] : null

  return (
    <div className="app">
      <header>
        <h1>Label Editor</h1>
        <div className="loaders">
          <label className="file-btn">
            🎬 Видео
            <input
              type="file"
              accept="video/*"
              onChange={(e) => onVideoFile(e.target.files[0])}
            />
          </label>
          <label className="file-btn">
            📄 JSON
            <input
              type="file"
              accept=".json,application/json"
              onChange={(e) => onJsonFile(e.target.files[0])}
            />
          </label>
          <button
            className="download-btn"
            onClick={download}
            disabled={!segments.length}
          >
            ⬇ JSON татах
          </button>
        </div>
      </header>

      {error && <div className="error">{error}</div>}

      <div className="video-area">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            onLoadedMetadata={(e) => setVideoDuration(e.target.duration)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            onSeeked={(e) => setCurrentTime(e.target.currentTime)}
            onTimeUpdate={(e) => !playing && setCurrentTime(e.target.currentTime)}
          />
        ) : (
          <div className="placeholder">🎬 Видео файл оруулна уу</div>
        )}
      </div>

      <div className="controls-row">
        <button onClick={togglePlay} disabled={!videoUrl}>
          {playing ? '⏸ Зогсоох' : '▶ Тоглуулах'}
        </button>
        <span className="time-readout">
          {fmtTime(currentTime)} / {fmtTime(totalDuration)}
        </span>
        {videoDuration > 0 && Math.abs(videoDuration - maxEnd) > 1 && (
          <span className="warn">
            ⚠ Видеоны урт ({fmtTime(videoDuration)}) ба labels-ийн төгсгөл (
            {fmtTime(maxEnd)}) зөрж байна
          </span>
        )}
      </div>

      {segments.length > 0 && (
        <Timeline
          segments={segments}
          totalDuration={totalDuration}
          colorMap={colorMap}
          currentTime={currentTime}
          selectedIndex={selectedIndex}
          onSeek={seek}
          onSelect={setSelectedIndex}
          onMoveBoundary={moveBoundary}
        />
      )}

      {sel && (
        <div className="editor">
          <h3>
            Segment #{selectedIndex + 1} / {segments.length}
          </h3>
          <div className="editor-grid">
            <label>
              Эхлэл (с)
              <input
                type="number"
                step="0.1"
                value={sel.start_time}
                onChange={(e) => updateTime(selectedIndex, 'start_time', e.target.value)}
              />
            </label>
            <label>
              Төгсгөл (с)
              <input
                type="number"
                step="0.1"
                value={sel.end_time}
                onChange={(e) => updateTime(selectedIndex, 'end_time', e.target.value)}
              />
            </label>
            <label>
              Label
              <select
                value={sel.label}
                onChange={(e) => changeLabel(selectedIndex, e.target.value)}
              >
                {allLabels.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="editor-actions">
            <input
              className="new-label-input"
              placeholder="Сонгох эсвэл шинэ label нэр бичих"
              list="label-presets"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLabel()}
            />
            <datalist id="label-presets">
              {Object.keys(KNOWN_COLORS).map((l) => (
                <option key={l} value={l} />
              ))}
            </datalist>
            <button onClick={addLabel}>+ Label нэмэх</button>
            <button onClick={() => seek(sel.start_time)}>Segment-ын эхэнд очих</button>
            <button onClick={splitAtPlayhead}>Segemnt-ыг хуваах</button>
            <button className="danger" onClick={() => deleteSegment(selectedIndex)}>
              Устгах
            </button>
          </div>

          <div className="label-presets">
            <span className="label-presets-title">Нийтлэг сонголтууд:</span>
            {Object.keys(KNOWN_COLORS).map((l) => (
              <button
                key={l}
                type="button"
                className={'preset-chip' + (sel.label === l ? ' active' : '')}
                onClick={() => addLabel(l)}
              >
                <span className="swatch" style={{ background: colorMap[l] }} />
                {l}
              </button>
            ))}
          </div>

          <div className="legend">
            {allLabels
              .filter((l) => segments.some((s) => s.label === l))
              .map((l) => (
                <span key={l} className="legend-item">
                  <span className="swatch" style={{ background: colorMap[l] }} />
                  {l}
                </span>
              ))}
          </div>
        </div>
      )}

      {!segments.length && (
        <div className="hint">
          Видео болон timeline JSON файлаа оруулаад эхлээрэй. JSON формат:
          <code>{'[{ "start_time": 0.0, "end_time": 138.0, "label": "advertisements" }, ...]'}</code>
        </div>
      )}
    </div>
  )
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}
function round(v) {
  return Math.round(v * 100) / 100
}
