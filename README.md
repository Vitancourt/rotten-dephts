# Rotten Depths

A first-person, soulslike dungeon crawler that runs in the browser (Three.js + TypeScript, no backend).

You wake in a cage in a dead, rotting dungeon. Fight the undead with a torch, loot gear, descend through
randomly generated floors, and defeat a guardian every second floor to unlock the stairs. Die and you drop
everything where you fell; fight back to your corpse to recover it.

## Controls

| Key | Action |
| --- | --- |
| WASD / mouse | move / look |
| Shift | sprint |
| Left click | attack (hold to keep swinging) |
| Right click | block (hold): a shield absorbs most of a frontal hit, a bare torch a little; costs stamina |
| F | interact: pick up, recover, descend, rest at a cage |
| Q / E | quick slots: use a health flask or swap in bound gear (bind in the `I` tab) |
| I or Tab | equipment and level-up tab |
| Esc | pause (settings live on the pause screen) |

## Develop

```bash
npm install
npm run dev        # http://localhost:5173
npm run verify     # typecheck, sim purity check, tests, production build
```

`src/sim/` is pure game logic with no Three.js or DOM imports, so it can run on a server later.
The site is deployed to GitHub Pages by `.github/workflows/deploy.yml` (set Pages → Source to "GitHub Actions").
