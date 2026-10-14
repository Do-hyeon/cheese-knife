type RequireMediaAbi<T extends true> = T;
type MediaAbiProof = RequireMediaAbi<typeof KnifeMediaProfiles extends {
  readStore(raw: unknown): KnifeMediaRead;
  validateValues(domain: KnifeMediaDomain, raw: unknown): KnifeValuesResult;
  resolveMediaSettings(base: Record<string, KnifeScalar>, read: KnifeMediaRead,
    context: {channelId: string | null; topFrame: boolean; incognito: boolean}): KnifeMediaResolution;
  mergeMediaOperation(store: KnifeMediaStore, request: KnifeMediaMutation,
    global: {config: Record<string, KnifeScalar>; revision: number}): KnifeMediaMergeResult;
} ? true : false>;

export function proofContext(context: string, evidence: unknown) {
  return Object.freeze({ context, evidence });
}
