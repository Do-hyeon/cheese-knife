(() => {
  const video = document.querySelector('video');
  const sampleRate = 48000, frames = sampleRate * 2, buffer = new ArrayBuffer(44 + frames * 2), data = new DataView(buffer);
  const text = (at, value) => { for (let i = 0; i < value.length; i++) data.setUint8(at + i, value.charCodeAt(i)); };
  text(0, 'RIFF'); data.setUint32(4, buffer.byteLength - 8, true); text(8, 'WAVE'); text(12, 'fmt ');
  data.setUint32(16, 16, true); data.setUint16(20, 1, true); data.setUint16(22, 1, true);
  data.setUint32(24, sampleRate, true); data.setUint32(28, sampleRate * 2, true); data.setUint16(32, 2, true); data.setUint16(34, 16, true);
  text(36, 'data'); data.setUint32(40, frames * 2, true);
  for (let i = 0; i < frames; i++) data.setInt16(44 + i * 2, Math.round(Math.sin(2 * Math.PI * 250 * i / sampleRate) * 0.2 * 32767), true);
  const url = URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
  video.muted = true; video.volume = 0.5; video.src = url;
  video.addEventListener('loadeddata', () => { void video.play().catch(() => {}); }, { once: true });
  const facts = { sampleRate, frames, originalMuted: true, originalVolume: 0.5, decoded: false, nativePointer: 0, nativeKey: 0 };
  video.addEventListener('loadeddata', () => { facts.decoded = video.readyState >= 2; }, { once: true });
  document.addEventListener('pointerdown', event => { if (event.isTrusted && event.target instanceof Element && event.target.closest('.knife-gain-owner')) facts.nativePointer++; }, true);
  document.addEventListener('keydown', event => { if (event.isTrusted && event.target instanceof Element && event.target.closest('.knife-gain-owner')) facts.nativeKey++; }, true);
  Object.defineProperty(window, '__knifeAudioFixture', { get: () => ({ ...facts }) });
  window.addEventListener('pagehide', event => { if (!event.persisted) URL.revokeObjectURL(url); });
})();
