import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHlsVerification } from './hls-verification.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runId = process.argv[2];

try {
  const report = await runHlsVerification(root, runId);
  process.stdout.write(JSON.stringify({ runId: report.runId, status: report.status, exitCode: report.exitCode, report: report.paths.reportPath }) + '\n');
  process.exitCode = report.exitCode;
} catch (error) {
  process.stderr.write(JSON.stringify({ status: 'incomplete', exitCode: 2, code: error?.code || 'verification-exception' }) + '\n');
  process.exitCode = 2;
}
