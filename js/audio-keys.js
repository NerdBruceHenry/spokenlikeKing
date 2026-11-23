// Shared by the app (js/speech.js) and the audio build script (tools/collect-texts.mjs):
// maps a sentence + voice to the file name of its pre-generated neural-voice clip.

// Kokoro voices (https://huggingface.co/hexgrad/Kokoro-82M, Apache-2.0).
export const VOICES = {
  main: 'af_heart', // Kingsley: warm, natural American female voice
  female: 'af_bella', // female dialogue partners (Mom, Grandma, Mia…)
  male: 'am_michael', // male dialogue partners (Max, Coach Rivera…)
};

// Kokoro "speed" used for the slow clips. 1.0 = natural conversational pace.
export const SLOW_SPEED = 0.65;

const FEMALE_PARTNERS = /^(mom|grandma|mia|olivia|sophie|ms\.|mrs\.|dr\. kim|cashier|customer service|camp director)/i;

/** Which voice a role-play partner speaks with. */
export function partnerVoice(partner = '') {
  return FEMALE_PARTNERS.test(partner) ? 'female' : 'male';
}

export function normText(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

/** Stable 32-bit FNV-1a hash → 8 hex chars. */
export function clipId(text) {
  let h = 0x811c9dc5;
  const s = normText(text);
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}
