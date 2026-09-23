import { forwardRef, useLayoutEffect, useRef, useState } from 'react'
import './FlowChart.css'

const DEFAULT_SWATCHES = [
  { label: 'Completed', color: '#4f7942' },
  { label: 'In progress', color: '#e0932c' },
  { label: 'Next step', color: '#8f97a3' },
]

const LINK_SOURCE_IDS = new Set([6, 7])
const LINK_TARGET_IDS = new Set([1, 2, 3, 4])

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
  const [linkGeometry, setLinkGeometry] = useState(null)

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

  const handleToggleLinkSource = (id) => {
    if (data.newDataLink?.from === id) {
      setData((prev) => ({ ...prev, newDataLink: null }))
      setLinkingFrom(null)
      return
    }
    setLinkingFrom((prev) => (prev === id ? null : id))
  }

  const handlePickLinkTarget = (targetId) => {
    if (linkingFrom == null) return
    setData((prev) => ({ ...prev, newDataLink: { from: linkingFrom, to: targetId, label: 'New data' } }))
    setLinkingFrom(null)
  }

  const updateLinkLabel = (label) =>
    setData((prev) => ({ ...prev, newDataLink: { ...prev.newDataLink, label } }))

  // Recompute the dashed connector's SVG path whenever the link, box text,
  // or container size changes so it always points at the box centers.
  useLayoutEffect(() => {
    const link = data.newDataLink
    if (!link || !containerRef.current) {
      setLinkGeometry(null)
      return undefined
    }
    const fromEl = boxRefs.current[link.from]
    const toEl = boxRefs.current[link.to]
    if (!fromEl || !toEl) {
      setLinkGeometry(null)
      return undefined
    }

    const update = () => {
      const containerRect = containerRef.current.getBoundingClientRect()
      const fromRect = fromEl.getBoundingClientRect()
      const toRect = toEl.getBoundingClientRect()
      const ax = fromRect.left + fromRect.width / 2 - containerRect.left
      const ay = fromRect.top - containerRect.top
      const dx = toRect.left + toRect.width / 2 - containerRect.left
      const dy = toRect.top - containerRect.top
      const topY = -22
      // Midpoint (t=0.5) of the cubic bezier, used to anchor the label near the arc's peak.
      const labelX = (ax + dx) / 2
      const labelY = 0.125 * (ay + dy) + 0.75 * topY
      setLinkGeometry({
        path: `M ${ax} ${ay} C ${ax} ${topY}, ${dx} ${topY}, ${dx} ${dy}`,
        arrowHead: `${dx - 5},${dy - 9} ${dx + 5},${dy - 9} ${dx},${dy}`,
        width: containerRect.width,
        height: containerRect.height,
        labelX,
        labelY,
      })
    }

    update()
    const resizeObserver = new ResizeObserver(update)
    resizeObserver.observe(containerRef.current)
    window.addEventListener('resize', update)
    return () => {
      resizeObserver.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [data.newDataLink, data.steps])

  const [s1, s2, s3, s4, s5, s6, s7] = data.steps

  // Resolved (not CSS-variable) colors for the SVG connector, since some
  // PNG export libraries don't inline var()-based fill/stroke correctly.
  const lineColor = theme === 'dark' ? '#7fb3e6' : '#2d5f8a'
  const labelBg = theme === 'dark' ? 'rgba(43, 45, 49, 0.85)' : 'rgba(255, 255, 255, 0.85)'

  return (
    <div className={`flowchart theme-${theme}`} ref={setContainerRefs}>
      {linkGeometry && (
        <>
          <svg
            className="connector-svg"
            width={linkGeometry.width}
            height={linkGeometry.height}
            aria-hidden="true"
          >
            <path
              d={linkGeometry.path}
              fill="none"
              stroke={lineColor}
              strokeWidth={2.5}
              strokeDasharray="7 6"
              style={{ fill: 'none', stroke: lineColor, strokeWidth: 2.5, strokeDasharray: '7 6' }}
            />
            <polygon points={linkGeometry.arrowHead} fill={lineColor} style={{ fill: lineColor }} />
          </svg>
          <div
            className="connector-label-wrap"
            style={{ left: linkGeometry.labelX, top: linkGeometry.labelY }}
          >
            <Editable
              className="connector-label"
              value={data.newDataLink.label}
              onChange={updateLinkLabel}
              style={{ color: lineColor, background: labelBg }}
            />
          </div>
        </>
      )}
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
          hasOutgoingLink={data.newDataLink?.from === s7.id}
          onToggleLinkSource={handleToggleLinkSource}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow direction="left" />
        <StepCard
          step={s6}
          onChange={(v) => updateStep(s6.id, v)}
          registerRef={registerBoxRef(s6.id)}
          linkingFrom={linkingFrom}
          hasOutgoingLink={data.newDataLink?.from === s6.id}
          onToggleLinkSource={handleToggleLinkSource}
          onPickLinkTarget={handlePickLinkTarget}
        />
        <Arrow direction="left" />
        <StepCard
          step={s5}
          onChange={(v) => updateStep(s5.id, v)}
          registerRef={registerBoxRef(s5.id)}
          linkingFrom={linkingFrom}
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
          </div>
          <div className="step-spacer" />
        </div>
      )}

      <div className="flow-footer">
        <div className="evidence-box">
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
