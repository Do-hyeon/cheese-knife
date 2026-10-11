// Reproducible transforms of one exact upstream distribution.
// The original Apache-2.0 code and its license remain in the private bundle.
export const ORIGINAL_SHA256 = '947b45be1392e39569d4aefc2cff9ff6ecbe6cc246cf67ab12ece0c41c24b793';
export const ORIGINAL_LICENSE_SHA256 = 'ca8773cf798c7ed997d4dd7c8e23c348699f8d5b7462636694cc14de6cda12db';
export const HARDENING_REVISION = 'parser-bounds-v2';

function replaceOnce(source, before, after) {
  if (source.split(before).length !== 2) throw new Error('HLS hardening anchor changed: ' + before.slice(0, 80));
  return source.replace(before, after);
}

const helpers = `
function knifeHlsReject(reason) {
  var error = new Error('Invalid HLS input: ' + reason);
  error.code = 'KNIFE_HLS_INVALID_INPUT';
  throw error;
}
function knifeHlsDropMetadata(reason) {
  var error = new Error('Optional HLS metadata exceeds bounds: ' + reason);
  error.code = 'KNIFE_HLS_OPTIONAL_METADATA_BOUNDS';
  throw error;
}
function knifeHlsNalCodec(codec) {
  return typeof codec === 'string' && ['avc1', 'avc3', 'hvc1', 'hev1', 'dvh1', 'dvhe'].indexOf(codec.slice(0, 4)) !== -1;
}
function knifeHlsSampleBudgetAllows(total, inputLength) {
  return total <= Math.min(16777216, inputLength * 4);
}
function knifeHlsValidateRuns(data, selected) {
  var total = 0, trafs = me(data, ['moof', 'traf']);
  for (var i = 0; i < trafs.length; i++) {
    var headers = me(trafs[i], ['tfhd']);
    if (headers.length !== 1 || headers[0].length < 8) knifeHlsReject('tfhd extent or multiplicity');
    var header = headers[0], id = ce(header, 4);
    if (typeof selected === 'number' ? id !== selected : !selected[id]) continue;
    var flags = ce(header, 0) & 0xffffff;
    var needed = 8 + ((flags & 1) ? 8 : 0) + ((flags & 2) ? 4 : 0) + ((flags & 8) ? 4 : 0) + ((flags & 16) ? 4 : 0) + ((flags & 32) ? 4 : 0);
    if (needed > header.length) knifeHlsReject('tfhd optional fields');
    var times = me(trafs[i], ['tfdt']);
    for (var j = 0; j < times.length; j++) {
      if (times[j].length < (times[j][0] === 1 ? 12 : 8)) knifeHlsReject('tfdt extent');
    }
    var runs = me(trafs[i], ['trun']);
    for (var j = 0; j < runs.length; j++) {
      var run = runs[j];
      if (run.length < 8) knifeHlsReject('trun fixed fields');
      var flags = ce(run, 0) & 0xffffff, count = ce(run, 4);
      var headerSize = 8 + ((flags & 1) ? 4 : 0) + ((flags & 4) ? 4 : 0);
      var width = 4 * (((flags & 256) ? 1 : 0) + ((flags & 512) ? 1 : 0) + ((flags & 1024) ? 1 : 0) + ((flags & 2048) ? 1 : 0));
      total += count;
      if (headerSize > run.length || total > 100000 || (width && count > Math.floor((run.length - headerSize) / width))) knifeHlsReject('trun record extent or work budget');
    }
  }
}
function knifeHlsParseEmsg(data) {
  var version = data[0], offset = version === 1 ? 24 : 0;
  if ((version !== 0 && version !== 1) || data.length < (version === 1 ? 26 : 28)) return null;
  function terminated() {
    var window = data.subarray(offset, Math.min(data.length, offset + 4097));
    var relativeEnd = window.indexOf(0);
    if (relativeEnd < 0) return null;
    var end = offset + relativeEnd;
    var value = he(data.subarray(offset, end + 1));
    offset = end + 1;
    return value;
  }
  var scheme = terminated(), value = scheme === null ? null : terminated();
  if (value === null) return null;
  var scale, time = 0, delta = 0, duration, id;
  if (version === 0) {
    // Preserve the pinned parser's existing v0 fixed-field interpretation.
    scale = ce(data, 12); delta = ce(data, 16); duration = ce(data, 20); id = ce(data, 24); offset = 28;
  } else {
    scale = ce(data, 4); time = Math.pow(2, 32) * ce(data, 8) + ce(data, 12);
    if (!R(time)) time = Number.MAX_SAFE_INTEGER;
    duration = ce(data, 16); id = ce(data, 20);
  }
  return { schemeIdUri: scheme, value: value, timeScale: scale, presentationTime: time, presentationTimeDelta: delta, eventDuration: duration, id: id, payload: data.subarray(offset) };
}
`;

const id3Parser = `function Jr(e) {
  var offset = 0, frames = [], count = 0;
  while (Fr(e, offset)) {
    var size = Mr(e, offset + 6), flags = e[offset + 5];
    if (size > 1048576 || size > e.length - offset - 10) return [];
    var end = offset + 10 + size;
    offset += 10;
    // The pinned parser skips ten bytes for its extended-header mode.
    // Keep that accepted interpretation while containing it in this tag.
    if (flags & 64) { if (offset + 10 > end) return []; offset += 10; }
    while (offset + 10 <= end) {
      if (e[offset] === 0) {
        for (var padding = offset; padding < end; padding++) if (e[padding] !== 0) return [];
        break;
      }
      if (++count > 4096) return [];
      var frame = Qr(e.subarray(offset, end));
      if (frame.size > end - offset - 10) return [];
      var decoded = zr(frame);
      if (decoded) frames.push(decoded);
      offset += 10 + frame.size;
    }
    for (var tail = offset; tail < end; tail++) if (e[tail] !== 0) return [];
    offset = end;
    if (Or(e, offset)) offset += 10;
  }
  return frames;
}`;

export function hardenHls(source) {
  source = replaceOnce(source, 'function ke(e,t){', helpers + 'function ke(e,t){knifeHlsValidateRuns(t.samples,t.id);var knifeHlsNals=0,knifeHlsBytes=0;try{');
  source = replaceOnce(source, 'var l=o.byteOffset-8;me(o,["traf"])', 'var l=o.byteOffset-i.byteOffset-8;me(o,["traf"])');
  source = replaceOnce(source, 'me(o,["traf"]).map((function(o){var u=me(o,["tfdt"])', 'me(o,["traf"]).map((function(o){var knifeHlsNextOffset;var u=me(o,["tfdt"])');
  source = replaceOnce(source, 'd=0!=(1&u),h=0,c=0!=(4&u)', 'd=0!=(1&u),h=knifeHlsNextOffset===undefined?0:knifeHlsNextOffset-l,c=0!=(4&u)');
  source = replaceOnce(source, 'd&&(h=ce(n,R),R+=4),c&&(R+=4);', 'd&&(h=ge(n,R),R+=4),c&&(R+=4);');
  source = replaceOnce(source, 'if(g?(m=ce(n,R),R+=4):m=f,p?(y=ce(n,R),R+=4):y=v,E&&(R+=4),T&&(S=0===o?ce(n,R):ge(n,R),R+=4),t.type===te)for(var k=0;k<y;){var D=ce(i,A);',
    'if(g?(m=ce(n,R),R+=4):m=f,p?(y=ce(n,R),R+=4):y=v,E&&(R+=4),T&&(S=0===o?ce(n,R):ge(n,R),R+=4),knifeHlsBytes+=y,!Number.isSafeInteger(A)||A<0||y>i.length-A||!knifeHlsSampleBudgetAllows(knifeHlsBytes,i.length))knifeHlsDropMetadata("sample extent or aggregate byte budget");if(t.type===te&&knifeHlsNalCodec(t.codec))for(var k=0;k<y;){if(++knifeHlsNals>100000||y-k<4)knifeHlsDropMetadata("NAL header or work budget");var D=ce(i,A);if(D>y-k-4)knifeHlsDropMetadata("NAL payload extent");');
  source = replaceOnce(source, 'A+=D,k+=D+4}e+=m/a}}))', 'A+=D,k+=D+4}else A+=y;e+=m/a}knifeHlsNextOffset=A;}))');
  source = replaceOnce(source, '})),r}function De(e){', '})),r}catch(knifeHlsError){if(knifeHlsError&&knifeHlsError.code==="KNIFE_HLS_OPTIONAL_METADATA_BOUNDS")return [];throw knifeHlsError}}function De(e){');
  source = replaceOnce(source, 'var v=function(e,t,r){for(var i={},a=me(e,["moof","traf"])', 'var v=function(e,t,r){knifeHlsValidateRuns(e,t);for(var i={},a=me(e,["moof","traf"])');

  const skip = 'case"SKIP":c.skippedSegments&&gr(c,P,l);var O=new Ht(x,c),F=O.decimalInteger("SKIPPED-SEGMENTS");if(L(F)){';
  source = replaceOnce(source, skip,
    'case"SKIP":if(c._knifeHlsSkipSeen){gr(c,P,l);return c}c._knifeHlsSkipSeen=true;var O=new Ht(x,c),F=Number(O["SKIPPED-SEGMENTS"]);if(typeof O["SKIPPED-SEGMENTS"]!=="string"||!/^[0-9]+$/.test(O["SKIPPED-SEGMENTS"])||!Number.isSafeInteger(F)||F<0||F>10000){c.playlistParsingError=new Error("Invalid SKIPPED-SEGMENTS extent or work budget");return c}if(L(F)){');

  const emsgStart = 'var a=function(e){var t=e[0],r="",i="",a=0,n=0,s=0,o=0,l=0,u=0;';
  const emsgEnd = '}(e);if(Ri.test(a.schemeIdUri))';
  const start = source.indexOf(emsgStart), end = source.indexOf(emsgEnd, start);
  if (start < 0 || end < 0 || source.indexOf(emsgStart, start + 1) !== -1) throw new Error('HLS emsg transform anchor changed');
  source = source.slice(0, start) + 'var a=knifeHlsParseEmsg(e);if(!a)return;if(Ri.test(a.schemeIdUri))' + source.slice(end + emsgEnd.length);

  const id3Start = source.indexOf('function Jr(e){'), id3End = source.indexOf('function ei(e){', id3Start);
  if (id3Start < 0 || id3End < 0 || source.indexOf('function Jr(e){', id3Start + 1) !== -1) throw new Error('HLS ID3 transform anchor changed');
  source = source.slice(0, id3Start) + id3Parser + source.slice(id3End);
  return source;
}
