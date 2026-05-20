# Stint — future work & operational notes

A running list of things that are intentionally deferred, plus the
operational steps that don't have automated coverage in the repo yet.
Pick things off this list whenever you come back to the project.

---

## Distribution

### Notarization (macOS)

Currently `electron-builder.yml` has `notarize: false`. Before publishing a
build you'll want to:

1. Get an Apple Developer ID Application certificate into your login
   keychain (Xcode → Settings → Accounts can do this).
2. Create an app-specific password at https://appleid.apple.com.
3. Find your Apple Team ID at https://developer.apple.com/account.
4. Set environment variables before running the build:

   ```
   APPLE_ID="you@example.com"
   APPLE_APP_SPECIFIC_PASSWORD="abcd-efgh-ijkl-mnop"
   APPLE_TEAM_ID="ABCDE12345"
   ```

5. Flip `notarize: false` → `notarize: true` in `electron-builder.yml`.

`electron-builder` calls `notarytool` under the hood; the first run may
take 10–30 minutes while Apple processes the binary.

### GitHub releases + auto-updates

`electron-builder.yml` is configured with:

```yaml
publish:
  provider: github
  owner: nelsonschnepf   # placeholder — update before the first release
  repo: stint
```

Before the first release:

1. Create the repo on GitHub. The owner/repo fields above must match.
2. Push the local `main` branch (this project is currently local-only).
3. `gh auth login` so the publish step can authenticate.
4. Bump `version` in `package.json` from `0.1.0` to something
   release-worthy (e.g. `0.2.0`).
5. Run `npm run build:mac -- --publish always`. `electron-builder` will
   build the `.dmg`, upload it to a draft GitHub release, and produce
   the `latest-mac.yml` file that `electron-updater` reads.
6. On GitHub, finalize the draft release (turn off "Draft" so the
   release is visible to update checks).

Subsequent releases just repeat steps 4–6. `electron-updater` in the
running app will pick up the new release on its next launch, download
it in the background, and install on the user's next natural quit
(`autoInstallOnAppQuit: true`). Active timers are never interrupted —
that behavior is wired in `src/main/index.ts`.

If you want test releases that don't go public, mark them as
`prerelease` in the GitHub UI and set
`autoUpdater.allowPrerelease = true` in main; otherwise stable users
won't see them.

---

## Things deferred from the v1 roadmap

These are mentioned in the spec but didn't make it into v1.0–v1.4:

- **Recurring context management surface in Settings.** Today, you
  add / reorder / delete / rename / promote contexts on the Today tab.
  The spec calls for a dedicated panel in Settings; doing it on Today
  was the lower-friction path. If you want a Settings-side panel,
  re-use the same row component.
- **Hotkey conflict surface.** `ShortcutManager.applyConfig()` already
  returns `{ registered, failed }`, but the Settings UI doesn't
  display the `failed` list. If the user picks `Cmd+Q`, the
  registration silently fails. Wire the result back through the IPC
  return value so SettingsView can show a small inline warning.
- **Per-day CSV: filename uses date only.** History tab exports
  `stint-<date>.csv`. Could include the day-of-week in the filename
  if useful.
- **Storybook / visual regression.** Skipped intentionally for this
  size of app.
- **Real paywall enforcement.** Goals unlock is honor-system local
  flag. The architecture is set up so this gate can swap to a server
  check without touching the UI — see
  `src/main/db/settings.ts`'s `getGoalsUnlocked` /
  `setGoalsUnlocked`.

---

## Architectural footnotes worth remembering

### better-sqlite3 ABI swap

`better-sqlite3` is a native module compiled against one of Node ABI 127
(plain Node 22) or Electron ABI 140 (Electron 39). Tests run in Node,
the app runs in Electron — so we hot-swap before each. See
`scripts/rebuild-bsq.mjs` and the `pretest` / `predev` npm hooks. The
script wipes `node_modules/better-sqlite3/build/Release/` first because
`@electron/rebuild`'s `.forge-meta` marker can convince it the binary
is already up to date when it isn't.

If you ever upgrade Electron, the ABI version will change — re-run
`npm run predev` and verify the app still launches. Test runs will
self-heal because they re-build for the current Node ABI each time.

### Resources path in production

`getResourcesPath()` returns:
- `<repo>/resources` in dev (via `app.getAppPath()`).
- `<app>/Contents/Resources/resources` in production (via
  `process.resourcesPath` + the `extraResources` mapping in
  `electron-builder.yml`).

When you first build a `.dmg`, smoke-test that the tray icon shows up —
that's the only thing currently loaded from `resources/`. If you add
more (e.g. notification sounds), put them under `resources/<subdir>/`
and load them via `getResourcesPath()`.

### Timer-state architecture

Main owns truth; the renderer is a thin Zustand cache fed by IPC.
Concretely:

- `TimerService` (in `src/main/timer/TimerService.ts`) holds the
  authoritative in-memory snapshot and emits `state-changed` on every
  transition.
- `registerIpcBridge` in `src/main/ipc/bridge.ts` rebroadcasts
  `state-changed` to every renderer.
- The renderer's `useTimerStore` (Zustand) caches the latest snapshot.
- Components never mutate state locally — they call
  `window.api.<cmd>` which goes back to main.

Per-second elapsed display is computed locally in the renderer (and
in main's tray code) from `(now - activeStartedAtMs) + todaySeconds`.
There is no per-second IPC chatter.

### Crash recovery

If the previous process exited with a timer running,
`TimerService.init()` returns `RecoveryInfo` rather than auto-resuming.
The renderer surfaces this via `RecoveryDialog`. The caller picks one
of three choices and calls `finalizeRecovery()`:

- `discard` — drop the in-flight run, leave paused.
- `resume-since` — credit the time between the previous start and now
  to the context, then start a fresh run.
- `resume-now` — start a fresh run from now, forfeiting the gap.

### Cumulative archive on Save & Reset

`archiveDay` upserts daily_logs with **summation** on conflict
(`(date, context_name)`). Two Save & Reset runs under the same date
add together; the manual edit path in History (`updateLogDuration`) is
set-to-value. The COALESCE in the conflict clause preserves an
existing FK `context_id` if a later archive supplies null (CSV
import).

---

## Test coverage gaps

The Vitest suite covers all the main-process pure logic and the
shared/renderer pure helpers. It does **not** cover:

- The Electron `Tray`, `Menu`, `globalShortcut`, `Notification`, and
  `dialog` APIs. Those have to be smoke-tested by running the app.
- The `electron-updater` flow. Will only exercise once a real GitHub
  release exists.
- The actual rendered React components beyond `Button` and
  `ContextRow`'s `parseHMS` helper. Visual regressions are a manual
  check.

If you want to close these gaps, the typical pattern is
`@electron-test/runner` for Electron-bound tests and Playwright for
end-to-end. Both are nontrivial to set up; defer until they catch a
real bug.

---

## Quick reference — scripts

| `npm run …`      | what it does                                          |
| ---------------- | ----------------------------------------------------- |
| `dev`            | electron-vite dev server + Electron app (HMR)         |
| `build`          | typecheck + bundle (no installer)                     |
| `build:mac`      | dmg for macOS via electron-builder                    |
| `build:icons`    | rasterize `resources/tray/iconTemplate.svg`           |
| `test` / `test:run` | Vitest watch / one-shot                            |
| `typecheck`      | tsc --noEmit across both projects                     |
| `lint`           | eslint                                                |
| `format`         | prettier --write                                      |

The `pretest` / `pretest:run` / `predev` hooks handle the
better-sqlite3 ABI swap automatically — you shouldn't have to think
about it.
