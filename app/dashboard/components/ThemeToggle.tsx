// ThemeToggle.tsx — drop-in Google style light/dark toggle
'use client'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const [dark, setDark] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('pos-theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const isDark = saved ? saved === 'dark' : prefersDark
    setDark(isDark)
    document.documentElement.setAttribute('data-mode', isDark ? 'dark' : 'light')
  }, [])

  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.setAttribute('data-mode', next ? 'dark' : 'light')
    localStorage.setItem('pos-theme', next ? 'dark' : 'light')
  }

  return (
    <button
      onClick={toggle}
      className="mode-btn"
      title={dark ? 'Εναλλαγή σε Light' : 'Εναλλαγή σε Dark'}
      aria-label="Toggle theme"
    >
      {dark ? '☀️' : '🌙'}
    </button>
  )
}