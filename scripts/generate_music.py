#!/usr/bin/env python3
"""Render 花影入梦, a deterministic original 32-bar pentatonic game loop.
Requires Python, NumPy, SciPy and ffmpeg. No samples, network, or music API.
"""
from pathlib import Path
import argparse, json, subprocess, tempfile, wave
import numpy as np
from scipy.signal import butter, sosfilt
SR = 44100
BPM = 72
BEAT = 60 / BPM
BARS = 32
DURATION = BARS * 4 * BEAT
RNG = np.random.default_rng(20261110)
N = round(DURATION * SR)
# Extra tail wraps into the opening, so the exported loop has a continuous room decay.
mix = np.zeros((N + SR * 5, 2), dtype=np.float64)
PITCH = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]
def hz(m): return 440 * 2 ** ((m - 69) / 12)
def add(signal, onset, gain, pan=0):
    start = round(onset * SR)
    end = min(len(mix), start + len(signal))
    signal = signal[:end-start] * gain
    theta = (pan + 1) * np.pi / 4
    mix[start:end, 0] += signal * np.cos(theta)
    mix[start:end, 1] += signal * np.sin(theta)
def pluck(m, length=2.7, soft=False):
    t = np.arange(round(length * SR)) / SR
    f = hz(m)
    out = np.zeros_like(t)
    for harmonic in range(1, 8):
        phase = .22 * harmonic
        decay = (2.8 if soft else 1.7) / (1 + harmonic * .27)
        out += (1 / harmonic ** 1.65) * np.sin(2*np.pi*f*harmonic*(1 + .00012*harmonic**2)*t + phase) * np.exp(-t/decay)
    attack = 1 - np.exp(-t / (.014 if soft else .0035))
    return np.tanh(out * .75) * attack * np.minimum(1, (length-t)/.12)
def flute(m, beats):
    dur = beats * BEAT
    t = np.arange(round(dur * SR)) / SR
    bend = .0015 * np.sin(2*np.pi*4.7*t) * np.minimum(t/.45, 1)
    phase = np.cumsum(2*np.pi*hz(m)*(1+bend)) / SR
    tone = np.sin(phase) + .12*np.sin(2*phase+.2) + .035*np.sin(3*phase)
    air = sosfilt(butter(2, [700, 2300], btype='bandpass', fs=SR, output='sos'), RNG.standard_normal(len(t)))
    env = np.sin(np.pi*np.minimum(t/.18, 1)/2) * np.sin(np.pi*np.minimum((dur-t)/.28, 1)/2)
    return (tone*.72 + air*.045) * env * (.93 + .04*np.sin(t*8))
def bell(m):
    t=np.arange(round(3.4*SR))/SR
    return (np.sin(2*np.pi*hz(m)*t)*np.exp(-t/1.3) + .25*np.sin(2*np.pi*hz(m)*2.71*t)*np.exp(-t/.8)) * (1-np.exp(-t/.004))
# Four related eight-bar phrases; pauses keep the garden audible and the puzzles readable.
phrases = [
    [[(0,0,1.4),(2,2,1.3)],[(1,4,1.1),(2.5,2,1)],[(0,1,1.3),(2,0,1.8)],[(0,2,2.8)],[(0,4,1.5),(2,5,1.4)],[(0,4,1.1),(1.5,2,1.6)],[(0,1,1),(1.5,2,1),(3,1,.7)],[(0,0,2.8)]],
    [[(0,2,1.4),(2,4,1.5)],[(0,5,2.4)],[(0,6,1.1),(1.5,5,1.2),(3,4,.7)],[(0,2,2.8)],[(0,1,1.5),(2,2,1.4)],[(0,4,1),(1.5,2,1),(3,0,.7)],[(0,1,2.3)],[(0,0,2.8)]],
]
chord_roots=[50,47,43,45,50,54,47,45]
for bar in range(BARS):
    onset=bar*4*BEAT
    root=chord_roots[bar%8]
    section=bar//8
    # Long low silk-string resonance and spare arpeggios.
    add(pluck(root, 4.2, True), onset, .17, -.22)
    third = 15 if root % 12 in (11, 6) else 14 if root % 12 == 9 else 16
    arp=[root+12,root+19,root+24,root+third]
    for j,beat in enumerate([0,.75,1.5,2.5,3.25]):
        add(pluck(arp[j%4],2.8,True),onset+beat*BEAT,.058 if section==0 else .075,(-.48,.38,-.30,.45)[j%4])
    phrase=phrases[section%2][bar%8]
    for beat,index,length in phrase:
        midi=PITCH[index]
        # Flute enters and leaves across the form; plucked lead carries the opening.
        if section in (1,2):
            add(flute(midi,length),onset+beat*BEAT+.035,.12 if section==1 else .105,.20)
            add(pluck(midi,2.1),onset+beat*BEAT,.055,-.18)
        else:
            add(pluck(midi,3.1),onset+beat*BEAT,.16 if section==0 else .13,-.15)
            if length>1.7 and bar%2==0:add(flute(midi-12,length),onset+(beat+.12)*BEAT,.075,.27)
    if bar%8 in (0,4):add(bell(86 if bar%8==0 else 81),onset,.025,.55)
# Small, deterministic stereo room; no external impulse responses.
room=mix.copy()
for delay,gain in [(.113,.13),(.227,.10),(.389,.075),(.631,.045),(.907,.025)]:
    shift=round(delay*SR)
    room[shift:]+=mix[:-shift,::-1]*gain
loop=room[:N].copy()
loop[:len(room)-N]+=room[N:]
loop=np.tanh(loop*1.18)
loop *= .79 / max(np.max(np.abs(loop)),1e-9)
parser=argparse.ArgumentParser();parser.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'dist/assets');args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
with tempfile.TemporaryDirectory() as tmp:
    wav=Path(tmp)/'garden-master.wav'
    with wave.open(str(wav),'wb') as out:
        out.setnchannels(2);out.setsampwidth(2);out.setframerate(SR);out.writeframes((loop*32767).astype('<i2').tobytes())
    for extension,codec in [('ogg',['-c:a','libvorbis','-q:a','5']),('mp3',['-c:a','libmp3lame','-b:a','160k'])]:
        target=args.output/f'flower-dream.{extension}'
        subprocess.run(['ffmpeg','-v','error','-y','-i',str(wav),*codec,'-metadata','title=花影入梦','-metadata','artist=簪花游园','-metadata','comment=Original procedural score; no external audio samples',str(target)],check=True)
meta={'title':'花影入梦','bpm':BPM,'bars':BARS,'duration_seconds':DURATION,'scale':'D major pentatonic','instruments':['synthesized silk-string plucks','breathy bamboo-flute voice','sparse bell overtones'],'seed':20261110,'source':'scripts/generate_music.py','external_samples':False,'sample_rate':SR,'peak':float(np.max(np.abs(loop))),'rms':float(np.sqrt(np.mean(loop**2)))}
(args.output/'music-score.json').write_text(json.dumps(meta,ensure_ascii=False,indent=2)+'\n')
print(json.dumps(meta,ensure_ascii=False))
