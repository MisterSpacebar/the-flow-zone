import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import './FlowChart.css'

const DEFAULT_SWATCHES = [
  { label: 'Completed', color: '#4f7942' },
  { label: 'In progress', color: '#e0932c' },
  { label: 'Next step', color: '#8f97a3' },
]

const LINK_SOURCE_IDS = new Set([5, 6, 7])
const LINK_TARGET_IDS = new Set([1, 2, 3, 4])

const LINK_COLORS = {
  5: { light: '#2d5f8a', dark: '#7fb3e6' },
  6: { light: '#8a4fd1', dark: '#c9a6f0' },
  7: { light: '#c9812f', dark: '#f2c08a' },
}

// Step 5's connector always arcs highest ("stays on top"); 6 and 7 share the
// same, lower arc height so their thin dashed lines may cross, which is far
// less distracting than two overlapping text labels.
const LINK_ARC_HEIGHTS = { 5: -60, 6: -30, 7: -30 }
const LABEL_WIDTH_PER_CHAR = 6.3
const LABEL_MIN_WIDTH = 70
const LABEL_HEIGHT = 22

function estimateLabelWidth(text) {
  return Math.max(LABEL_MIN_WIDTH, (text || '').length * LABEL_WIDTH_PER_CHAR + 20)
}

// Point on a cubic bezier at parameter t, given its four control points.
function bezierPoint(p0, p1, p2, p3, t) {
  const mt = 1 - t
  const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x
  const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y
  return { x, y }
}

// Finds t in [0, 0.5] (the near-source half, where y decreases monotonically
// from the source down toward the arc's peak) whose y lands closest to
// targetY - used to place a relocated label ON the curve, in the row gap.
function findPointNearY(p0, p1, p2, p3, targetY) {
  let lo = 0
  let hi = 0.5
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2
    const y = bezierPoint(p0, p1, p2, p3, mid).y
    if (y > targetY) lo = mid
    else hi = mid
  }
  return bezierPoint(p0, p1, p2, p3, (lo + hi) / 2)
}

function labelsOverlap(a, b) {
  const ax = a.labelX - a.labelWidth / 2
  const bx = b.labelX - b.labelWidth / 2
  const ay = a.labelY - LABEL_HEIGHT / 2
  const by = b.labelY - LABEL_HEIGHT / 2
  return ax < bx + b.labelWidth && bx < ax + a.labelWidth && ay < by + LABEL_HEIGHT && by < ay + LABEL_HEIGHT
}

// Step 5 always keeps its default (top) position; between two others, the
// higher source id yields since that's a simple, deterministic tie-break.
function pickMover(a, b) {
  if (a.from === 5) return b
  if (b.from === 5) return a
  return a.from < b.from ? b : a
}

// When two labels would overlap, drop the lower-priority one to a point
// further down its own curve (near the source, in the gap between the two
// rows) instead of an arbitrary spot - keeping it visually attached to its arrow.
function resolveLabelOverlaps(geometries) {
  for (let i = 0; i < geometries.length; i++) {
    for (let j = i + 1; j < geometries.length; j++) {
      const a = geometries[i]
      const b = geometries[j]
      if (a.relocated || b.relocated || !labelsOverlap(a, b)) continue
      const mover = pickMover(a, b)
      const point = findPointNearY(mover.p0, mover.p1, mover.p2, mover.p3, mover.gapY)
      mover.labelX = point.x
      mover.labelY = point.y
      mover.relocated = true
    }
  }
  return geometries
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '')
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean
  const value = Number.parseInt(full, 16)
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 }
}

// Lightens a hex color by mixing it toward white, used for box fills.
function tint(hex, amount = 0.85) {
  const { r, g, b } = hexToRgb(hex)
  const mix = (c) => Math.round(c + (255 - c) * amount)
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

// Plain-text editable div. Content is set imperatively (never via JSX
// children) so React only touches the DOM when `value` changes from outside
// this element - otherwise reassigning textContent on every keystroke resets
// the caret to the start and makes typing appear to insert in reverse.
function Editable({ value, onChange, className, placeholder, style }) {
  const ref = useRef(null)

  useLayoutEffect(() => {
    if (ref.current && ref.current.textContent !== value) {
      ref.current.textContent = value
    }
  }, [value])

  return (
    <div
      ref={ref}
      className={`editable ${className || ''}`.trim()}
      style={style}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.textContent)}
    />
  )
}

function StepCard({ step, onChange, registerRef, linkingFrom, hasOutgoingLink, onToggleLinkSource, onPickLinkTarget }) {
  const cycleColor = () => {
    const swatches = DEFAULT_SWATCHES.map((s) => s.color)
    const next = swatches[(swatches.indexOf(step.color) + 1) % swatches.length]
    onChange({ ...step, color: next })
  }

  const isSource = LINK_SOURCE_IDS.has(step.id)
  const isTarget = LINK_TARGET_IDS.has(step.id)
  const isLinkingActive = linkingFrom === step.id
  const isPickableTarget = isTarget && linkingFrom != null

  const handleCardClick = () => {
    if (isPickableTarget) onPickLinkTarget(step.id)
  }

  const handleCardKeyDown = (e) => {
    if (isPickableTarget && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault()
      onPickLinkTarget(step.id)
    }
  }

  return (
    <div
      className={`step-card ${isPickableTarget ? 'step-card-pickable' : ''}`.trim()}
      style={{ background: tint(step.color), borderColor: step.color }}
      ref={registerRef}
      role={isPickableTarget ? 'button' : undefined}
      tabIndex={isPickableTarget ? 0 : undefined}
      onClick={handleCardClick}
      onKeyDown={handleCardKeyDown}
    >
      <div className="step-header">
        <button
          type="button"
          className="step-badge"
          style={{ background: step.color }}
          onClick={cycleColor}
          title="Click to cycle this box's color"
        >
          {step.number}
        </button>
        <Editable
          className="step-title"
          value={step.title}
          onChange={(title) => onChange({ ...step, title })}
        />
      </div>
      {isSource && (
        <button
          type="button"
          className={`link-handle export-hide ${isLinkingActive ? 'link-handle-active' : ''}`.trim()}
          onClick={(e) => {
            e.stopPropagation()
            onToggleLinkSource(step.id)
          }}
          title={
            hasOutgoingLink
              ? 'Click to remove the new-data arrow from this box'
              : 'Click, then pick a box (1-4) to draw a new-data arrow from here'
          }
        >
          {hasOutgoingLink ? '×' : '⤴'}
        </button>
      )}
      <Editable
        className="step-detail"
        value={step.detail}
        onChange={(detail) => onChange({ ...step, detail })}
      />
    </div>
  )
}

function Arrow({ direction = 'right' }) {
  return <div className={`arrow arrow-${direction}`} aria-hidden="true" />
}

const FlowChart = forwardRef(function FlowChart({ data, setData, theme }, forwardedRef) {
  const containerRef = useRef(null)
  const boxRefs = useRef({})
  const [linkingFrom, setLinkingFrom] = useState(null)
  const [linkGeometries, setLinkGeometries] = useState([])
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const setContainerRefs = (el) => {
    containerRef.current = el
    if (typeof forwardedRef === 'function') forwardedRef(el)
    else if (forwardedRef) forwardedRef.current = el
  }

  const registerBoxRef = (id) => (el) => {
    boxRefs.current[id] = el
  }

  const updateStep = (id, updated) => {
    setData((prev) => ({
      ...prev,
      steps: prev.steps.map((s) => (s.id === id ? updated : s)),
    }))
  }

  const updateField = (field) => (value) =>
    setData((prev) => ({ ...prev, [field]: value }))

  const updateEvidenceItem = (id, patch) =>
    setData((prev) => ({
      ...prev,
      evidenceItems: prev.evidenceItems.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }))

  const newDataLinks = data.newDataLinks || []

  const handleToggleLinkSource = (id) => {
    if (newDataLinks.some((link) => link.from === id)) {
      setData((prev) => ({
        ...prev,
        newDataLinks: (prev.newDataLinks || []).filter((link) => link.from !== id),
      }))
      setLinkingFrom(null)
      return
    }
    setLinkingFrom((prev) => (prev === id ? null : id))
  }

  const handlePickLinkTarget = (targetId) => {
    if (linkingFrom == null) return
    setData((prev) => ({
      ...prev,
      newDataLinks: [
        ...(prev.newDataLinks || []).filter((link) => link.from !== linkingFrom),
        { from: linkingFrom, to: targetId, label: 'New data' },
      ],
    }))
    setLinkingFrom(null)
  }

  const updateLinkLabel = (fromId, label) =>
    setData((prev) => ({
      ...prev,
      newDataLinks: (prev.newDataLinks || []).map((link) => (link.from === fromId ? { ...link, label } : link)),
    }))

  // Recompute each dashed connector's SVG path whenever the links, box text,
  // or container size changes so they always point at the box centers.
  useLayoutEffect(() => {
    if (!newDataLinks.length || !containerRef.current) {
      setLinkGeometries([])
      return undefined
    }

    const update = () => {
      const containerRect = containerRef.current.getBoundingClientRect()
      const geometries = newDataLinks
        .map((link) => {
          const fromEl = boxRefs.current[link.from]
          const toEl = boxRefs.current[link.to]
          if (!fromEl || !toEl) return null
          const fromRect = fromEl.getBoundingClientRect()
          const toRect = toEl.getBoundingClientRect()
          const ax = fromRect.left + fromRect.width / 2 - containerRect.left
          const ay = fromRect.top - containerRect.top
          const dx = toRect.left + toRect.width / 2 - containerRect.left
          const dy = toRect.top - containerRect.top
          const topY = LINK_ARC_HEIGHTS[link.from] ?? -22
          // Control points of the cubic bezier below, kept around so a
          // relocated label can be re-placed at a different point ON the curve.
          const p0 = { x: ax, y: ay }
          const p1 = { x: ax, y: topY }
          const p2 = { x: dx, y: topY }
          const p3 = { x: dx, y: dy }
          // Midpoint (t=0.5), used to anchor the label near the arc's peak by default.
          const { x: labelX, y: labelY } = bezierPoint(p0, p1, p2, p3, 0.5)
          // Vertical center of the empty gap between the two rows, used to
          // find a relocation point that's both on-curve and visually in the gap.
          const gapY = (ay + toRect.bottom - containerRect.top) / 2
          return {
            from: link.from,
            label: link.label,
            path: `M ${ax} ${ay} C ${ax} ${topY}, ${dx} ${topY}, ${dx} ${dy}`,
            arrowHead: `${dx - 5},${dy - 9} ${dx + 5},${dy - 9} ${dx},${dy}`,
            labelX,
            labelY,
            labelWidth: estimateLabelWidth(link.label),
            gapY,
            p0,
            p1,
            p2,
            p3,
          }
        })
        .filter(Boolean)
      setLinkGeometries(resolveLabelOverlaps(geometries))
      setContainerSize({ width: containerRect.width, height: containerRect.height })
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', update)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [data.newDataLinks, data.steps])

  const [s1, s2, s3, s4, s5, s6, s7] = data.steps

  // Resolved (not CSS-variable) colors for the SVG connectors, since some
  // PNG export libraries don't inline var()-based fill/stroke correctly.
  const labelBg = theme === 'dark' ? 'rgba(43, 45, 49, 0.85)' : 'rgba(255, 255, 255, 0.85)'

  return (
    <div className={`flowchart theme-${theme}`} ref={setContainerRefs}>
      {linkGeometries.map((geometry) => {
        const lineColor = LINK_COLORS[geometry.from]?.[theme] || (theme === 'dark' ? '#7fb3e6' : '#2d5f8a')
        return (
          <svg
            key={geometry.from}
            className="connector-svg"
            width={containerSize.width}
            height={containerSize.height}
            aria-hidden="true"
          >
            <path
              d={geometry.path}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeDasharray="7 6"
              style={{ fill: 'none', stroke: lineColor, strokeWidth: 2.5, strokeDasharray: '7 6' }}
            />
            <polygon points={geometry.arrowHead} fill={lineColor} style={{ fill: lineColor }} />
          </svg>
        )
      })}
      {linkGeometries.map((geometry) => {
        const lineColor = LINK_COLORS[geometry.from]?.[theme] || (theme === 'dark' ? '#7fb3e6' : '#2d5f8a')
        return (
          <div
            key={geometry.from}
            className="connector-label-wrap"
            style={{ left: geometry.labelX, top: geometry.labelY }}
          >
            <Editable
              className="connector-label"
              value={geometry.label}
              onChange={(label) => updateLinkLabel(geometry.from, label)}
              style={{ color: lineColor, background: labelBg }}
            />
          </div>
        )
      })}
      <div className="flow-row">
        <div className="io-box">
          <Editable className="io-label" value={data.inputLabel} onChange={updateField('inputLabel')} />
        </div>
        <Arrow />
        <StepCard
          step={s1}
          onChange={(v) => updateStep(s1.id, v)}
          registerRef={registerBoxRef(s1.id)}
          linkingFrom={linkingFrom}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow />
        <StepCard
          step={s2}
          onChange={(v) => updateStep(s2.id, v)}
          registerRef={registerBoxRef(s2.id)}
          linkingFrom={linkingFrom}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow />
        <StepCard
          step={s3}
          onChange={(v) => updateStep(s3.id, v)}
          registerRef={registerBoxRef(s3.id)}
          linkingFrom={linkingFrom}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow />
        <StepCard
          step={s4}
          onChange={(v) => updateStep(s4.id, v)}
          registerRef={registerBoxRef(s4.id)}
          linkingFrom={linkingFrom}
          onPickLinkTarget={handlePickLinkTarget}
        />
      </div>

      <div className="flow-down">
        <div className="arrow arrow-down" aria-hidden="true" />
      </div>

      <div className="flow-row">
        <div className="io-box io-box-output">
          <Editable className="io-label" value={data.outputLabel} onChange={updateField('outputLabel')} />
        </div>
        <Arrow direction="left" />
        <StepCard
          step={s7}
          onChange={(v) => updateStep(s7.id, v)}
          registerRef={registerBoxRef(s7.id)}
          linkingFrom={linkingFrom}
          hasOutgoingLink={newDataLinks.some((link) => link.from === s7.id)}
          onToggleLinkSource={handleToggleLinkSource}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow direction="left" />
        <StepCard
          step={s6}
          onChange={(v) => updateStep(s6.id, v)}
          registerRef={registerBoxRef(s6.id)}
          linkingFrom={linkingFrom}
          hasOutgoingLink={newDataLinks.some((link) => link.from === s6.id)}
          onToggleLinkSource={handleToggleLinkSource}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow direction="left" />
        <StepCard
          step={s5}
          onChange={(v) => updateStep(s5.id, v)}
          registerRef={registerBoxRef(s5.id)}
          linkingFrom={linkingFrom}
          hasOutgoingLink={newDataLinks.some((link) => link.from === s5.id)}
          onToggleLinkSource={handleToggleLinkSource}
          onPickLinkTarget={handlePickLinkTarget}
        />
      </div>

      {data.iterationLoopVisible !== false && (
        <div className="loop-row" aria-hidden="true">
          <div className="io-spacer" />
          <div className="arrow" />
          <div className="step-spacer" />
          <div className="arrow" />
          <div className="step-spacer" />
          <div className="loop-arrow-slot">
            <div className="arrow arrow-up" />
            <div className="arrow loop-arrow-down" />
          </div>
          <div className="step-spacer" />
        </div>
      )}

      <div className="flow-footer">
        {data.evidenceVisible !== false ? (
          <div className="evidence-box">
            <button
              type="button"
              className="loop-toggle loop-toggle-remove export-hide evidence-remove"
              onClick={() => updateField('evidenceVisible')(false)}
              title="Remove the suggested evidence box"
            >
              ×
            </button>
            <Editable
              className="evidence-heading"
              value={data.evidenceHeading}
              onChange={updateField('evidenceHeading')}
            />
            <ul className="evidence-list">
              {data.evidenceItems.map((item) => (
                <li key={item.id}>
                  <Editable
                    className="evidence-item"
                    value={item.text}
                    onChange={(text) => updateEvidenceItem(item.id, { text })}
                  />
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <button
            type="button"
            className="loop-toggle loop-toggle-add export-hide"
            onClick={() => updateField('evidenceVisible')(true)}
            title="Add the suggested evidence box back"
          >
            + Evidence box
          </button>
        )}

        {data.iterationLoopVisible !== false ? (
          <div className="loop-label-inner">
            <Editable
              className="iteration-label"
              value={data.iterationLabel}
              onChange={updateField('iterationLabel')}
            />
            <button
              type="button"
              className="loop-toggle loop-toggle-remove export-hide"
              onClick={() => updateField('iterationLoopVisible')(false)}
              title="Remove this loop arrow"
            >
              ×
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="loop-toggle loop-toggle-add export-hide"
            onClick={() => updateField('iterationLoopVisible')(true)}
            title="Add the loop arrow back"
          >
            + Loop arrow
          </button>
        )}

        <div className="legend">
          {DEFAULT_SWATCHES.map(({ label, color }) => (
            <div className="legend-item" key={label}>
              <span className="legend-dot" style={{ background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
})

export default FlowChart
