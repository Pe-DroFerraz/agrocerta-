import { execFileSync } from 'node:child_process';
import { codespacesEnvironment, root } from './environment.mjs';
execFileSync('npm', ['run', 'setup'], {
  cwd: root,
  env: codespacesEnvironment(),
  stdio: 'inherit',
});
