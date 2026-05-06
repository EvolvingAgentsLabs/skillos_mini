// copy-strategies.mjs — copy ../../strategies/ to public/strategies/
// so the demos can fetch them at runtime via /strategies/<game>/<id>.md.
import { existsSync, mkdirSync, readdirSync, copyFileSync, statSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dirname, '..', '..', 'strategies');
const DST = resolve(__dirname, '..', 'public', 'strategies');

if (!existsSync(SRC)) {
  console.error('[copy-strategies] no strategies/ at repo root — skipping');
  process.exit(0);
}

if (existsSync(DST)) rmSync(DST, { recursive: true, force: true });
mkdirSync(DST, { recursive: true });

function copyTree(srcDir, dstDir) {
  for (const entry of readdirSync(srcDir)) {
    const s = join(srcDir, entry);
    const d = join(dstDir, entry);
    if (statSync(s).isDirectory()) {
      mkdirSync(d, { recursive: true });
      copyTree(s, d);
    } else {
      copyFileSync(s, d);
    }
  }
}
copyTree(SRC, DST);
console.log(`[copy-strategies] ${SRC} → ${DST}`);
