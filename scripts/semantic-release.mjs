import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';

if (!process.env.GH_TOKEN) {
  process.env.GH_TOKEN = execFileSync('gh', ['auth', 'token'], {
    encoding: 'utf8',
  }).trim();
}

const result = spawnSync(command, ['semantic-release', ...args], {
  stdio: 'inherit',
  env: process.env,
});

process.exit(result.status ?? 0);
