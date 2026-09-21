#!/usr/bin/env python3
"""Generate the game's sound effects as real .wav files.

The game ships actual audio assets (audio/*.wav) rather than browser-synthesised
bleeps. They are produced here instead of being downloaded so that every sound
in the repo is originally ours and carries the same MIT licence as the code.

Each cue is built the way a sound designer would layer one: a transient, a body,
a noise element and a tail, run through simple filters and a short room.

    py -3.13 tools/make_sounds.py   # needs numpy; writes ../audio/ (ffmpeg optional)

Nothing at runtime depends on this script - the game just loads the .wav files.
"""
import math
import os
import struct
import wave

import numpy as np

SR = 44100
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'audio')

rng = np.random.default_rng(20260920)


# --- building blocks --------------------------------------------------------

def n_samples(seconds):
    return int(SR * seconds)


def t(seconds):
    return np.arange(n_samples(seconds)) / SR


def env(seconds, attack=0.002, decay=None, curve=4.0, hold=0.0):
    """Percussive attack/decay envelope."""
    n = n_samples(seconds)
    e = np.ones(n)
    a = max(1, int(attack * SR))
    e[:a] = np.linspace(0, 1, a)
    h = int(hold * SR)
    tail = n - a - h
    if tail > 0:
        e[a + h:] = np.exp(-curve * np.linspace(0, 1, tail))
    return e


def tone(freq, seconds, wave_kind='sine', detune=0.0):
    x = t(seconds)
    f = freq * (1 + detune * np.linspace(0, 1, len(x)))
    phase = 2 * np.pi * np.cumsum(f) / SR
    if wave_kind == 'sine':
        return np.sin(phase)
    if wave_kind == 'square':
        return np.sign(np.sin(phase))
    if wave_kind == 'saw':
        return 2 * ((phase / (2 * np.pi)) % 1.0) - 1
    if wave_kind == 'tri':
        return 2 * np.abs(2 * ((phase / (2 * np.pi)) % 1.0) - 1) - 1
    raise ValueError(wave_kind)


def sweep(f0, f1, seconds, wave_kind='sine', log=True):
    x = np.linspace(0, 1, n_samples(seconds))
    f = f0 * (f1 / f0) ** x if log else f0 + (f1 - f0) * x
    phase = 2 * np.pi * np.cumsum(f) / SR
    if wave_kind == 'square':
        return np.sign(np.sin(phase))
    if wave_kind == 'saw':
        return 2 * ((phase / (2 * np.pi)) % 1.0) - 1
    return np.sin(phase)


def noise(seconds):
    return rng.uniform(-1, 1, n_samples(seconds))


def lowpass(x, cutoff):
    """One-pole lowpass. Cheap, and exactly the right amount of dull."""
    a = math.exp(-2 * math.pi * cutoff / SR)
    out = np.empty_like(x)
    prev = 0.0
    for i, v in enumerate(x):
        prev = (1 - a) * v + a * prev
        out[i] = prev
    return out


def highpass(x, cutoff):
    return x - lowpass(x, cutoff)


def bandpass(x, low, high):
    return lowpass(highpass(x, low), high)


def metal(freqs, seconds, decays=None, amps=None):
    """Inharmonic partials - the difference between a 'ding' and a 'clank'."""
    out = np.zeros(n_samples(seconds))
    decays = decays or [6.0] * len(freqs)
    amps = amps or [1.0 / (i + 1) for i in range(len(freqs))]
    for f, d, a in zip(freqs, decays, amps):
        out += a * tone(f, seconds) * env(seconds, attack=0.0008, curve=d)
    return out


def room(x, amount=0.25, size=0.055, taps=6, decay=0.62):
    """Tiny multi-tap delay so cues do not sound like they were made in a vacuum."""
    out = x.copy()
    gain = amount
    for i in range(1, taps + 1):
        d = int(size * SR * i * (1 + 0.13 * i))
        if d >= len(x):
            break
        out[d:] += x[:-d] * gain
        gain *= decay
    return out


def soft_clip(x, drive=1.0):
    return np.tanh(x * drive)


def fit(x, peak=0.85):
    m = np.max(np.abs(x)) or 1.0
    return x / m * peak


def fade_out(x, seconds=0.01):
    n = min(len(x), n_samples(seconds))
    x[-n:] *= np.linspace(1, 0, n)
    return x


def pad(x, seconds):
    """Lay a layer into a buffer of the full cue length."""
    out = np.zeros(n_samples(seconds))
    n = min(len(x), len(out))
    out[:n] += x[:n]
    return out


def at(buf, layer, start):
    """Mix `layer` into `buf` starting at `start` seconds."""
    i = int(start * SR)
    n = min(len(layer), len(buf) - i)
    if n > 0:
        buf[i:i + n] += layer[:n]
    return buf


def write(name, x, peak=0.85):
    x = fade_out(fit(np.nan_to_num(x), peak))
    data = (np.clip(x, -1, 1) * 32767).astype('<i2')
    path = os.path.normpath(os.path.join(OUT, name + '.wav'))
    with wave.open(path, 'wb') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SR)
        f.writeframes(data.tobytes())
    print('%-10s %5.0f ms  %6.1f KB' % (name, len(x) / SR * 1000, os.path.getsize(path) / 1024))


# --- the cues ---------------------------------------------------------------

def cue_click():
    """Socket wrench tick: a hard transient with a little wooden body."""
    d = 0.07
    tick = bandpass(noise(d), 1400, 7000) * env(d, attack=0.0004, curve=60)
    body = tone(220, d) * env(d, attack=0.0004, curve=40) * 0.5
    click = metal([2600, 3900], d, decays=[45, 60], amps=[0.5, 0.3])
    return soft_clip(tick * 1.1 + body + click, 1.3)


def cue_click_big():
    """Heavier ratchet: two ticks and a short metallic ring."""
    d = 0.2
    out = np.zeros(n_samples(d))
    for i, start in enumerate((0.0, 0.035)):
        hit = bandpass(noise(0.08), 1200, 8000) * env(0.08, attack=0.0004, curve=55)
        out = at(out, hit * (1.0 - 0.25 * i), start)
    ring = metal([1180, 1870, 2640], d, decays=[9, 12, 16], amps=[0.5, 0.3, 0.2])
    out += ring * 0.55
    out += pad(tone(120, 0.1) * env(0.1, curve=25), d) * 0.5
    return soft_clip(room(out, 0.12), 1.2)


def cue_buy():
    """Till drawer thunk."""
    d = 0.24
    thump = sweep(160, 70, d) * env(d, attack=0.002, curve=14) * 0.9
    wood = bandpass(noise(0.09), 300, 2400) * env(0.09, attack=0.001, curve=22)
    return soft_clip(thump + pad(wood, d) * 0.6, 1.2)


def cue_sell():
    """Cash register: drawer, then the bell."""
    d = 0.85
    out = np.zeros(n_samples(d))
    drawer = sweep(180, 80, 0.18) * env(0.18, attack=0.002, curve=16)
    out = at(out, drawer * 0.8, 0.0)
    out = at(out, bandpass(noise(0.12), 400, 3000) * env(0.12, curve=18) * 0.5, 0.0)
    bell = metal([1046, 1568, 2093, 3136], 0.7,
                 decays=[3.2, 4.0, 5.5, 7.5], amps=[1.0, 0.7, 0.45, 0.25])
    out = at(out, bell * 0.75, 0.05)
    bell2 = metal([1318, 1975, 2637], 0.55, decays=[3.6, 4.6, 6.0], amps=[0.8, 0.5, 0.3])
    out = at(out, bell2 * 0.55, 0.12)
    return soft_clip(room(out, 0.3), 1.15)


def cue_crate():
    """Crate lid: wood crack, splinters, low thud."""
    d = 0.5
    out = np.zeros(n_samples(d))
    crack = bandpass(noise(0.05), 800, 6000) * env(0.05, attack=0.0005, curve=40)
    out = at(out, crack * 1.0, 0.0)
    thud = sweep(120, 55, 0.3) * env(0.3, attack=0.003, curve=11)
    out = at(out, thud * 0.9, 0.01)
    creak = bandpass(noise(0.22), 500, 2600) * env(0.22, attack=0.03, curve=6)
    creak *= (0.6 + 0.4 * np.sin(2 * np.pi * 11 * t(0.22)))
    out = at(out, creak * 0.45, 0.06)
    for s in (0.14, 0.2, 0.27):
        out = at(out, metal([1900, 2700], 0.09, decays=[22, 28], amps=[0.3, 0.2]), s)
    return soft_clip(room(out, 0.18), 1.2)


def cue_drop():
    """Small part landing on a steel bench."""
    d = 0.3
    out = metal([1830, 2710, 3960, 5200], d,
                decays=[14, 18, 24, 30], amps=[0.7, 0.45, 0.3, 0.18])
    out += pad(bandpass(noise(0.03), 2000, 9000) * env(0.03, curve=50), d) * 0.5
    out = at(out, metal([1830, 2710], 0.12, decays=[26, 30], amps=[0.25, 0.15]), 0.075)
    return soft_clip(room(out, 0.14), 1.1)


def cue_rare():
    """Shimmer arpeggio - something good just dropped."""
    d = 1.0
    out = np.zeros(n_samples(d))
    for i, f in enumerate((784, 1046, 1318, 1568, 2093)):
        bell = metal([f, f * 2.01, f * 2.98], 0.7,
                     decays=[3.0, 4.2, 6.0], amps=[1.0, 0.45, 0.22])
        out = at(out, bell * (0.7 - 0.06 * i), 0.055 * i)
    sparkle = bandpass(noise(0.5), 5000, 12000) * env(0.5, attack=0.05, curve=5)
    out += pad(sparkle, d) * 0.12
    return soft_clip(room(out, 0.38, size=0.07), 1.1)


def cue_craft():
    """Impact driver rattle, then the part seats home."""
    d = 0.55
    out = np.zeros(n_samples(d))
    body = sweep(90, 150, 0.34, 'saw') * env(0.34, attack=0.01, curve=3)
    rattle = 0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 26 * t(0.34)))
    out = at(out, body * rattle * 0.55, 0.0)
    out = at(out, bandpass(noise(0.34), 900, 5200) * env(0.34, attack=0.01, curve=4) * rattle * 0.3, 0.0)
    seat = sweep(220, 90, 0.2) * env(0.2, attack=0.001, curve=13)
    out = at(out, seat * 0.9, 0.32)
    out = at(out, metal([1500, 2300], 0.2, decays=[10, 14], amps=[0.35, 0.2]), 0.32)
    return soft_clip(room(out, 0.16), 1.25)


def cue_error():
    """Dull refusal - a clunk, not a beep."""
    d = 0.22
    body = tone(98, d, 'saw') * env(d, attack=0.004, curve=13)
    body += tone(101, d, 'saw') * env(d, attack=0.004, curve=13) * 0.6
    body = lowpass(body, 900)
    thud = bandpass(noise(0.07), 120, 900) * env(0.07, curve=20)
    return soft_clip(body * 0.9 + pad(thud, d) * 0.5, 1.4)


def cue_unlock():
    """Four-note chime with a bit of room on it."""
    d = 1.0
    out = np.zeros(n_samples(d))
    for i, f in enumerate((523, 659, 784, 1046)):
        bell = metal([f, f * 2.0, f * 3.01, f * 4.2], 0.8,
                     decays=[2.4, 3.4, 5.0, 7.0], amps=[1.0, 0.5, 0.25, 0.12])
        out = at(out, bell * (0.8 - 0.1 * i), 0.09 * i)
    return soft_clip(room(out, 0.4, size=0.08), 1.05)


def cue_nuclear():
    """Reactor spin-up into a very large impact."""
    d = 2.0
    out = np.zeros(n_samples(d))
    rumble = lowpass(noise(1.1), 120) * env(1.1, attack=0.3, curve=1.2)
    out = at(out, rumble * 1.0, 0.0)
    out = at(out, sweep(38, 62, 1.1) * env(1.1, attack=0.25, curve=1.0) * 0.8, 0.0)
    riser = sweep(200, 2400, 0.95, 'saw') * env(0.95, attack=0.5, curve=0.6)
    out = at(out, lowpass(riser, 3500) * 0.28, 0.1)
    boom = sweep(150, 34, 0.9) * env(0.9, attack=0.002, curve=4.5)
    out = at(out, boom * 1.2, 1.0)
    crack = bandpass(noise(0.35), 600, 9000) * env(0.35, attack=0.001, curve=12)
    out = at(out, crack * 0.6, 1.0)
    tail = lowpass(noise(0.8), 300) * env(0.8, attack=0.02, curve=3)
    out = at(out, tail * 0.35, 1.05)
    return soft_clip(room(out, 0.3, size=0.09), 1.1)


def cue_crash():
    """Bike meets floor: one impact and a lot of metal finding its own level."""
    d = 1.1
    out = np.zeros(n_samples(d))
    hit = sweep(190, 60, 0.3) * env(0.3, attack=0.001, curve=9)
    out = at(out, hit * 1.0, 0.0)
    out = at(out, bandpass(noise(0.25), 500, 9000) * env(0.25, attack=0.001, curve=13) * 0.8, 0.0)
    for start, f in ((0.08, 2100), (0.16, 1600), (0.27, 2800), (0.41, 1300), (0.58, 2400), (0.76, 1750)):
        clank = metal([f, f * 1.51, f * 2.3], 0.3, decays=[12, 16, 22], amps=[0.5, 0.3, 0.16])
        out = at(out, clank * (0.55 - 0.05 * start * 10), start)
    roll = bandpass(noise(0.6), 1200, 5000) * env(0.6, attack=0.1, curve=3)
    out = at(out, roll * 0.15, 0.3)
    return soft_clip(room(out, 0.25), 1.15)


def cue_nitro():
    """Pressure release plus a rising whistle."""
    d = 0.55
    hiss = bandpass(noise(d), 2500, 11000) * env(d, attack=0.01, curve=4)
    whistle = sweep(700, 2600, 0.42) * env(0.42, attack=0.06, curve=3)
    out = hiss * 0.5 + pad(whistle, d) * 0.4
    out += pad(sweep(120, 260, 0.3) * env(0.3, attack=0.01, curve=6), d) * 0.3
    return soft_clip(room(out, 0.15), 1.15)


def cue_coin():
    """Two bright partials with a fast upward flick."""
    d = 0.35
    a = tone(988, 0.08, 'square', detune=0.06) * env(0.08, attack=0.001, curve=18)
    b = tone(1319, d, 'square') * env(d, attack=0.001, curve=9)
    out = pad(a, d) * 0.5 + b * 0.45
    out += metal([2637, 3951], d, decays=[10, 14], amps=[0.2, 0.1])
    return soft_clip(lowpass(out, 8000) * 1.1, 1.1)


def cue_tick():
    d = 0.035
    return soft_clip(bandpass(noise(d), 3000, 9000) * env(d, attack=0.0003, curve=70) * 0.8, 1.2)


def cue_golden():
    """Something valuable just appeared on screen."""
    d = 1.2
    out = np.zeros(n_samples(d))
    for i, f in enumerate((1046, 1568, 2093)):
        bell = metal([f, f * 2.0, f * 3.0, f * 4.1], 0.9,
                     decays=[2.0, 3.0, 4.5, 6.5], amps=[1.0, 0.5, 0.28, 0.14])
        out = at(out, bell * (0.8 - 0.15 * i), 0.07 * i)
    shimmer = bandpass(noise(0.9), 4000, 13000) * env(0.9, attack=0.2, curve=2.6)
    out += pad(shimmer, d) * 0.16
    out += pad(sweep(400, 1600, 0.5) * env(0.5, attack=0.2, curve=3), d) * 0.12
    return soft_clip(room(out, 0.45, size=0.085), 1.05)


def cue_buff():
    """Power-up swell for collecting the spanner."""
    d = 0.9
    out = np.zeros(n_samples(d))
    swell = sweep(220, 880, 0.5, 'saw') * env(0.5, attack=0.15, curve=2)
    out = at(out, lowpass(swell, 4000) * 0.4, 0.0)
    for i, f in enumerate((523, 784, 1046, 1568)):
        out = at(out, metal([f, f * 2], 0.5, decays=[3.5, 5], amps=[0.7, 0.3]) * 0.55, 0.04 * i)
    out = at(out, bandpass(noise(0.4), 3000, 10000) * env(0.4, attack=0.1, curve=4) * 0.12, 0.1)
    return soft_clip(room(out, 0.35), 1.1)


def cue_achieve():
    """Short fanfare: three notes, a bit of brass, no ceremony."""
    d = 1.0
    out = np.zeros(n_samples(d))
    for i, f in enumerate((523, 659, 880)):
        stack = (tone(f, 0.45, 'saw') * 0.5 + tone(f * 1.005, 0.45, 'saw') * 0.4
                 + tone(f * 2, 0.45) * 0.25)
        out = at(out, lowpass(stack, 5200) * env(0.45, attack=0.01, curve=4) * 0.45, 0.085 * i)
    out = at(out, metal([1046, 1568, 2093], 0.6, decays=[3, 4, 6], amps=[0.6, 0.35, 0.2]) * 0.5, 0.17)
    return soft_clip(room(out, 0.35), 1.1)


CUES = {
    'click': cue_click,
    'clickBig': cue_click_big,
    'buy': cue_buy,
    'sell': cue_sell,
    'crate': cue_crate,
    'drop': cue_drop,
    'rare': cue_rare,
    'craft': cue_craft,
    'error': cue_error,
    'unlock': cue_unlock,
    'nuclear': cue_nuclear,
    'crash': cue_crash,
    'nitro': cue_nitro,
    'coin': cue_coin,
    'tickUp': cue_tick,
    'golden': cue_golden,
    'buff': cue_buff,
    'achieve': cue_achieve,
}


# Short percussive cues stay as small WAVs: mp3 decoders insert a few
# milliseconds of encoder padding, which is inaudible on a fanfare and very
# audible on a click that is supposed to land under your finger.
KEEP_WAV = {'click', 'tickUp', 'drop', 'coin', 'buy', 'error'}


def compress():
    """Shrink the raw output with ffmpeg, if it is on PATH (1.0MB -> ~200KB)."""
    import shutil
    import subprocess
    if not shutil.which('ffmpeg'):
        print('ffmpeg not found - leaving full-rate wavs in place')
        return
    for name in CUES:
        src = os.path.normpath(os.path.join(OUT, name + '.wav'))
        if not os.path.exists(src):
            continue
        if name in KEEP_WAV:
            tmp = os.path.normpath(os.path.join(OUT, '_' + name + '.wav'))
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
                            '-ar', '22050', '-ac', '1', '-sample_fmt', 's16', tmp], check=True)
            os.replace(tmp, src)
        else:
            dst = os.path.normpath(os.path.join(OUT, name + '.mp3'))
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', src,
                            '-codec:a', 'libmp3lame', '-q:a', '5', '-ac', '1', dst], check=True)
            os.remove(src)


if __name__ == '__main__':
    os.makedirs(os.path.normpath(OUT), exist_ok=True)
    for name, fn in CUES.items():
        write(name, fn())
    compress()
    total = sum(os.path.getsize(os.path.join(os.path.normpath(OUT), f))
                for f in os.listdir(os.path.normpath(OUT)))
    print('%d cues, %.1f KB on disk' % (len(CUES), total / 1024))
