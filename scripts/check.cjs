const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function run(args) {
  const result = spawnSync(process.execPath, args, { cwd: root, stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
run(['scripts/build-i18n.cjs', '--check']);
const files = fs.readdirSync(path.join(root, 'src')).filter(name => name.endsWith('.js')).sort();
for (const name of files) run(['--check', path.join('src', name)]);
run(['scripts/check-manifest.cjs']);
console.log(`check ok: ${files.length} source files`);
