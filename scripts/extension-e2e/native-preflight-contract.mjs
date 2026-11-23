// Pure constants let the CLI establish its error boundary before loading payload IO.
export const NATIVE_STAGES = Object.freeze(['baseline', 'seeded', 'cold']);
export const NATIVE_CONTEXTS = Object.freeze(['worker-before', 'popup', 'styles', 'worker-after']);
export const NATIVE_ID = 'cgfddiiffponlciljlfbiecmlagflbpe';
export const NATIVE_CODES = Object.freeze(['native-context-invalid', 'native-read-failed', 'native-timeout', 'native-data-invalid',
  'native-crypto-unavailable', 'native-ui-failed', 'native-evidence-invalid', 'native-sequence-invalid', 'native-source-changed',
  'native-user-aborted', 'native-unavailable', 'native-finalization-failed', 'native-owned-io-failed']);
