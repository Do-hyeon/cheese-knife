export function proofContext(context: string, evidence: unknown) {
  return Object.freeze({ context, evidence });
}
