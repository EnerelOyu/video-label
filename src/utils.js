// Colors matching the reference comparison chart, with a fallback palette
// for any labels not explicitly listed.
export const KNOWN_COLORS = {
  kids: '#2dd4a7',
  arts_culture: '#8b5cf6',
  educational_informative: '#2a9d8f',
  advertisements: '#e9c46a',
  entertainment: '#ec1e8c',
  society_politics: '#3a5a9f',
  movies: '#e63946',
  news: '#f4a261',
  sports: '#06b6d4',
  music: '#d946ef',
  documentary: '#84cc16',
}

const FALLBACK_PALETTE = [
  '#f97316', '#0ea5e9', '#a855f7', '#14b8a6', '#ef4444',
  '#eab308', '#22c55e', '#6366f1', '#db2777', '#64748b',
]

// Returns a stable color map for the given set of labels. Known labels keep
// their canonical color; unknown ones get assigned from the fallback palette
// in first-seen order.
export function buildColorMap(labels) {
  const map = {}
  let fb = 0
  for (const label of labels) {
    if (KNOWN_COLORS[label]) {
      map[label] = KNOWN_COLORS[label]
    } else {
      map[label] = FALLBACK_PALETTE[fb % FALLBACK_PALETTE.length]
      fb++
    }
  }
  return map
}

// Pick black or white text depending on background luminance.
export function textColorFor(hex) {
  const c = hex.replace('#', '')
  const r = parseInt(c.slice(0, 2), 16)
  const g = parseInt(c.slice(2, 4), 16)
  const b = parseInt(c.slice(4, 6), 16)
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return lum > 0.6 ? '#1a1a1a' : '#ffffff'
}

// Format seconds as H:MM:SS or M:SS.
export function fmtTime(sec) {
  if (!isFinite(sec)) return '0:00'
  sec = Math.max(0, sec)
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const pad = (n) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

// Parse the uploaded JSON into a normalized segment array. Accepts either a
// bare array of segments or an object with a `segments` / `labels` array.
export function parseSegments(raw) {
  let arr = raw
  if (!Array.isArray(raw)) {
    arr = raw.segments || raw.labels || raw.timeline || raw.data
  }
  if (!Array.isArray(arr)) {
    throw new Error('JSON must be an array of segments (or have a "segments" array).')
  }
  const segs = arr.map((s, i) => {
    const start = Number(s.start_time ?? s.start ?? s.from)
    const end = Number(s.end_time ?? s.end ?? s.to)
    const label = String(s.label ?? s.class ?? s.category ?? 'unlabeled')
    if (!isFinite(start) || !isFinite(end)) {
      throw new Error(`Segment ${i} has invalid start/end time.`)
    }
    return { start_time: start, end_time: end, label }
  })
  segs.sort((a, b) => a.start_time - b.start_time)
  return segs
}

// Serialize back to the original on-disk format.
export function serializeSegments(segments) {
  const sorted = [...segments].sort((a, b) => a.start_time - b.start_time)
  return sorted.map((s) => ({
    start_time: s.start_time,
    end_time: s.end_time,
    label: s.label,
  }))
}
