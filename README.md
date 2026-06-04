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

Stint is open source (MIT). The paywall is cryptographically enforced via an Ed25519 license key — the source being visible doesn't bypass it, since the private key never leaves the developer's machine. You're welcome to build and modify it yourself.

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

### Install the app (pre-built .dmg)

Download the latest `.dmg` from [Releases](https://github.com/nelsons502/stint/releases), open it, and drag Stint to Applications.

**First launch:** macOS will block it because the app isn't notarized (no Apple Developer subscription). Bypass it once:

> **System Settings → Privacy & Security → scroll down → "Stint was blocked" → Open Anyway**

Or right-click the app in Applications → Open → Open. You won't be asked again after the first time.

### Build from source

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
| `npm run generate-license` | Issue a license key for a paying customer |
| `npm run keygen` | Rotate the Ed25519 keypair (update `verify.ts` after) |

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
