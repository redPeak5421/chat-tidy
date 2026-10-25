const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const files = new Set(['manifest.json', 'popup.html', 'src/support.html', 'LICENSE']);
const add = file => files.add(path.posix.normalize(file));
function walk(dir) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const rel = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walk(rel);
    else add(rel);
  }
}
walk('_locales');
for (const entry of manifest.content_scripts || []) for (const file of [...(entry.js || []), ...(entry.css || [])]) add(file);
for (const file of [...Object.values(manifest.icons || {}), ...Object.values(manifest.action?.default_icon || {})]) add(file);
// Local assets referenced by the popup and support pages (html src/href, css url()).
function references(file, pattern) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const match of source.matchAll(pattern)) {
    // srcset holds comma-separated candidates, each a URL optionally followed by a descriptor.
    for (const candidate of match[1].split(',')) {
      const ref = candidate.trim().split(/\s+/)[0].split(/[?#]/)[0];
      if (!ref || /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|data:)/i.test(ref)) continue;
      add(path.posix.join(path.posix.dirname(file), ref));
    }
  }
}
for (const page of ['popup.html', 'src/support.html']) references(page, /\b(?:src|href|srcset)="([^"]+)"/g);
for (const css of ['src/popup.css', 'src/support.css', 'src/content.css']) references(css, /url\(\s*['"]?([^'")]+)['"]?\s*\)/g);
const list = [...files].sort();
const missing = list.filter(file => !fs.existsSync(path.join(root, file)));
if (missing.length) {
  console.error(`Missing files:\n${missing.join('\n')}`);
  process.exit(1);
}
const outDir = path.join(root, 'release');
fs.mkdirSync(outDir, { recursive: true });
const out = path.join(outDir, `chat-tidy-${manifest.version}.zip`);
// A same-version zip may already be the published build; replacing it needs an explicit --force.
if (fs.existsSync(out)) {
  if (!process.argv.includes('--force')) {
    console.error(`${path.relative(root, out)} already exists. Bump the version or rerun with: npm run package -- --force`);
    process.exit(1);
  }
  fs.rmSync(out);
}
const result = spawnSync('zip', ['-X', '-q', out, ...list], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) {
  console.error('zip failed (is the zip CLI installed?)');
  process.exit(result.status || 1);
}
console.log(list.join('\n'));
console.log(`\n${list.length} files, ${(fs.statSync(out).size / 1024).toFixed(1)} KiB -> ${path.relative(root, out)}`);
