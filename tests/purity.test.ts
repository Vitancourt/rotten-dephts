import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SIM = join(import.meta.dirname, '..', 'src', 'sim');

test('src/sim never imports rendering, DOM or browser code (so a server can run it)', () => {
  const files = readdirSync(SIM).filter((f) => f.endsWith('.ts'));
  assert.ok(files.length > 10);
  for (const f of files) {
    const src = readFileSync(join(SIM, f), 'utf8');
    for (const m of src.matchAll(/from\s+['"]([^'"]+)['"]/g)) {
      const mod = m[1];
      assert.ok(mod.startsWith('./'), `${f} imports "${mod}" (sim may only import sibling sim modules)`);
    }
    assert.ok(!/\b(document|window|localStorage|requestAnimationFrame)\b/.test(src.replace(/\/\/.*$/gm, '')), `${f} touches a browser global`);
  }
});
