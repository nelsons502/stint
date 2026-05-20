import { useState } from 'react'
import { Button } from '@renderer/components/ui/button'

function App(): React.JSX.Element {
  const [dark, setDark] = useState(false)

  const toggleDark = (): void => {
    setDark((d) => {
      const next = !d
      document.documentElement.classList.toggle('dark', next)
      return next
    })
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8">
      <header className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Stint</h1>
        <p className="text-sm text-muted-foreground">
          Menubar time tracker — UI scaffolding smoke test
        </p>
      </header>

      <div className="flex gap-2">
        <Button>Default</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="destructive">Destructive</Button>
      </div>

      <Button variant="outline" size="sm" onClick={toggleDark}>
        Toggle {dark ? 'light' : 'dark'} mode
      </Button>
    </div>
  )
}

export default App
