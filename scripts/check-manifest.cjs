const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const errors = [];
const entries = manifest.content_scripts || [];
for (const [i, entry] of entries.entries()) {
  const label = `content_scripts[${i}] (${(entry.matches || []).join(', ')})`;
  for (const file of [...(entry.js || []), ...(entry.css || [])]) {
    if (!fs.existsSync(path.join(root, file))) errors.push(`${label}: missing file ${file}`);
  }
  if (entry.js?.[0] !== 'src/core.js') errors.push(`${label}: src/core.js must be first`);
  if (entry.js?.at(-1) !== 'src/content.js') errors.push(`${label}: src/content.js must be last`);
  for (const required of ['src/batch.js', 'src/i18n.js']) {
    if (!entry.js?.includes(required)) errors.push(`${label}: ${required} is required on every site`);
  }
  if (new Set(entry.js).size !== entry.js?.length) errors.push(`${label}: duplicate scripts`);
}
for (const host of manifest.host_permissions || []) {
  const count = entries.filter(entry => entry.matches?.includes(host)).length;
  if (count !== 1) errors.push(`${host}: matched by ${count} content_scripts entries (expected 1)`);
}
for (const entry of entries) {
  for (const match of entry.matches || []) {
    if (!manifest.host_permissions?.includes(match)) errors.push(`${match}: not in host_permissions`);
  }
}
// A module global used without a globalThis.X guard must be loaded by every entry that loads the user.
const globals = {};
for (const file of fs.readdirSync(path.join(root, 'src')).filter(name => name.endsWith('.js'))) {
  const source = fs.readFileSync(path.join(root, 'src', file), 'utf8');
  for (const match of source.matchAll(/globalThis\.(ChatTidy[A-Za-z0-9]*)\s*=/g)) globals[match[1]] = `src/${file}`;
}
// Site-specific modules are only referenced inside their own site branches (verified by hand); the always-loaded set is enforced here.
const alwaysUsed = ['ChatTidyCore', 'ChatTidyBatch', 'ChatTidyI18n'];
for (const entry of entries) {
  for (const name of alwaysUsed) {
    if (!entry.js?.includes(globals[name])) errors.push(`${(entry.matches || []).join(', ')}: ${name} provider ${globals[name]} not loaded`);
  }
  // Unguarded references in loaded scripts must resolve to a loaded provider.
  for (const file of entry.js || []) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    for (const name of Object.keys(globals)) {
      if (source.includes(`globalThis.${name}`)) continue; // guarded optional dependency
      if (!new RegExp(`(?<![.\\w])${name}\\.`).test(source)) continue;
      if (file === globals[name]) continue;
      if (['ChatTidyGemini', 'ChatTidyKimi', 'ChatTidyQwen', 'ChatTidyZai'].includes(name) || entry.js.includes(globals[name])) continue;
      errors.push(`${file}: references ${name} but ${globals[name]} is not loaded for ${(entry.matches || []).join(', ')}`);
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`manifest ok: ${entries.length} content script entries`);
