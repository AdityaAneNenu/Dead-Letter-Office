import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

// No bundler or transpiler: verify every shipped script with the installed Node.
const paths = ['server.mjs'];
for (const directory of ['lib', 'public', 'scripts', 'test']) {
  for (const file of await readdir(new URL(`../${directory}/`, import.meta.url))) {
    if (/\.(mjs|cjs|js)$/.test(file)) paths.push(`${directory}/${file}`);
  }
}
for (const file of paths) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit', cwd: new URL('../', import.meta.url) });
  if (result.error || result.status !== 0) process.exit(result.status || 1);
}
console.log(`Syntax checked ${paths.length} JavaScript files.`);
