// Generated from src/settings/audio-settings-ui.ts by scripts/settings-runtime.mjs. Do not edit.
var createAudioSettingsUI = (container, actions) => {
  const doc = container.ownerDocument;
  const label = (key, fallback) => typeof chrome !== "undefined" ? chrome.i18n.getMessage(key) || fallback : fallback;
  const element = (tag, text2 = "", className = "") => {
    const node = doc.createElement(tag);
    node.textContent = text2;
    node.className = className;
    return node;
  };
  const text = (key, fallback) => label(`audio_ui_${key}`, fallback);
  const section = (name, title) => {
    const node = element("section", "", `f01-section f01-${name}`), header = element("div", "", "f01-section-head");
    header.append(element("h2", title));
    node.append(header);
    container.append(node);
    return { node, header };
  };
  const controls = [], renders = [];
  const invalidDrafts = /* @__PURE__ */ new Set(), resetDrafts = /* @__PURE__ */ new Map();
  let state = null;
  function checkbox(parent, id, title) {
    const wrapper = element("label", "", "f01-check"), input = element("input");
    input.type = "checkbox";
    input.id = id;
    wrapper.append(input, doc.createTextNode(title));
    parent.append(wrapper);
    controls.push(input);
    input.addEventListener("change", () => {
      if (!input.disabled) actions.edit({ [id]: input.checked });
    });
    renders.push((next) => {
      input.checked = Reflect.get(next.values, id) === true;
    });
    return input;
  }
  const masterSection = section("master", text("master", "\uC624\uB514\uC624 \uBCF4\uC815"));
  const master = element("button");
  master.type = "button";
  master.id = "audio-master";
  masterSection.header.append(master);
  const masterState = element("p", "", "desc");
  masterState.id = "audio-master-state";
  masterState.setAttribute("role", "status");
  masterSection.node.append(masterState);
  const graphs = element("div", "", "f01-graphs");
  container.append(graphs);
  function graph(name, title, description) {
    const figure = element("figure");
    figure.dataset.audioGraph = name;
    figure.append(element("figcaption", title));
    const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 260 110");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", title);
    const path = doc.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    svg.append(path);
    figure.append(svg, element("small", description));
    graphs.append(figure);
    return path;
  }
  const compGraph = graph("compressor", text("comp_graph", "\uCEF4\uD504\uB808\uC11C \uCC38\uACE0 \uD2B9\uC131"), text("comp_reference", "\uC815\uC801 \uC555\uCD95 \xB7 \uC785\uB825/\uCD9C\uB825 dB \xB7 \uC2E4\uCE21 \uC74C\uB7C9\uC774 \uC544\uB2D9\uB2C8\uB2E4"));
  const eqGraph = graph("eq", text("eq_graph", "EQ \uC8FC\uD30C\uC218 \uC751\uB2F5"), text("eq_reference", "48 kHz \xB7 Q=1 \xB7 Gain/\uC548\uC804 \uAC10\uC1E0\uB97C \uC81C\uC678\uD55C \uCC38\uACE0\uAC12"));
  const gain = section("gain", "Gain");
  function range(parent, id, min, max, title) {
    const input = element("input");
    input.type = "range";
    input.id = id;
    input.min = String(min);
    input.max = String(max);
    input.step = "any";
    input.setAttribute("aria-label", title);
    parent.append(input);
    controls.push(input);
    return input;
  }
  const gainRow = element("div", "", "f01-gain-row");
  gain.node.append(gainRow);
  const gainInput = range(gainRow, "audioGain", 0, 2, "Gain");
  const gainValue = element("output", "", "f01-value");
  gainValue.id = "audioGain-value";
  gainValue.htmlFor = "audioGain";
  gainRow.append(gainValue);
  const gainSource = element("p", "", "f01-source");
  gainSource.id = "audioGain-source";
  gain.node.append(gainSource);
  const inherit = checkbox(gain.node, "gainInherited", text("inherit", "\uC804\uC5ED/\uC0AC\uC774\uD2B8 Gain \uC0C1\uC18D"));
  checkbox(gain.node, "audioDefault", text("default", "\uC0C8 \uC601\uC0C1\uC5D0\uC11C \uC624\uB514\uC624 \uBCF4\uC815 \uC790\uB3D9 \uCF1C\uAE30"));
  gainInput.addEventListener("input", () => {
    if (gainInput.disabled) return;
    const value = Number(gainInput.value);
    if (Number.isFinite(value) && value >= 0 && value <= 2) {
      gainValue.textContent = `${(value * 100).toFixed(2)}%`;
      actions.edit({ audioGain: value, gainInherited: false });
    }
  });
  gainInput.addEventListener("dblclick", () => {
    if (!gainInput.disabled) actions.edit({ audioGain: 1, gainInherited: false });
  });
  const comp = section("compressor", text("compressor", "\uCEF4\uD504\uB808\uC11C"));
  checkbox(comp.header, "compressorEnabled", text("use", "\uC0AC\uC6A9"));
  const dials = element("div", "", "f01-dials");
  comp.node.append(dials);
  const compFields = KnifeMediaProfiles.audioFields.filter((field) => field.type === "range");
  function resetButton(parent, id, fields) {
    const button = element("button", text("reset", "\uAE30\uBCF8\uAC12"));
    button.id = id;
    button.type = "button";
    parent.append(button);
    button.addEventListener("click", () => {
      if (!button.disabled) {
        for (const field of fields) resetDrafts.get(field.id)?.();
        actions.edit(Object.fromEntries(fields.map((f) => [f.id, f.defaultValue])));
        actions.draftChanged?.();
      }
    });
    renders.push((next) => {
      button.disabled = !next.editable;
    });
  }
  resetButton(comp.header, "audio-comp-reset", compFields);
  for (const field of compFields) {
    const id = field.id, scale = /Attack|Release/.test(id) ? 1e3 : 1;
    const min = field.min * scale, max = field.max * scale;
    const title = id.slice("compressor".length), unit = scale === 1e3 ? "ms" : field.unit || ":1";
    const wrapper = element("div", "", "f01-dial-control"), caption = element("label", title);
    caption.htmlFor = `${id}-number`;
    wrapper.append(caption);
    const dial = range(wrapper, id, min, max, `${title} ${unit}`);
    dial.className = "f01-dial";
    dial.setAttribute("role", "slider");
    dial.setAttribute("aria-valuemin", String(min));
    dial.setAttribute("aria-valuemax", String(max));
    const numberRow = element("div", "", "f01-number-row"), number = element("input");
    number.type = "number";
    number.id = `${id}-number`;
    number.min = String(min);
    number.max = String(max);
    number.step = "any";
    number.setAttribute("aria-label", `${title} ${unit}`);
    numberRow.append(number, element("span", unit));
    wrapper.append(numberRow);
    dials.append(wrapper);
    controls.push(number);
    let value = Number(field.defaultValue) * scale, drag = null;
    const show = () => {
      dial.value = String(value);
      dial.setAttribute("aria-valuenow", String(value));
      dial.setAttribute("aria-valuetext", `${value.toFixed(2)} ${unit}`);
      dial.style.setProperty("--f01-angle", `${-135 + (value - min) / (max - min) * 270}deg`);
      if (doc.activeElement !== number && !invalidDrafts.has(id)) number.value = value.toFixed(2);
    };
    const change = (next) => {
      invalidDrafts.delete(id);
      number.setAttribute("aria-invalid", "false");
      value = next;
      show();
      actions.edit({ [id]: value / scale });
    };
    number.addEventListener("input", () => {
      const next = number.value.trim() ? Number(number.value) : NaN;
      const valid = Number.isFinite(next) && next >= min && next <= max;
      number.setAttribute("aria-invalid", String(!valid));
      if (valid) invalidDrafts.delete(id);
      else invalidDrafts.add(id);
      if (valid && !number.disabled) change(next);
      actions.draftChanged?.();
    });
    number.addEventListener("blur", () => {
      if (number.value.trim() && Number.isFinite(Number(number.value))) number.value = Number(number.value).toFixed(2);
    });
    dial.addEventListener("input", () => {
      if (!dial.disabled) change(Number(dial.value));
    });
    dial.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || dial.disabled) return;
      event.preventDefault();
      dial.focus();
      drag = { id: event.pointerId, y: event.clientY };
      dial.setPointerCapture?.(event.pointerId);
    });
    dial.addEventListener("pointermove", (event) => {
      if (!drag || drag.id !== event.pointerId || dial.disabled) return;
      event.preventDefault();
      const next = Math.min(max, Math.max(min, value + (drag.y - event.clientY) * (max - min) / 160));
      drag.y = event.clientY;
      change(next);
    });
    const end = () => {
      drag = null;
    };
    for (const type of ["pointerup", "pointercancel", "lostpointercapture", "blur"]) dial.addEventListener(type, end);
    resetDrafts.set(id, () => {
      invalidDrafts.delete(id);
      number.setAttribute("aria-invalid", "false");
      number.value = (Number(field.defaultValue) * scale).toFixed(2);
    });
    for (const input of [dial, number]) input.addEventListener("dblclick", () => {
      if (!input.disabled) {
        resetDrafts.get(id)();
        change(Number(field.defaultValue) * scale);
        actions.draftChanged?.();
      }
    });
    renders.push((next) => {
      if (doc.activeElement !== number && !drag) {
        value = Number(Reflect.get(next.values, id)) * scale;
        show();
      }
    });
  }
  comp.node.append(element("small", text("dial_hint", "\uC704\uC544\uB798 \uB4DC\uB798\uADF8 \xB7 \uB354\uBE14\uD074\uB9AD \uAE30\uBCF8\uAC12 \xB7 \uC22B\uC790/\uBC29\uD5A5\uD0A4 \uC785\uB825")));
  const eq = section("eq", text("eq", "\uC774\uD004\uB77C\uC774\uC800 \xB7 8\uB300\uC5ED"));
  checkbox(eq.header, "eqEnabled", text("use", "\uC0AC\uC6A9"));
  const eqFields = KnifeMediaProfiles.audioFieldsV2.filter((field) => /^eq\d+$/.test(field.id) && field.type === "range");
  resetButton(eq.header, "audio-eq-reset", eqFields);
  const scroll = element("div", "", "f01-eq-scroll"), shell = element("div", "", "f01-eq-shell"), axis = element("div", "", "f01-eq-axis");
  axis.setAttribute("aria-hidden", "true");
  for (const db of [6, 4, 2, 0, -2, -4, -6]) axis.append(element("span", `${db > 0 ? "+" : ""}${db}`));
  shell.append(axis);
  scroll.append(shell);
  eq.node.append(scroll);
  for (const field of eqFields) {
    const id = field.id, band = element("div", "", "f01-eq-band"), hz = Number(id.slice(2));
    const caption = element("label", hz >= 1e3 ? `${hz / 1e3}k` : String(hz));
    caption.htmlFor = id;
    band.append(caption);
    const input = range(band, id, -6, 6, `${hz} Hz dB`);
    input.className = "f01-eq-fader";
    input.setAttribute("orient", "vertical");
    const value = element("input", "", "f01-value");
    value.type = "number";
    value.id = `${id}-value`;
    value.min = "-6";
    value.max = "6";
    value.step = "any";
    value.setAttribute("aria-label", `${hz} Hz dB`);
    controls.push(value);
    band.append(value);
    shell.append(band);
    resetDrafts.set(id, () => {
      invalidDrafts.delete(id);
      value.setAttribute("aria-invalid", "false");
      value.value = "0.00";
    });
    input.addEventListener("input", () => {
      if (!input.disabled) {
        invalidDrafts.delete(id);
        value.setAttribute("aria-invalid", "false");
        value.value = Number(input.value).toFixed(2);
        actions.edit({ [id]: Number(input.value) });
        actions.draftChanged?.();
      }
    });
    value.addEventListener("input", () => {
      const current = value.value.trim() ? Number(value.value) : NaN, valid = Number.isFinite(current) && current >= -6 && current <= 6;
      value.setAttribute("aria-invalid", String(!valid));
      if (valid) invalidDrafts.delete(id);
      else invalidDrafts.add(id);
      if (valid && !value.disabled) {
        input.value = String(current);
        actions.edit({ [id]: current });
      }
      actions.draftChanged?.();
    });
    value.addEventListener("blur", () => {
      if (!invalidDrafts.has(id)) value.value = Number(value.value).toFixed(2);
    });
    for (const control of [input, value]) control.addEventListener("dblclick", () => {
      if (!control.disabled) {
        resetDrafts.get(id)();
        actions.edit({ [id]: 0 });
        actions.draftChanged?.();
      }
    });
    renders.push((next) => {
      input.value = String(Reflect.get(next.values, id));
      if (doc.activeElement !== value && !invalidDrafts.has(id)) value.value = Number(Reflect.get(next.values, id)).toFixed(2);
    });
  }
  const normalizer = section("normalizer", text("normalizer", "\uC790\uB3D9 \uC74C\uB7C9 \uBCF4\uC815"));
  checkbox(normalizer.header, "normalizerEnabled", text("use", "\uC0AC\uC6A9"));
  const targetLabel = element("label", text("target", "\uBAA9\uD45C \uC74C\uB7C9 (dBFS)"));
  targetLabel.htmlFor = "normalizerTargetDbfs";
  normalizer.node.append(targetLabel);
  const target = element("input");
  target.type = "number";
  target.id = "normalizerTargetDbfs";
  target.min = "-30";
  target.max = "-12";
  target.step = "any";
  controls.push(target);
  normalizer.node.append(target);
  target.addEventListener("input", () => {
    const value = target.value.trim() ? Number(target.value) : NaN, valid = Number.isFinite(value) && value >= -30 && value <= -12;
    target.setAttribute("aria-invalid", String(!valid));
    if (valid) invalidDrafts.delete(target.id);
    else invalidDrafts.add(target.id);
    if (valid && !target.disabled) actions.edit({ normalizerTargetDbfs: value });
    actions.draftChanged?.();
  });
  target.addEventListener("blur", () => {
    if (!invalidDrafts.has(target.id)) target.value = Number(target.value).toFixed(2);
  });
  master.addEventListener("click", () => {
    if (state && !master.disabled) actions.wanted(!state.wanted);
  });
  const curve = (values) => values.map((value, index) => `${index ? "L" : "M"}${(index * 260 / (values.length - 1)).toFixed(2)},${value.toFixed(2)}`).join(" ");
  function draw(values) {
    const threshold = values.compressorThreshold, knee = values.compressorKnee, ratio = values.compressorRatio;
    compGraph.setAttribute("d", curve(Array.from({ length: 101 }, (_, i) => {
      const x = i - 100, offset = x - threshold;
      const y = !values.compressorEnabled ? x : offset < -knee / 2 ? x : offset > knee / 2 || knee === 0 ? threshold + offset / ratio : x + (1 / ratio - 1) * (offset + knee / 2) ** 2 / (2 * knee);
      return -y * 1.1;
    })));
    eqGraph.setAttribute("d", curve(Array.from({ length: 129 }, (_, i) => {
      const frequency = 20 * 1e3 ** (i / 128), w = 2 * Math.PI * frequency / 48e3;
      let db = 0;
      if (values.eqEnabled) for (const field of eqFields) {
        const a = 10 ** (Number(values[field.id]) / 40), w0 = 2 * Math.PI * Number(field.id.slice(2)) / 48e3, alpha = Math.sin(w0) / 2;
        const b = [1 + alpha * a, -2 * Math.cos(w0), 1 - alpha * a], c = [1 + alpha / a, -2 * Math.cos(w0), 1 - alpha / a];
        const power = (v) => (v[0] + v[1] * Math.cos(w) + v[2] * Math.cos(2 * w)) ** 2 + (v[1] * Math.sin(w) + v[2] * Math.sin(2 * w)) ** 2;
        db += 10 * Math.log10(power(b) / power(c));
      }
      return 55 - Math.max(-12, Math.min(12, db)) * 4;
    })));
  }
  return { hasDraft: () => invalidDrafts.size > 0, render(next) {
    state = next;
    for (const input of controls) input.disabled = !next.editable;
    for (const render of renders) render(next);
    gainInput.value = String(next.effectiveGain ?? 1);
    gainValue.textContent = next.effectiveGain === null ? "\u2014" : `${(next.effectiveGain * 100).toFixed(2)}%`;
    gainInput.setAttribute("aria-valuetext", next.effectiveGain === null ? text("gain_unconfirmed", "\uAE30\uC874 \uC0AC\uC774\uD2B8 Gain \uD655\uC778 \uD544\uC694") : gainValue.textContent);
    const source = next.gainOrigin === "site-legacy" && next.effectiveGain !== null ? "site-read" : next.gainOrigin === "global-owned" && !next.globalScope && next.values.gainInherited ? "global-inherited" : next.gainOrigin;
    gainSource.textContent = text(`source_${source}`, source === "site-read" ? "\uC0AC\uC774\uD2B8 Gain \uC77D\uAE30 \uD655\uC778\uAC12" : source === "global-inherited" ? "\uC804\uC5ED Gain \uC0C1\uC18D" : next.gainOrigin === "site-legacy" ? "\uC0AC\uC774\uD2B8 Gain \uBBF8\uD655\uC778" : next.gainOrigin === "channel-owned" ? "\uCC44\uB110 \uC800\uC7A5\uAC12" : "\uC804\uC5ED \uC800\uC7A5\uAC12");
    inherit.parentElement.lastChild.textContent = next.globalScope ? text("inherit_site", "\uAE30\uC874 \uC0AC\uC774\uD2B8 Gain \uC0AC\uC6A9") : text("inherit_global", "\uC804\uC5ED Gain \uC0AC\uC6A9");
    master.disabled = !next.masterAvailable;
    master.textContent = next.wanted ? text("on", "\uC624\uB514\uC624 \uBCF4\uC815 ON") : text("off", "\uC624\uB514\uC624 \uBCF4\uC815 OFF");
    master.setAttribute("aria-pressed", String(next.wanted));
    masterState.textContent = next.masterStatus + (next.masterAvailable && !next.wanted ? " " + text("off_note", "\uC804\uCCB4 OFF: \uC124\uC815\uC744 \uD3B8\uC9D1\xB7\uC800\uC7A5\uD560 \uC218 \uC788\uC9C0\uB9CC \uC18C\uB9AC\uC5D0\uB294 \uC801\uC6A9\uB418\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.") : "");
    if (doc.activeElement !== target && !invalidDrafts.has(target.id)) target.value = next.values.normalizerTargetDbfs.toFixed(2);
    draw(next.values);
  } };
};
