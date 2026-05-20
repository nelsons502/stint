# Stint

A macOS menubar time tracker with frictionless context switching. Designed for ADHD-friendly workflows: only one timer runs at a time, switching takes one hotkey or two clicks, and the active context + elapsed time live in the menubar.

**Status:** in early development. See the project spec for full scope.

## Stack

- Electron + React 19 + TypeScript (strict)
- Vite via `electron-vite`
- Packaging via `electron-builder`
- SQLite for time logs (library TBD)

## Develop

```bash
npm install
npm run dev        # launches the app in dev mode with HMR
npm run typecheck  # node + web tsconfigs
npm run lint
npm run build      # typecheck + bundle (no installer)
npm run build:mac  # produces a .dmg
```

## License

MIT
