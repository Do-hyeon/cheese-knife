const assert = require('node:assert/strict');
const { page, load, runtime, deliverScoped: deliver, playerHTML, flush, clock } = require('./helpers.cjs');

function setup(t, suspended = false, manualClock = false, suppliedConfig = { compressorAttack: 0 }, failures = {}) {
  const dom = page(playerHTML);
  const time=failures.clock?clock(dom):undefined;
  t.after(async () => { dom.window.dispatchEvent(new dom.window.PageTransitionEvent('pagehide')); await flush(); dom.window.close(); });
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'currentSrc', { value: 'blob:https://chzzk.naver.com/test-media', configurable: true });
  const parameter = value => ({ value, inputs:new Set(), events: [], actual() {let result=this.value;for(const link of this.inputs){if(link.source.type==='constant')result+=link.source.offset.value;else if(link.source.controlSource)result+=link.source.controlSource.control[link.output];}return result;}, setValueAtTime(next, at) { this.events.push(['set', next, at]); this.value = next; }, cancelScheduledValues(at) { this.events.push(['cancel', at]); }, linearRampToValueAtTime(next, at) { this.events.push(['ramp', next, at]); this.value = next; }, exponentialRampToValueAtTime(next, at) { this.events.push(['exp', next, at]); this.value = next; } });
  const nodes = [];
  const node = type => { const value = { type, outputs: new Set(), links:[], connect(dest,output=0) { this.outputs.add(dest);const link={source:this,output};this.links.push({dest,link});dest.inputs?.add(link);if(this.type==='transition'&&output===1)dest.controlSource=this; }, disconnect(dest) { for(const row of this.links)if(!dest||row.dest===dest){row.dest.inputs?.delete(row.link);this.outputs.delete(row.dest);}this.links=this.links.filter(row=>dest&&row.dest!==dest); } }; nodes.push(value); return value; };
  let resolveResume;
  let context;
  let sources = 0;
  let gains = 0;
  dom.window.AudioContext = class extends dom.window.EventTarget {
    constructor() { super();this.state = suspended ? 'suspended' : 'running'; this.destination = node('destination'); this.currentTime = 0; this.sampleRate = failures.sampleRate || 48000; this.audioWorklet={addModule:async url=>{if(failures.module)throw Error('module unavailable');assert.match(url,/^chrome-extension:/);}}; context = this; }
    resume() {
      if (failures.resumeReject) return Promise.reject(new Error('resume unavailable'));
      return new Promise(resolve => { resolveResume = () => { this.state = 'running'; resolve(); }; });
    }
    createMediaElementSource(element) { if(failures.sourceVideos)assert.ok(failures.sourceVideos.has(element));else assert.equal(element, video);sources++;failures.onSource?.(dom);return node('source'); }
    createGain() {
      gains++;
      if (failures.gainAt === gains) throw new Error('gain unavailable');
      return Object.assign(node('gain'), { gain: parameter(1) });
    }
    createDelay(maxDelayTime) {
      if (failures.delay) throw new Error('delay unavailable');
      return Object.assign(node('delay'), { maxDelayTime, delayTime: parameter(0) });
    }
    createWaveShaper() {
      if (failures.limiter) throw new Error('limiter unavailable');
      return Object.assign(node('limiter'), { curve: null, oversample: 'none' });
    }
    createDynamicsCompressor() {
      if (failures.compressor) throw new Error('compressor unavailable');
      const compressor = Object.assign(node('compressor'), Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, parameter(0)])));
      Object.defineProperty(compressor, 'foreignParameter', { enumerable: true, value: parameter(77) });
      return compressor;
    }
    createBiquadFilter() {
      const filter = Object.assign(node('biquad'), { frequency: parameter(350), Q: parameter(1), gain: parameter(0) });
      Object.defineProperty(filter, 'type', { get: () => 'biquad', set: value => { filter.filterType = value; } }); return filter;
    }
    createChannelSplitter(channels=6) { return Object.assign(node('splitter'),{channels}); }
    createConstantSource() {return Object.assign(node('constant'),{offset:parameter(1),start(){this.started=true;},stop(){this.stopped=true;}});}
    createAnalyser() { return Object.assign(node('analyser'), { fftSize: 2048, reads: 0, getFloatTimeDomainData(buffer) { this.reads++; buffer.fill(failures.sample ?? 0.0316227766); } }); }
  };
  dom.window.AudioWorkletNode=class{
    constructor(ctx,name,options){
      assert.equal(name,'knife-audio-transition-l1');
      Object.assign(this,node('transition'));nodes[nodes.length-1]=this;
      this.options=options;
      this.parameters=new Map([['K',parameter(0)]]);this.commands=[];this.messages=[];this.control=[0,0,1,1,0];this.epoch=options.processorOptions.sourceEpoch;this.meterEpoch=0;
      this.port={onmessage:null,postMessage:packet=>{this.messages.push(packet);if(packet.kind==='configure'){this.commands.push(packet);this.packet=packet;if(!failures.manualWorkletAck)queueMicrotask(()=>{this.reply('accepted');queueMicrotask(()=>this.reply('completed'));});}else if(packet.kind==='retire'){this.retire=packet;if(!failures.manualWorkletAck)queueMicrotask(()=>this.reply('retired'));}else if(!failures.manualWorkletAck)queueMicrotask(()=>this.reply('meter-accepted',{seq:packet.meterSeq,code:packet.kind==='read-error'?'error':'hold'}));}};
      this.reply=(kind,extra={})=>{
        const packet=this.packet;
        if(kind==='accepted'&&packet){if(this.wanted!==packet.wanted||this.normalizer!==packet.normalizer)this.meterEpoch++;this.wanted=packet.wanted;this.normalizer=packet.normalizer;this.control=[packet.wanted?-1:0,packet.wanted?1:0,packet.wanted?packet.gain:1,1,-this.parameters.get('K').actual()];}
        this.port.onmessage?.({data:{kind,sourceEpoch:this.epoch,seq:kind==='prepared'?0:kind==='retired'?this.retire?.seq??0:packet?.seq??0,frame:Math.round(ctx.currentTime*ctx.sampleRate),meterEpoch:this.meterEpoch,gain:kind==='completed'?(packet?.wanted?packet.gain:1):null,code:null,...extra}});
      };
      if(!failures.manualWorkletAck)queueMicrotask(()=>this.reply('prepared'));
    }
  };
  load(dom, 'media-profiles.js'); load(dom, 'web/runtime.js'); load(dom, 'web/site-adapter.js'); deliver(dom, suppliedConfig);
  // Exercise the controller's own numeric clamps, independently of the v2 projection decoder.
  if (!runtime(dom).configReady) deliver(dom, {});
  runtime(dom).config = { ...suppliedConfig, audioDefault: suppliedConfig.audioDefault ?? suppliedConfig.compressorDefault ?? false };
  const statusChanges = [];
  const setStatus = runtime(dom).setStatus;
  runtime(dom).setStatus = (...args) => { statusChanges.push(args); return setStatus(...args); };
  if (failures.storage) Object.defineProperty(dom.window, 'localStorage', { configurable: true, get() { throw new Error('storage unavailable'); } });
  let tick;
  if (manualClock) dom.window.setInterval = callback => { tick = callback; return 9001; };
  load(dom, 'web/audio.js');
  if(!failures.noBootstrap&&runtime(dom).audio.prepareTransitionModule)void runtime(dom).audio.prepareTransitionModule('chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/web/audio-transition-worklet.js');
  return { dom, video, audio: runtime(dom).audio, nodes, statusChanges, time, tick: () => tick(), sources: () => sources, resume: () => resolveResume(), context: () => context };
}
module.exports = { setup };
