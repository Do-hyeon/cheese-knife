// Self-contained because Playwright serializes this function into the fixture page.
export function observeInstalledProtocol(expectedProtocol) {
  if (![1,2,3].includes(expectedProtocol)) throw Object.assign(new Error('installed-protocol-invalid'),{code:'installed-protocol-invalid'});
  const runtime=window[Symbol.for('cheese-knife.runtime.v1')],fixture=window.__knifeFixture;
  const metadata=fixture?.['lastConfigEnvelopeV'+expectedProtocol];
  if (!runtime?.configReady || !Number.isSafeInteger(fixture?.loads) || fixture.loads<1 || !metadata || metadata.load!==fixture.loads) return null;
  if (expectedProtocol===1) {
    if (metadata.requestId!==runtime.requestId || !Number.isSafeInteger(metadata.revision) || metadata.revision<0) return null;
  } else {
    if (runtime.ownerProtocol!==expectedProtocol || runtime.media?.phase==='pending' || !runtime.media?.context ||
      metadata.requestId!==runtime.mediaRequestId || !Number.isSafeInteger(metadata.deliverySequence) || metadata.deliverySequence<0 ||
      !metadata.context || Object.keys(metadata.context).length!==4 ||
      metadata.context.documentGeneration!==runtime.media.context.documentGeneration || metadata.context.routePath!==runtime.media.context.routePath ||
      metadata.context.channelId!==runtime.media.context.channelId || metadata.context.playerGeneration!==runtime.media.context.playerGeneration) return null;
    if (expectedProtocol===3 && !['site-legacy','global-owned','channel-owned'].includes(metadata.gainOrigin)) return null;
  }
  return {metadata:{...metadata},config:{...runtime.config},load:fixture.loads};
}

export function sendInstalledEnvelopeControl({metadata,protocol,mode}) {
  const runtime=window[Symbol.for('cheese-knife.runtime.v1')];
  const envelope={...metadata};delete envelope.load;
  const message=protocol===1?{
    namespace:'cheese-knife',protocol,type:'config',requestId:metadata.requestId,
    revision:metadata.revision+(mode==='stale'?-1:100),config:{...runtime.config,arrowSeek:true},i18n:{...runtime.i18n},
  }:{...envelope,namespace:'cheese-knife',protocol,type:'config',deliverySequence:metadata.deliverySequence+(mode==='stale'?-1:100),
    context:{...metadata.context,...(mode==='context'?{playerGeneration:metadata.context.playerGeneration+1}:{})},
    baseConfig:{...runtime.baseConfig,arrowSeek:true},effectiveConfig:{...runtime.config,arrowSeek:true},i18n:{...runtime.i18n}};
  window.postMessage(message,location.origin);
}
