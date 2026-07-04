import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const ENTRY_POINTS = {
  background: 'src/ext/background.ts',
  'annotate.entry': 'src/ext/annotate.entry.ts',
  'options.entry': 'src/ext/options.entry.ts',
  'popup.entry': 'src/ext/popup.entry.ts',
  'overlay.content': 'src/ext/overlay.content.ts'
};

function parseArgs(argv) {
  const targetArg = argv.find((a) => a.startsWith('--target='));
  const target = targetArg ? targetArg.split('=')[1] : 'both';
  if (!['chromium', 'firefox', 'both'].includes(target)) {
    throw new Error(`Unknown --target: ${target}`);
  }
  return { target };
}

function deepMergeManifest(base, overlay) {
  const out = { ...base };
  for (const [key, value] of Object.entries(overlay)) {
    if (Array.isArray(value) && Array.isArray(out[key])) {
      out[key] = [...new Set([...out[key], ...value])];
    } else if (
      typeof value === 'object' &&
      value !== null &&
      typeof out[key] === 'object' &&
      out[key] !== null &&
      !Array.isArray(value)
    ) {
      out[key] = deepMergeManifest(out[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function buildManifest(target) {
  const base = JSON.parse(readFileSync(join(__dirname, 'manifest.base.json'), 'utf8'));
  const overlay = JSON.parse(readFileSync(join(__dirname, `manifest.${target}.json`), 'utf8'));
  return deepMergeManifest(base, overlay);
}

function copyStaticAssets(outDir) {
  mkdirSync(outDir, { recursive: true });
  cpSync(join(__dirname, 'public'), outDir, { recursive: true });
  const stylesOut = join(outDir, 'styles');
  mkdirSync(stylesOut, { recursive: true });
  cpSync(join(__dirname, 'src/styles'), stylesOut, { recursive: true });
}

async function buildTarget(target) {
  const outDir = join(__dirname, 'dist', target);
  copyStaticAssets(outDir);

  await esbuild.build({
    entryPoints: ENTRY_POINTS,
    entryNames: '[name]',
    outdir: outDir,
    bundle: true,
    format: 'iife',
    target: 'es2020',
    define: { __TARGET__: JSON.stringify(target) },
    // Constant-fold the __TARGET__ define and drop the resulting dead branches
    // so per-target code (e.g. Chromium's chrome.debugger path) is eliminated
    // from the other target's bundle. minifySyntax only does semantics-preserving
    // syntax optimizations — no identifier renaming, so bundles stay readable.
    minifySyntax: true,
    logLevel: 'info'
  });

  const manifest = buildManifest(target);
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log(`Built ${target} -> ${outDir}`);
}

const { target } = parseArgs(process.argv.slice(2));
const targets = target === 'both' ? ['chromium', 'firefox'] : [target];
for (const t of targets) {
  await buildTarget(t);
}
