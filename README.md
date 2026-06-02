# Stint

A macOS menubar time tracker built for ADHD-friendly workflows: one timer runs at a time, switching takes one hotkey or two clicks, and the active context + elapsed time live in the menubar.

## Features

- **Context switching** — switch tasks instantly from the menubar or via `Cmd+Shift+1–9`
- **Goals** — optional weekly and daily hour targets per context, with notifications when you hit them *(premium)*
- **History charts** — rolling 6-week view of time per context *(premium)*
- **CSV export** — export any week or month to a spreadsheet *(premium)*
- **Auto save & reset** — scheduled daily archiving so you start fresh each morning
- **Global hotkeys** — configurable shortcuts for pause, open, and context switching

Premium features are a one-time $6 unlock. Email [nelson@focus-coding.com](mailto:nelson@focus-coding.com?subject=Stint%20unlock) to get started.

## Stack

- **Electron** (menubar app, macOS-first)
- **React 19 + TypeScript** (strict mode throughout)
- **Vite** via `electron-vite`
- **SQLite** via `better-sqlite3` + `Kysely` (typed query builder)
- **Packaging** via `electron-builder`
- **Tests** via `Vitest` + `React Testing Library`

## Getting started

### Prerequisites

- Node 20+
- macOS (Windows/Linux builds exist but are untested)

### Install and run

```bash
npm install
npm run dev
```

The `predev` hook automatically rebuilds `better-sqlite3` against Electron's Node ABI before launching, so the first run may take a few extra seconds. Subsequent runs are instant.

### All scripts

| Script | What it does |
|---|---|
| `npm run dev` | Launch in dev mode with HMR |
| `npm run build` | Typecheck + bundle (no installer) |
| `npm run build:mac` | Full macOS build → `.dmg` |
| `npm run typecheck` | Run both `node` and `web` tsconfigs |
| `npm run lint` | ESLint |
| `npm test` | Vitest (watch mode) |
| `npm run test:run` | Vitest (single pass, CI-friendly) |
| `npm run build:icons` | Rasterize tray icon SVGs → PNGs |
| `npm run build:app-icon` | Rasterize app icon SVG → PNGs |

### Updating icons

Tray and app icons are authored as SVGs in `resources/` and rasterized via `sharp`:

```bash
npm run build:icons      # resources/tray/iconTemplate.svg → PNGs
npm run build:app-icon   # resources/icon.svg → resources/icon.png + build/icon.png
```

Commit the generated PNGs alongside the SVG source.

## A note on `.npmrc`

This repo ships `.npmrc` with `ignore-scripts=false`. Electron's `postinstall` downloads the binary and `better-sqlite3` needs to be compiled against Electron's Node ABI — both require install scripts. If you have `ignore-scripts=true` globally, this project-level file overrides it just for this repo.

## Database

Time logs are stored locally in SQLite:

- **Dev:** `~/Library/Application Support/Electron/stint.dev.db`
- **Production:** `~/Library/Application Support/Stint/stint.db`

The migration system in `src/main/db/migrations.ts` runs automatically on launch. Add new migrations to the end of the list — never rewrite history once a migration has shipped.

## License

MIT
