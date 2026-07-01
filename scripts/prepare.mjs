import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

if (!existsSync('.git')) process.exit(0);

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['simple-git-hooks'], {
  stdio: 'inherit',
});

process.exit(result.status ?? 0);
