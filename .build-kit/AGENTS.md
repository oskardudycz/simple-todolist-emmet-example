# Build Kit — Accumulated Learnings

- Routes are auto-discovered by `server.ts` via `glob('dist/src/slices/**/routes{,-*}.js')` — do not manually wire routes into server.ts; the build-state-change/build-state-view skill's "wire up the route" step is a no-op here.
- `src/slices/<context>/` directory names follow the same lowercase-no-spaces convention as the slice folder names already present in each context's `index.json` (e.g. context "Todo List" -> `todolist`).
- Root project (`package.json` at repo root) has its own dependencies separate from `.build-kit/node_modules` — run `npm install` at the repo root, not just inside `.build-kit`, before running `npm run build` / tests.
- When a slice's `specifications[]` is empty and it has no `storylines[]`, do not fabricate business-rule tests — write only a happy-path DeciderSpecification test derived from the command/event fields actually defined in slice.json.
- `HTML_SCREEN` / storyboard nodes on a slice are UI-kit scope, not build-kit scope — the build-* skills only touch `src/slices/**/*.ts` command/event/route code.
