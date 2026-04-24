import { useState, useRef, useEffect, useCallback } from 'react'
import Vibrant from 'node-vibrant'

const CANVAS_W = 1000
const CANVAS_H = 1400

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return { r, g, b }
}

function getTextColor(hex) {
  try {
    const { r, g, b } = hexToRgb(hex)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.52 ? '#1c1917' : '#faf9f7'
  } catch {
    return '#1c1917'
  }
}

function measureLines(ctx, text, maxWidth) {
  if (!text.trim()) return []
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const candidate = line ? line + ' ' + word : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = candidate
    }
  }
  if (line) lines.push(line)
  return lines
}

function drawWrappedText(ctx, lines, x, centerY, lineHeight) {
  const totalH = lines.length * lineHeight
  const startY = centerY - totalH / 2 + lineHeight / 2
  lines.forEach((l, i) => {
    ctx.fillText(l, x, startY + i * lineHeight)
  })
  return startY + totalH - lineHeight / 2
}

export default function App() {
  const [image, setImage] = useState(null)
  const [title, setTitle] = useState('A Walk Through Color')
  const [splitRatio, setSplitRatio] = useState(0.44)
  const [fontSize, setFontSize] = useState(82)
  const [bgColor, setBgColor] = useState('#c9bba8')
  const [isDragging, setIsDragging] = useState(false)
  const [fontsReady, setFontsReady] = useState(false)

  const canvasRef = useRef(null)
  const fileInputRef = useRef(null)

  const today = new Date()
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    .toUpperCase()

  useEffect(() => {
    document.fonts.ready.then(() => setFontsReady(true))
  }, [])

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const topH = Math.round(CANVAS_H * splitRatio)
    const botH = CANVAS_H - topH

    ctx.clearRect(0, 0, CANVAS_W, CANVAS_H)

    // — Top: solid color
    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, CANVAS_W, topH)

    // — Bottom: image (cover crop) or placeholder
    if (image) {
      const imgAspect = image.width / image.height
      const targetAspect = CANVAS_W / botH
      let sx, sy, sw, sh
      if (imgAspect > targetAspect) {
        sh = image.height
        sw = image.height * targetAspect
        sx = (image.width - sw) / 2
        sy = 0
      } else {
        sw = image.width
        sh = image.width / targetAspect
        sx = 0
        sy = (image.height - sh) / 2
      }
      ctx.drawImage(image, sx, sy, sw, sh, 0, topH, CANVAS_W, botH)
    } else {
      ctx.fillStyle = '#b8afa6'
      ctx.fillRect(0, topH, CANVAS_W, botH)
      ctx.fillStyle = 'rgba(250,249,247,0.35)'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = '28px "EB Garamond", Georgia, serif'
      ctx.fillText('Upload a photo', CANVAS_W / 2, topH + botH / 2)
    }

    // — Text overlay in top half
    const textColor = getTextColor(bgColor)
    ctx.fillStyle = textColor
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    const textCenterY = topH * 0.46
    const maxTextW = CANVAS_W * 0.76
    const lineH = fontSize * 1.22

    ctx.font = `500 ${fontSize}px "Playfair Display", Georgia, serif`
    if ('letterSpacing' in ctx) ctx.letterSpacing = '1px'

    const titleLines = measureLines(ctx, title || ' ', maxTextW)
    const titleBottomY = drawWrappedText(ctx, titleLines, CANVAS_W / 2, textCenterY, lineH)

    // Thin rule
    const ruleY = titleBottomY + 28
    ctx.strokeStyle = textColor
    ctx.globalAlpha = 0.35
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(CANVAS_W / 2 - 56, ruleY)
    ctx.lineTo(CANVAS_W / 2 + 56, ruleY)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Date
    const dateFontSize = Math.round(Math.max(18, fontSize * 0.26))
    ctx.font = `400 ${dateFontSize}px "Playfair Display", Georgia, serif`
    if ('letterSpacing' in ctx) ctx.letterSpacing = '5px'
    ctx.globalAlpha = 0.75
    ctx.fillText(today, CANVAS_W / 2, ruleY + 36)
    ctx.globalAlpha = 1
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px'
  }, [image, bgColor, title, splitRatio, fontSize, today])

  useEffect(() => {
    drawCanvas()
  }, [drawCanvas, fontsReady])

  const loadFile = useCallback(async (file) => {
    if (!file || !file.type.startsWith('image/')) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = async () => {
      setImage(img)
      try {
        const palette = await Vibrant.from(url).getPalette()
        const swatch =
          palette.Vibrant ??
          palette.LightVibrant ??
          palette.Muted ??
          palette.DarkVibrant ??
          palette.LightMuted
        if (swatch) setBgColor(swatch.hex)
      } catch (err) {
        console.warn('Vibrant extraction failed:', err)
      }
    }
    img.src = url
  }, [])

  const handleFileChange = useCallback(
    (e) => loadFile(e.target.files[0]),
    [loadFile],
  )

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      setIsDragging(false)
      loadFile(e.dataTransfer.files[0])
    },
    [loadFile],
  )

  const handleExport = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const link = document.createElement('a')
    const slug = (title || 'cover').trim().replace(/\s+/g, '-').toLowerCase()
    link.download = `${slug}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [title])

  const PREVIEW_W = 380
  const previewH = Math.round((PREVIEW_W / CANVAS_W) * CANVAS_H)

  return (
    <div className="min-h-screen bg-stone-50" style={{ fontFamily: "'EB Garamond', Georgia, serif" }}>
      {/* Header */}
      <header className="border-b border-stone-200 px-10 py-5">
        <div className="max-w-5xl mx-auto flex items-baseline gap-4">
          <span className="text-xl tracking-widest text-stone-800" style={{ letterSpacing: '0.15em' }}>
            COLORWALK
          </span>
          <span
            className="text-sm text-stone-400"
            style={{ fontFamily: "'EB Garamond', Georgia, serif", fontStyle: 'italic' }}
          >
            cover generator
          </span>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-10 py-14 flex gap-14 items-start">
        {/* ── Canvas preview ── */}
        <div className="flex-shrink-0 flex flex-col items-center gap-3">
          <div
            className={`relative overflow-hidden cursor-pointer transition-shadow duration-200 ${
              isDragging ? 'shadow-lg ring-1 ring-stone-400' : 'shadow-sm'
            }`}
            style={{ width: PREVIEW_W, height: previewH, background: '#e7e3de' }}
            onClick={() => fileInputRef.current?.click()}
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault()
              setIsDragging(true)
            }}
            onDragLeave={() => setIsDragging(false)}
          >
            <canvas
              ref={canvasRef}
              width={CANVAS_W}
              height={CANVAS_H}
              style={{ width: '100%', height: '100%', display: 'block' }}
            />
            {isDragging && (
              <div className="absolute inset-0 flex items-center justify-center bg-stone-900/20">
                <span className="text-white text-sm tracking-widest uppercase">Drop image</span>
              </div>
            )}
          </div>
          <p
            className="text-xs text-stone-400 tracking-widest uppercase"
            style={{ letterSpacing: '0.12em' }}
          >
            {CANVAS_W} × {CANVAS_H} · Click or drag to upload
          </p>
        </div>

        {/* ── Controls ── */}
        <div className="flex-1 flex flex-col gap-9 pt-1">
          {/* Upload */}
          <Section label="Photo">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-2.5 border border-stone-300 text-stone-600 text-sm tracking-wide hover:border-stone-500 hover:text-stone-800 transition-colors duration-150"
              style={{ letterSpacing: '0.08em' }}
            >
              {image ? 'Replace photo' : 'Upload photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </Section>

          {/* Title */}
          <Section label="Title">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full border-b border-stone-200 focus:border-stone-600 outline-none py-1.5 text-stone-800 text-lg bg-transparent transition-colors"
              style={{ fontFamily: "'Playfair Display', Georgia, serif" }}
              placeholder="Enter a title…"
            />
          </Section>

          {/* Date */}
          <Section label="Date">
            <p
              className="text-stone-500 text-sm tracking-widest"
              style={{ letterSpacing: '0.1em', fontStyle: 'italic' }}
            >
              {today}
            </p>
            <p className="text-xs text-stone-400 mt-1">Auto-generated from today's date</p>
          </Section>

          {/* Split ratio */}
          <Section label="Split ratio" value={`${Math.round(splitRatio * 100)} / ${Math.round((1 - splitRatio) * 100)}`}>
            <input
              type="range"
              min="0.2"
              max="0.75"
              step="0.01"
              value={splitRatio}
              onChange={(e) => setSplitRatio(parseFloat(e.target.value))}
              className="w-full mt-2"
            />
          </Section>

          {/* Font size */}
          <Section label="Font size" value={`${fontSize}px`}>
            <input
              type="range"
              min="36"
              max="140"
              step="2"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
              className="w-full mt-2"
            />
          </Section>

          {/* Background color */}
          <Section label="Background color">
            <div className="flex items-center gap-3 mt-0.5">
              <div className="relative w-10 h-7 border border-stone-300 overflow-hidden flex-shrink-0">
                <input
                  type="color"
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="absolute -inset-1 w-[calc(100%+8px)] h-[calc(100%+8px)] cursor-pointer opacity-0"
                  title="Choose color"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: bgColor, pointerEvents: 'none' }}
                />
              </div>
              <span
                className="text-sm text-stone-600 font-mono uppercase tracking-widest"
                style={{ letterSpacing: '0.12em' }}
              >
                {bgColor.toUpperCase()}
              </span>
              <span className="text-xs text-stone-400 italic" style={{ fontStyle: 'italic' }}>
                extracted via Vibrant.js
              </span>
            </div>
          </Section>

          {/* Export */}
          <div className="pt-5 mt-2 border-t border-stone-150">
            <button
              onClick={handleExport}
              className="w-full py-3.5 bg-stone-800 text-stone-50 text-sm tracking-widest hover:bg-stone-900 transition-colors duration-150"
              style={{ letterSpacing: '0.18em', fontFamily: "'EB Garamond', Georgia, serif" }}
            >
              EXPORT AS PNG
            </button>
            <p className="text-xs text-stone-400 text-center mt-2 italic">
              Exports at {CANVAS_W} × {CANVAS_H}px
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}

function Section({ label, value, children }) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-2.5">
        <span
          className="text-xs text-stone-400 uppercase"
          style={{ letterSpacing: '0.14em' }}
        >
          {label}
        </span>
        {value && (
          <span className="text-xs text-stone-400 tabular-nums">{value}</span>
        )}
      </div>
      {children}
    </div>
  )
}
