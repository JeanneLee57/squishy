'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * WindowBar - Electron 전용 커스텀 타이틀바
 * frame: false 일 때 드래그 이동 + 닫기/최소화 버튼 제공
 * 웹 브라우저에서는 렌더링 안 됨
 */
export function WindowBar() {
  const [isElectron, setIsElectron] = useState(false)
  const dragStart = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    setIsElectron(typeof window !== 'undefined' && 'electron' in window)
  }, [])

  if (!isElectron) return null

  const handleMouseDown = (e: React.MouseEvent) => {
    dragStart.current = { x: e.screenX, y: e.screenY }

    const onMove = (ev: MouseEvent) => {
      if (!dragStart.current) return
      const deltaX = ev.screenX - dragStart.current.x
      const deltaY = ev.screenY - dragStart.current.y
      dragStart.current = { x: ev.screenX, y: ev.screenY }
      ;(window as any).electron.dragWindow(deltaX, deltaY)
    }

    const onUp = () => {
      dragStart.current = null
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }

    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 32,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 10px',
        background: 'transparent',
        zIndex: 9999,
        userSelect: 'none',
        cursor: 'grab',
      }}
      onMouseDown={handleMouseDown}
    >
      <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11, fontFamily: 'monospace' }}>
        squishy
      </span>

      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={() => (window as any).electron.minimizeWindow()}
          onMouseDown={e => e.stopPropagation()}
          style={btnStyle('#f5a623')}
          title="최소화"
        />
        <button
          onClick={() => (window as any).electron.closeWindow()}
          onMouseDown={e => e.stopPropagation()}
          style={btnStyle('#ff5f57')}
          title="닫기"
        />
      </div>
    </div>
  )
}

const btnStyle = (color: string): React.CSSProperties => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  background: color,
  border: 'none',
  cursor: 'pointer',
  padding: 0,
})
