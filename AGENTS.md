# AGENTS.md

Rules for agents working in this repo. `CLAUDE.md` is a symlink to this file.

## Project
Browser soulslike dungeon crawler (inspired by Dark and Darker) built with Three.js.
First-person melee, single-player, random floors, a boss every 2 floors, corpse-run death.
Online PvP/extraction is a later phase; do not build it before then.

## Stack and constraints
- Vite + TypeScript + Three.js. Deployed to GitHub Pages via GitHub Actions.
- Static hosting only: no backend, no server calls. Saves go in localStorage.
- Procedural low-poly visuals and WebAudio sounds. No asset pipeline.
- Keep game logic (state, combat rules, loot, generation) separate from rendering so a server can reuse it for PvP later.

## Layout and commands
- `src/sim/` pure logic (no Three.js/DOM; sibling imports only). `src/render/` Three.js. `src/ui/` DOM overlays. `src/core/` loop, input, audio. `src/save/` localStorage.
- `npm run dev` runs the game. `npm run verify` runs typecheck, `check:sim` (sim compiles without DOM types), unit tests, and the production build. Run it before calling anything done.
- Tests live in `tests/` (`npm test`, node:test via tsx) and cover sim logic only. `tests/purity.test.ts` enforces the sim/ import rule.
- In dev builds `window.__dbg` exposes game state for automated browser tests. It must stay behind `import.meta.env.DEV`.

## Docs and workflow
- Design lives in `docs/PRD.md`; delivery plan in `docs/phases/phaseX.md`. `docs/` is gitignored.
- When a bug is reported, create its report as `docs/buglist/bugN.md`, where `N` is the next bug number. Investigate the relevant code and document a researched possible solution in the report. Include a completion checkbox (`- [ ] Bug fixed and verified`) and mark it with an X (`- [x]`) only after the fix is verified.
- When asked to create a feature doc, create it as `docs/features/featureX.md`, where `X` is the next feature number. Describe the requested feature, research the relevant code and document a researched approach for implementing it. Include a completion checkbox (`- [ ] Feature implemented and verified`) and mark it with an X (`- [x]`) only after the feature is implemented and verified.
- Work one phase at a time, in order. Do not start phase N+1 until phase N's acceptance criteria pass.
- When a task or acceptance criterion in `docs/phases/phaseX.md` is done, mark its checkbox with an X (`- [x]`) right away. Never mark something done that hasn't been verified.
- Every phase must leave the game deployable and playable.
- Match the surrounding code's style, naming and comment density.
- Verify before claiming a phase is done: run the build and the game, and check each acceptance criterion.
