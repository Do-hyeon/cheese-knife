import path from 'node:path';
import { openOwnedRoot } from './owned-files.mjs';

import { AUDIO_ARTIFACT_FILES, AUDIO_COMPARISON_ABSOLUTE_TOLERANCE, AUDIO_COMPARISON_RELATIVE_TOLERANCE, compareAudioArtifactReports, describeAudioArtifactFiles } from './audio-artifact-core.mjs';
export { AUDIO_ARTIFACT_FILES, AUDIO_COMPARISON_ABSOLUTE_TOLERANCE, AUDIO_COMPARISON_RELATIVE_TOLERANCE, compareAudioArtifactReports };

const fail = code => { throw new Error(code); };

export function parseAudioQualityArgs(argv, cwd = process.cwd()) {
  let chrome = false;
  let root = path.resolve(cwd);
  let label = 'source';
  for (let index = 0; index < argv.length; index++) {
    const argument = argv.at(index);
    if (argument === '--chrome') {
      chrome = true;
      continue;
    }
    if (argument === '--root') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) fail('audio-root-missing');
      root = path.resolve(cwd, value);
      continue;
    }
    if (argument === '--label') {
      const value = argv[++index];
      if (!value || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(value)) fail('audio-label-invalid');
      label = value;
      continue;
    }
    fail('audio-argument-invalid');
  }
  return { chrome, root, label };
}

export async function describeAudioArtifact(root, label) {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(label)) fail('audio-label-invalid');
  const files = await openOwnedRoot(root);
  return describeAudioArtifactFiles(files, label);
}
