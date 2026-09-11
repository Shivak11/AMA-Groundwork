import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const helper = path.join(root, 'prefab', 'shortlist.py');
const MAX_INPUT = 1_000_000;
const MAX_OUTPUT = 24_000_000;

function runPython(mode, input = '', options = {}) {
  if (Buffer.byteLength(input) > MAX_INPUT) throw new Error('The workshop record is too large. Continue in text mode.');
  const executable = options.python ?? process.env.PREFAB_PYTHON ?? path.join(root, '.venv', 'bin', 'python');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, [helper, mode], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'], shell: false });
    let output = '';
    let stderr = '';
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      finish(new Error('The Prefab view timed out. Continue the same exercise in text mode.'));
    }, options.timeoutMs ?? 20_000);
    child.on('error', () => finish(new Error('Prefab is unavailable. Install prefab-ui==0.20.2 in the project .venv or set PREFAB_PYTHON; text mode remains available.')));
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', chunk => {
      output += chunk;
      if (Buffer.byteLength(output) > MAX_OUTPUT) {
        child.kill('SIGKILL');
        finish(new Error('The Prefab response exceeded its size limit. Continue in text mode.'));
      }
    });
    child.stderr.on('data', chunk => { if (stderr.length < 3000) stderr += chunk; });
    child.stdin.on('error', () => {});
    child.on('close', code => {
      if (code !== 0) finish(new Error(`Prefab could not create this view. Continue in text mode. ${stderr.trim().slice(-1200)}`));
      else finish(null, output);
    });
    child.stdin.end(input);
  });
}

export async function buildPrefabView(record, options = {}) {
  const output = await runPython('--view', JSON.stringify(record), options);
  const envelope = JSON.parse(output);
  if (envelope?.$prefab?.version !== '0.3' || !envelope.view) throw new Error('Unexpected Prefab protocol. Continue in text mode.');
  return envelope;
}

export async function loadPrefabRenderer(options = {}) {
  return runPython('--renderer', '', options);
}
