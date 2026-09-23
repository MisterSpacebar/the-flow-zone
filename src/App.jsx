import { useRef, useState } from 'react'
import { toPng } from 'html-to-image'
import FlowChart from './FlowChart.jsx'
import './App.css'

const initialData = {
  inputLabel: 'INPUT\n[Need / Data]',
  outputLabel: 'OUTPUT\n[Insight / Product]',
  iterationLabel: 'Update the next cycle using validation results and instructor feedback',
  iterationLoopVisible: true,
  evidenceHeading: 'Suggested evidence under each stage:',
  newDataLink: null,
  evidenceItems: [
    { id: 1, text: 'Artifact produced' },
    { id: 2, text: 'Decision made' },
    { id: 3, text: 'Issue found' },
    { id: 4, text: 'Results obtained' },
  ],
  steps: [
    { id: 1, number: 1, title: 'Project Framing', detail: 'Question and deliverable', color: '#4f7942' },
    { id: 2, number: 2, title: 'Data Acquisition', detail: 'Sources and access', color: '#4f7942' },
    { id: 3, number: 3, title: 'Data Preparation', detail: 'Cleaning and features', color: '#e0932c' },
    { id: 4, number: 4, title: 'Exploration', detail: 'Patterns and assumptions', color: '#8f97a3' },
    { id: 5, number: 5, title: 'Model Development', detail: 'Methods and tuning', color: '#8f97a3' },
    { id: 6, number: 6, title: 'Validation', detail: 'Metrics and comparison', color: '#8f97a3' },
    { id: 7, number: 7, title: 'Interpretation', detail: 'Findings and limitations', color: '#8f97a3' },
  ],
}

function App() {
  const [data, setData] = useState(initialData)
  const [theme, setTheme] = useState('light')
  const [exporting, setExporting] = useState(false)
  const chartRef = useRef(null)

  const handleExport = async () => {
    if (!chartRef.current) return
    setExporting(true)
    try {
      const dataUrl = await toPng(chartRef.current, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: undefined,
        filter: (node) => !node.classList?.contains('export-hide'),
      })
      const link = document.createElement('a')
      link.download = 'flow-chart.png'
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Export failed', err)
      window.alert('Sorry, exporting the image failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  const handleReset = () => {
    if (window.confirm('Reset the flow chart back to the default template?')) {
      setData(initialData)
    }
  }

  return (
    <div className="app">
      <header className="toolbar">
        <h1>The Flow Zone</h1>
        <p className="subtitle">
          Click any text to edit it, click a numbered circle to cycle its color. Click the ⤴ on Validation or
          Interpretation, then a box (1-4), for a new-data arrow.
        </p>
        <div className="actions">
          <button type="button" onClick={handleReset} className="btn btn-secondary">
            Reset
          </button>
          <button
            type="button"
            onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
            className="btn btn-secondary"
          >
            {theme === 'light' ? 'Preview on dark' : 'Preview on light'}
          </button>
          <button type="button" onClick={handleExport} disabled={exporting} className="btn btn-primary">
            {exporting ? 'Exporting…' : 'Export as PNG'}
          </button>
        </div>
      </header>

      <main className={`canvas ${theme === 'dark' ? 'canvas-dark' : ''}`}>
        <FlowChart data={data} setData={setData} theme={theme} ref={chartRef} />
      </main>
    </div>
  )
}

export default App
