"""Pre-generate natural American-English voice clips with Kokoro-82M (Apache-2.0).

    node tools/collect-texts.mjs          # -> tools/texts.json
    python tools/gen_audio.py             # -> audio/<voice>/<id>.mp3 (+ <id>-s.mp3 slow) and audio/manifest.json

Needs:  pip install "kokoro>=0.9.4" soundfile   and ffmpeg on PATH.
Re-running only generates clips that are missing, so it is safe to run after editing the data files.
"""
import json, os, subprocess, sys, time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / 'audio'
SR = 24000
VOICES = {'main': 'af_heart', 'female': 'af_bella', 'male': 'am_michael'}  # keep in sync with js/audio-keys.js
SLOW_SPEED = 0.65  # keep in sync with js/audio-keys.js


def clip_id(text: str) -> str:
    """Same FNV-1a hash (over UTF-16 code units) as clipId() in js/audio-keys.js; texts arrive normalized."""
    h = 0x811C9DC5
    b = text.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= int.from_bytes(b[i:i + 2], 'little')
        h = (h * 0x01000193) & 0xFFFFFFFF
    return f'{h:08x}'


def to_mp3(audio: np.ndarray, out: Path):
    pad = np.zeros(int(SR * 0.06), dtype=np.float32)
    pcm = (np.clip(np.concatenate([pad, audio.astype(np.float32), pad]), -1, 1) * 32767).astype('<i2').tobytes()
    tmp = out.with_suffix('.tmp.mp3')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '1', '-i', '-',
                    '-codec:a', 'libmp3lame', '-b:a', '40k', str(tmp)], input=pcm, check=True)
    os.replace(tmp, out)


def main():
    texts = json.loads((ROOT / 'tools' / 'texts.json').read_text(encoding='utf-8'))
    from kokoro import KPipeline
    pipe = KPipeline(lang_code='a', repo_id='hexgrad/Kokoro-82M')

    jobs = []
    for it in texts:
        cid = clip_id(it['text'])
        folder = AUDIO / VOICES[it['voice']]
        jobs.append((it, folder / f'{cid}.mp3', 1.0))
        if it['voice'] == 'main':
            jobs.append((it, folder / f'{cid}-s.mp3', SLOW_SPEED))
    todo = [j for j in jobs if not j[1].exists()]
    print(f'{len(jobs)} clips, {len(todo)} to generate', flush=True)

    t0 = time.time()
    for n, (it, out, speed) in enumerate(todo, 1):
        out.parent.mkdir(parents=True, exist_ok=True)
        parts = [r.audio.numpy() for r in pipe(it['text'], voice=VOICES[it['voice']], speed=speed) if r.audio is not None]
        if not parts:
            print('  !! no audio for', repr(it['text']), flush=True)
            continue
        to_mp3(np.concatenate(parts), out)
        if n % 25 == 0 or n == len(todo):
            el = time.time() - t0
            print(f'  {n}/{len(todo)}  {el / 60:.1f} min elapsed, ~{el / n * (len(todo) - n) / 60:.0f} min left', flush=True)

    # Manifest: which clips exist, so the app never requests a missing file.
    manifest = {'voices': VOICES, 'clips': {}}
    for key, voice in VOICES.items():
        folder = AUDIO / voice
        names = sorted(p.stem for p in folder.glob('*.mp3')) if folder.exists() else []
        manifest['clips'][voice] = {
            'n': [s for s in names if not s.endswith('-s') and not s.endswith('.tmp')],
            's': [s[:-2] for s in names if s.endswith('-s')],
        }
    (AUDIO / 'manifest.json').write_text(json.dumps(manifest, separators=(',', ':')), encoding='utf-8')
    print('manifest written', flush=True)


if __name__ == '__main__':
    sys.exit(main())
