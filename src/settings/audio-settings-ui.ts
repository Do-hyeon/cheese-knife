type KnifeAudioUIState = { values: KnifeAudioValuesV2; effectiveGain: number | null; gainOrigin: KnifeGainOrigin;
  globalScope: boolean; editable: boolean; wanted: boolean; masterAvailable: boolean; masterStatus: string };
var createAudioSettingsUI = (container: HTMLElement, actions: {
  edit: (patch: Partial<KnifeAudioValuesV2>) => void; wanted: (wanted: boolean) => void; draftChanged?: () => void;
}) => {
  const doc = container.ownerDocument;
  const label = (key: string, fallback: string) => typeof chrome !== 'undefined' ? chrome.i18n.getMessage(key) || fallback : fallback;
  const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const node = doc.createElement(tag); node.textContent = text; node.className = className; return node;
  };
  const text = (key: string, fallback: string) => label(`audio_ui_${key}`, fallback);
  const section = (name: string, title: string) => {
    const node = element('section', '', `f01-section f01-${name}`), header = element('div', '', 'f01-section-head');
    header.append(element('h2', title)); node.append(header); container.append(node);return { node, header };
  };
  const controls: HTMLInputElement[] = [], renders: Array<(state: KnifeAudioUIState) => void> = [];
  const invalidDrafts = new Set<string>(), resetDrafts = new Map<string,() => void>();
  let state: KnifeAudioUIState | null = null;
  function checkbox(parent: HTMLElement, id: keyof KnifeAudioValuesV2, title: string) {
    const wrapper = element('label', '', 'f01-check'), input = element('input');input.type = 'checkbox';input.id = id;
    wrapper.append(input, doc.createTextNode(title));parent.append(wrapper);controls.push(input);
    input.addEventListener('change', () => { if (!input.disabled) actions.edit({ [id]: input.checked }); });
    renders.push(next => { input.checked = Reflect.get(next.values,id) === true; });return input;
  }
  const masterSection = section('master', text('master', '오디오 보정'));
  const master = element('button');master.type = 'button';master.id = 'audio-master';masterSection.header.append(master);
  const masterState = element('p', '', 'desc');masterState.id = 'audio-master-state';masterState.setAttribute('role','status');masterSection.node.append(masterState);
  const graphs = element('div', '', 'f01-graphs');container.append(graphs);
  function graph(name: string, title: string, description: string) {
    const figure = element('figure');figure.dataset.audioGraph = name;figure.append(element('figcaption',title));
    const svg = doc.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 260 110');
    svg.setAttribute('role','img');svg.setAttribute('aria-label',title);
    const path = doc.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('fill','none');path.setAttribute('stroke','currentColor');
    svg.append(path);figure.append(svg,element('small',description));graphs.append(figure);return path;
  }
  const compGraph = graph('compressor',text('comp_graph','컴프레서 참고 특성'),text('comp_reference','정적 압축 · 입력/출력 dB · 실측 음량이 아닙니다'));
  const eqGraph = graph('eq',text('eq_graph','EQ 주파수 응답'),text('eq_reference','48 kHz · Q=1 · Gain/안전 감쇠를 제외한 참고값'));
  const gain = section('gain','Gain');
  function range(parent: HTMLElement, id: string, min: number, max: number, title: string) {
    const input = element('input');input.type = 'range';input.id = id;input.min = String(min);input.max = String(max);input.step = 'any';
    input.setAttribute('aria-label',title);parent.append(input);controls.push(input);return input;
  }
  const gainRow = element('div','','f01-gain-row');gain.node.append(gainRow);
  const gainInput = range(gainRow,'audioGain',0,2,'Gain');const gainValue = element('output','','f01-value');gainValue.id = 'audioGain-value';
  gainValue.htmlFor = 'audioGain';gainRow.append(gainValue);
  const gainSource = element('p','','f01-source');gainSource.id = 'audioGain-source';gain.node.append(gainSource);
  const inherit = checkbox(gain.node,'gainInherited',text('inherit','전역/사이트 Gain 상속'));
  checkbox(gain.node,'audioDefault',text('default','새 영상에서 오디오 보정 자동 켜기'));
  gainInput.addEventListener('input',() => {
    if (gainInput.disabled) return;const value = Number(gainInput.value);
    if (Number.isFinite(value) && value >= 0 && value <= 2) { gainValue.textContent = `${(value * 100).toFixed(2)}%`;actions.edit({audioGain:value,gainInherited:false}); }
  });
  gainInput.addEventListener('dblclick',() => { if (!gainInput.disabled) actions.edit({audioGain:1,gainInherited:false}); });
  const comp = section('compressor',text('compressor','컴프레서'));
  checkbox(comp.header,'compressorEnabled',text('use','사용'));
  const dials = element('div','','f01-dials');comp.node.append(dials);
  const compFields = KnifeMediaProfiles.audioFields.filter((field): field is KnifeRangeConfig => field.type === 'range');
  function resetButton(parent: HTMLElement, id: string, fields: readonly KnifeConfigLeaf[]) {
    const button = element('button',text('reset','기본값'));button.id = id;button.type = 'button';parent.append(button);
    button.addEventListener('click',() => { if (!button.disabled) {
      for (const field of fields) resetDrafts.get(field.id)?.();
      actions.edit(Object.fromEntries(fields.map(f => [f.id,f.defaultValue])));actions.draftChanged?.();
    } });
    renders.push(next => { button.disabled = !next.editable; });
  }
  resetButton(comp.header,'audio-comp-reset',compFields);
  for (const field of compFields) {
    const id = field.id as keyof KnifeAudioValuesV2, scale = /Attack|Release/.test(id) ? 1000 : 1;
    const min = field.min * scale, max = field.max * scale;
    const title = id.slice('compressor'.length), unit = scale === 1000 ? 'ms' : field.unit || ':1';
    const wrapper = element('div','','f01-dial-control'), caption = element('label',title);caption.htmlFor = `${id}-number`;wrapper.append(caption);
    const dial = range(wrapper,id,min,max,`${title} ${unit}`);dial.className = 'f01-dial';dial.setAttribute('role','slider');
    dial.setAttribute('aria-valuemin',String(min));dial.setAttribute('aria-valuemax',String(max));
    const numberRow = element('div','','f01-number-row'), number = element('input');number.type = 'number';number.id = `${id}-number`;
    number.min = String(min);number.max = String(max);number.step = 'any';number.setAttribute('aria-label',`${title} ${unit}`);
    numberRow.append(number,element('span',unit));wrapper.append(numberRow);dials.append(wrapper);controls.push(number);
    let value = Number(field.defaultValue) * scale, drag: { id: number; y: number } | null = null;
    const show = () => {
      dial.value = String(value);dial.setAttribute('aria-valuenow',String(value));dial.setAttribute('aria-valuetext',`${value.toFixed(2)} ${unit}`);
      dial.style.setProperty('--f01-angle',`${-135 + (value-min)/(max-min)*270}deg`);
      if (doc.activeElement !== number && !invalidDrafts.has(id)) number.value = value.toFixed(2);
    };
    const change = (next: number) => { invalidDrafts.delete(id);number.setAttribute('aria-invalid','false');value = next;show();actions.edit({[id]:value/scale}); };
    number.addEventListener('input',() => {
      const next = number.value.trim() ? Number(number.value) : NaN;
      const valid = Number.isFinite(next) && next >= min && next <= max;number.setAttribute('aria-invalid',String(!valid));
      if (valid) invalidDrafts.delete(id);else invalidDrafts.add(id);
      if (valid && !number.disabled) change(next);
      actions.draftChanged?.();
    });
    number.addEventListener('blur',() => { if (number.value.trim() && Number.isFinite(Number(number.value))) number.value = Number(number.value).toFixed(2); });
    dial.addEventListener('input',() => { if (!dial.disabled) change(Number(dial.value)); });
    dial.addEventListener('pointerdown',event => {
      if (event.button !== 0 || dial.disabled) return;event.preventDefault();dial.focus();drag = {id:event.pointerId,y:event.clientY};
      dial.setPointerCapture?.(event.pointerId);
    });
    dial.addEventListener('pointermove',event => {
      if (!drag || drag.id !== event.pointerId || dial.disabled) return;event.preventDefault();
      const next = Math.min(max,Math.max(min,value + (drag.y-event.clientY)*(max-min)/160));drag.y = event.clientY;change(next);
    });
    const end = () => { drag = null; };for (const type of ['pointerup','pointercancel','lostpointercapture','blur']) dial.addEventListener(type,end);
    resetDrafts.set(id,() => {invalidDrafts.delete(id);number.setAttribute('aria-invalid','false');number.value = (Number(field.defaultValue)*scale).toFixed(2);});
    for (const input of [dial,number]) input.addEventListener('dblclick',() => { if (!input.disabled) {
      resetDrafts.get(id)!();change(Number(field.defaultValue)*scale);actions.draftChanged?.();
    } });
    renders.push(next => {
      if (doc.activeElement !== number && !drag) { value = Number(Reflect.get(next.values,id))*scale;show(); }
    });
  }
  comp.node.append(element('small',text('dial_hint','위아래 드래그 · 더블클릭 기본값 · 숫자/방향키 입력')));
  const eq = section('eq',text('eq','이퀄라이저 · 8대역'));
  checkbox(eq.header,'eqEnabled',text('use','사용'));
  const eqFields = KnifeMediaProfiles.audioFieldsV2.filter((field): field is KnifeRangeConfig => /^eq\d+$/.test(field.id) && field.type === 'range');
  resetButton(eq.header,'audio-eq-reset',eqFields);
  const scroll = element('div','','f01-eq-scroll'), shell = element('div','','f01-eq-shell'), axis = element('div','','f01-eq-axis');
  axis.setAttribute('aria-hidden','true');for (const db of [6,4,2,0,-2,-4,-6]) axis.append(element('span',`${db>0?'+':''}${db}`));shell.append(axis);scroll.append(shell);eq.node.append(scroll);
  for (const field of eqFields) {
    const id = field.id as keyof KnifeAudioValuesV2, band = element('div','','f01-eq-band'), hz = Number(id.slice(2));
    const caption = element('label',hz>=1000 ? `${hz/1000}k` : String(hz));caption.htmlFor = id;band.append(caption);
    const input = range(band,id,-6,6,`${hz} Hz dB`);input.className = 'f01-eq-fader';input.setAttribute('orient','vertical');
    const value = element('input','','f01-value');value.type = 'number';value.id = `${id}-value`;value.min = '-6';value.max = '6';value.step = 'any';
    value.setAttribute('aria-label',`${hz} Hz dB`);controls.push(value);band.append(value);shell.append(band);
    resetDrafts.set(id,() => {invalidDrafts.delete(id);value.setAttribute('aria-invalid','false');value.value = '0.00';});
    input.addEventListener('input',() => { if (!input.disabled) {
      invalidDrafts.delete(id);value.setAttribute('aria-invalid','false');value.value = Number(input.value).toFixed(2);actions.edit({[id]:Number(input.value)});actions.draftChanged?.();
    } });
    value.addEventListener('input',() => {
      const current = value.value.trim() ? Number(value.value) : NaN, valid = Number.isFinite(current) && current >= -6 && current <= 6;
      value.setAttribute('aria-invalid',String(!valid));if (valid) invalidDrafts.delete(id);else invalidDrafts.add(id);
      if (valid && !value.disabled) {input.value = String(current);actions.edit({[id]:current});}actions.draftChanged?.();
    });
    value.addEventListener('blur',() => {if (!invalidDrafts.has(id)) value.value = Number(value.value).toFixed(2);});
    for (const control of [input,value]) control.addEventListener('dblclick',() => { if (!control.disabled) {
      resetDrafts.get(id)!();actions.edit({[id]:0});actions.draftChanged?.();
    } });
    renders.push(next => { input.value = String(Reflect.get(next.values,id));
      if (doc.activeElement !== value && !invalidDrafts.has(id)) value.value = Number(Reflect.get(next.values,id)).toFixed(2); });
  }
  const normalizer = section('normalizer',text('normalizer','자동 음량 보정'));
  checkbox(normalizer.header,'normalizerEnabled',text('use','사용'));
  const targetLabel = element('label',text('target','목표 음량 (dBFS)'));targetLabel.htmlFor = 'normalizerTargetDbfs';normalizer.node.append(targetLabel);
  const target = element('input');target.type = 'number';target.id = 'normalizerTargetDbfs';target.min = '-30';target.max = '-12';target.step = 'any';
  controls.push(target);normalizer.node.append(target);
  target.addEventListener('input',() => {
    const value = target.value.trim() ? Number(target.value) : NaN, valid = Number.isFinite(value) && value >= -30 && value <= -12;
    target.setAttribute('aria-invalid',String(!valid));if (valid) invalidDrafts.delete(target.id);else invalidDrafts.add(target.id);
    if (valid && !target.disabled) actions.edit({normalizerTargetDbfs:value});actions.draftChanged?.();
  });
  target.addEventListener('blur',() => {if (!invalidDrafts.has(target.id)) target.value = Number(target.value).toFixed(2);});
  master.addEventListener('click',() => { if (state && !master.disabled) actions.wanted(!state.wanted); });
  const curve = (values: number[]) => values.map((value,index) => `${index ? 'L' : 'M'}${(index*260/(values.length-1)).toFixed(2)},${value.toFixed(2)}`).join(' ');
  function draw(values: KnifeAudioValuesV2) {
    const threshold = values.compressorThreshold, knee = values.compressorKnee, ratio = values.compressorRatio;
    compGraph.setAttribute('d',curve(Array.from({length:101},(_,i) => {
      const x = i-100, offset = x-threshold;
      const y = !values.compressorEnabled ? x : offset < -knee/2 ? x : offset > knee/2 || knee === 0
        ? threshold+offset/ratio : x+(1/ratio-1)*(offset+knee/2)**2/(2*knee);
      return -y*1.1;
    })));
    eqGraph.setAttribute('d',curve(Array.from({length:129},(_,i) => {
      const frequency = 20*1000**(i/128), w = 2*Math.PI*frequency/48000;
      let db = 0;
      if (values.eqEnabled) for (const field of eqFields) {
        const a = 10**(Number(values[field.id as keyof KnifeAudioValuesV2])/40), w0 = 2*Math.PI*Number(field.id.slice(2))/48000, alpha = Math.sin(w0)/2;
        const b = [1+alpha*a,-2*Math.cos(w0),1-alpha*a], c = [1+alpha/a,-2*Math.cos(w0),1-alpha/a];
        const power = (v: number[]) => (v[0]!+v[1]!*Math.cos(w)+v[2]!*Math.cos(2*w))**2+(v[1]!*Math.sin(w)+v[2]!*Math.sin(2*w))**2;
        db += 10*Math.log10(power(b)/power(c));
      }
      return 55-Math.max(-12,Math.min(12,db))*4;
    })));
  }
  return { hasDraft: () => invalidDrafts.size > 0, render(next: KnifeAudioUIState) {
    state = next;for (const input of controls) input.disabled = !next.editable;
    for (const render of renders) render(next);
    gainInput.value = String(next.effectiveGain ?? 1);gainValue.textContent = next.effectiveGain === null ? '—' : `${(next.effectiveGain*100).toFixed(2)}%`;
    gainInput.setAttribute('aria-valuetext',next.effectiveGain === null ? text('gain_unconfirmed','기존 사이트 Gain 확인 필요') : gainValue.textContent);
    const source = next.gainOrigin === 'site-legacy' && next.effectiveGain !== null ? 'site-read' :
      next.gainOrigin === 'global-owned' && !next.globalScope && next.values.gainInherited ? 'global-inherited' : next.gainOrigin;
    gainSource.textContent = text(`source_${source.replaceAll('-', '_')}`,source === 'site-read' ? '사이트 Gain 읽기 확인값' : source === 'global-inherited' ? '전역 Gain 상속' : next.gainOrigin === 'site-legacy' ? '사이트 Gain 미확인' : next.gainOrigin === 'channel-owned' ? '채널 저장값' : '전역 저장값');
    inherit.parentElement!.lastChild!.textContent = next.globalScope ? text('inherit_site','기존 사이트 Gain 사용') : text('inherit_global','전역 Gain 사용');
    master.disabled = !next.masterAvailable;master.textContent = next.wanted ? text('on','오디오 보정 ON') : text('off','오디오 보정 OFF');
    master.setAttribute('aria-pressed',String(next.wanted));masterState.textContent = next.masterStatus+
      (next.masterAvailable && !next.wanted ? ' '+text('off_note','전체 OFF: 설정을 편집·저장할 수 있지만 소리에는 적용되지 않습니다.') : '');
    if (doc.activeElement !== target && !invalidDrafts.has(target.id)) target.value = next.values.normalizerTargetDbfs.toFixed(2);draw(next.values);
  } };
};
