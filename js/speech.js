// Text-to-speech (American voices), speech recognition, voice recording, and a
// tiny IndexedDB store so parents can listen back to recordings.
import { state } from './state.js';

const synth = window.speechSynthesis;
export const hasTTS = !!synth;

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
export const hasASR = !!SR;
export const hasRecorder = !!(navigator.mediaDevices && window.MediaRecorder);

// ---------------- voices ----------------
let voiceCache = [];
function loadVoices() {
  if (!synth) return [];
  voiceCache = synth.getVoices();
  return voiceCache;
}
if (synth) {
  loadVoices();
  synth.addEventListener?.('voiceschanged', loadVoices);
}

export function voicesReady(timeout = 1500) {
  return new Promise((resolve) => {
    if (loadVoices().length) return resolve(voiceCache);
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (loadVoices().length || Date.now() - t0 > timeout) {
        clearInterval(iv);
        resolve(voiceCache);
      }
    }, 100);
  });
}

// Higher = more natural sounding. Neural/"Natural"/"Enhanced" voices are much better.
const PREFERRED = [/natural/i, /neural/i, /premium/i, /enhanced/i, /google us english/i, /samantha/i,
  /aria/i, /jenny/i, /guy/i, /ava/i, /allison/i, /evan/i, /nathan/i, /zoe/i, /alex/i];

export function americanVoices() {
  const us = voiceCache.filter((v) => /^en[-_]US/i.test(v.lang));
  const score = (v) => {
    const i = PREFERRED.findIndex((re) => re.test(v.name));
    return (i === -1 ? 0 : 100 - i) + (v.localService ? 0 : 5);
  };
  return us.sort((a, b) => score(b) - score(a));
}

function currentVoice(which = 'main') {
  const list = americanVoices();
  if (!list.length) return voiceCache.find((v) => /^en/i.test(v.lang)) || null;
  if (which === 'main') {
    return list.find((v) => v.voiceURI === state.settings.voiceURI) || list[0];
  }
  // a second, different voice for dialogue partners
  const main = currentVoice('main');
  return list.find((v) => v !== main) || main;
}

let speakToken = 0;
/**
 * Speak English text. Resolves when finished (or cancelled).
 * opts: { rate, voice: 'main'|'alt', onWord(charIndex) }
 */
export function speak(text, opts = {}) {
  return new Promise((resolve) => {
    if (!synth) return resolve();
    const token = ++speakToken;
    synth.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = currentVoice(opts.voice || 'main');
    if (v) u.voice = v;
    u.lang = 'en-US';
    u.rate = (opts.rate || 1) * state.settings.rate;
    u.pitch = opts.pitch || 1;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearInterval(keepAlive);
      resolve(token === speakToken);
    };
    u.onend = finish;
    u.onerror = finish;
    if (opts.onWord) u.onboundary = (e) => e.name !== 'sentence' && opts.onWord(e.charIndex);
    // Chrome stops long utterances after ~15s unless poked.
    const keepAlive = setInterval(() => {
      if (!synth.speaking) return;
      synth.pause();
      synth.resume();
    }, 10000);
    // safety timeout in case onend never fires (some Android builds)
    setTimeout(finish, 2000 + text.length * 150 / u.rate);
    synth.speak(u);
  });
}

export function stopSpeaking() {
  speakToken++;
  linesSession++;
  synth?.cancel();
}

/** Speak a list of lines one after another (stories, dialogues). Resolves false if interrupted. */
let linesSession = 0;
export async function speakLines(lines, opts = {}) {
  const my = ++linesSession;
  for (let i = 0; i < lines.length; i++) {
    if (my !== linesSession) return false;
    opts.onLine?.(i);
    const line = lines[i];
    const ok = await speak(typeof line === 'string' ? line : line.text, { ...opts, voice: line.voice || opts.voice });
    if (!ok || my !== linesSession) return false;
    await new Promise((r) => setTimeout(r, opts.gap ?? 250));
  }
  opts.onLine?.(-1);
  return true;
}

// ---------------- speech recognition ----------------
let activeRec = null;

/**
 * Listen for one utterance.
 * Resolves { alts: string[], error?: string }
 */
export function recognize({ onInterim, maxAlternatives = 5, timeout = 12000 } = {}) {
  return new Promise((resolve) => {
    if (!SR) return resolve({ alts: [], error: 'unsupported' });
    stopSpeaking();
    stopRecognize();
    const r = new SR();
    activeRec = r;
    r.lang = 'en-US';
    r.continuous = false;
    r.interimResults = !!onInterim;
    r.maxAlternatives = maxAlternatives;
    let results = null;
    let error = '';
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (activeRec === r) activeRec = null;
      const alts = [];
      if (results && results.length) {
        if (results.length === 1) {
          for (let k = 0; k < results[0].length; k++) alts.push(results[0][k].transcript.trim());
        } else {
          alts.push(Array.from(results).map((res) => res[0].transcript.trim()).join(' '));
        }
      }
      resolve({ alts: alts.filter(Boolean), error });
    };
    r.onresult = (e) => {
      results = e.results;
      if (onInterim) {
        const txt = Array.from(e.results).map((res) => res[0].transcript).join(' ');
        onInterim(txt);
      }
    };
    r.onerror = (e) => {
      error = e.error === 'no-speech' ? '' : e.error;
    };
    r.onend = finish;
    const timer = setTimeout(() => {
      try { r.stop(); } catch { /* ignore */ }
      setTimeout(finish, 800);
    }, timeout);
    try {
      r.start();
    } catch (e) {
      error = 'start-failed';
      finish();
    }
  });
}

export function stopRecognize() {
  if (activeRec) {
    try { activeRec.stop(); } catch { /* ignore */ }
  }
}

/**
 * Long-form transcription (free talk). Restarts automatically when the
 * browser ends recognition after a pause.
 */
export class LiveTranscriber {
  constructor(onUpdate) {
    this.onUpdate = onUpdate;
    this.finals = [];
    this.interim = '';
    this.active = false;
    this.error = '';
  }

  get text() {
    return (this.finals.join(' ') + ' ' + this.interim).trim();
  }

  start() {
    if (!SR) {
      this.error = 'unsupported';
      return;
    }
    stopSpeaking();
    this.active = true;
    this._spawn();
  }

  _spawn() {
    const r = new SR();
    this.rec = r;
    r.lang = 'en-US';
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (res.isFinal) this.finals.push(res[0].transcript.trim());
        else interim += res[0].transcript;
      }
      this.interim = interim;
      this.onUpdate?.(this.text);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') {
        this.error = e.error;
        this.active = false;
      }
    };
    r.onend = () => {
      if (this.interim) {
        this.finals.push(this.interim.trim());
        this.interim = '';
      }
      if (this.active) setTimeout(() => this.active && this._spawn(), 150);
    };
    try { r.start(); } catch { /* already started */ }
  }

  stop() {
    this.active = false;
    try { this.rec?.stop(); } catch { /* ignore */ }
    return new Promise((r) => setTimeout(() => r(this.text), 700));
  }
}

// ---------------- recording ----------------
let micStream = null;
async function getMic() {
  if (micStream && micStream.active) return micStream;
  micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  return micStream;
}

/** Start recording. Returns { stop(): Promise<Blob|null> } or null if unavailable. */
export async function startRecording() {
  if (!hasRecorder) return null;
  try {
    const stream = await getMic();
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'];
    const mimeType = types.find((t) => MediaRecorder.isTypeSupported?.(t));
    const rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.start();
    return {
      stop: () => new Promise((resolve) => {
        if (rec.state === 'inactive') return resolve(null);
        rec.onstop = () => resolve(chunks.length ? new Blob(chunks, { type: rec.mimeType || 'audio/webm' }) : null);
        rec.stop();
      }),
    };
  } catch {
    return null;
  }
}

export function releaseMic() {
  micStream?.getTracks().forEach((t) => t.stop());
  micStream = null;
}

export function playBlob(blob) {
  return new Promise((resolve) => {
    if (!blob) return resolve();
    stopSpeaking();
    const url = URL.createObjectURL(blob);
    const a = new Audio(url);
    a.onended = a.onerror = () => {
      URL.revokeObjectURL(url);
      resolve();
    };
    a.play().catch(() => resolve());
  });
}

// ---------------- recordings store (IndexedDB) ----------------
const DB = 'slk-recordings';
function db() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('rec', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const MAX_RECORDINGS = 40;

export async function saveRecording(meta, blob) {
  if (!blob) return;
  try {
    const d = await db();
    await new Promise((res, rej) => {
      const tx = d.transaction('rec', 'readwrite');
      tx.objectStore('rec').add({ ...meta, blob, at: Date.now() });
      tx.oncomplete = res;
      tx.onerror = () => rej(tx.error);
    });
    const all = await listRecordings();
    for (const r of all.slice(MAX_RECORDINGS)) await deleteRecording(r.id);
  } catch { /* storage unavailable */ }
}

export async function listRecordings() {
  try {
    const d = await db();
    return await new Promise((res, rej) => {
      const req = d.transaction('rec').objectStore('rec').getAll();
      req.onsuccess = () => res(req.result.sort((a, b) => b.at - a.at));
      req.onerror = () => rej(req.error);
    });
  } catch {
    return [];
  }
}

export async function deleteRecording(id) {
  const d = await db();
  return new Promise((res) => {
    const tx = d.transaction('rec', 'readwrite');
    tx.objectStore('rec').delete(id);
    tx.oncomplete = res;
    tx.onerror = res;
  });
}
