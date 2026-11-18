"""生成配乐谱（65 秒，70 BPM，C-G-Am-F 循环）。"""
import json
import math

BPM = 70
BEAT = 60.0 / BPM
BAR = BEAT * 4
TOTAL = 65.0

# (根音 MIDI, 和弦音)
CHORDS = [
    (48, [60, 64, 67]),  # C
    (43, [59, 62, 67]),  # G
    (45, [57, 60, 64]),  # Am
    (41, [57, 60, 65]),  # F
]

piano, pad, bass, bell = [], [], [], []

bar = 0
t = 0.0
while t < TOTAL - 0.2:
    root, notes = CHORDS[bar % len(CHORDS)]
    # 钢琴：每半拍一个分解音，后两小节加密
    density = 2 if bar < 4 else 1
    for i in range(8 // density):
        tt = t + i * (BAR / (8 // density))
        if tt >= TOTAL:
            break
        note = notes[i % len(notes)] + (12 if bar % 2 == 1 else 0)
        piano.append([round(tt, 3), 1.6, note, 52 + (8 if i % 2 == 0 else 0)])
    # 弦乐长音
    pad.append([round(t, 3), round(BAR * 0.96, 3), [notes[0] - 12 + 12, notes[1], notes[2]], 40])
    # 低音
    bass.append([round(t, 3), round(BAR * 0.9, 3), root - 12, 58])
    # 后半段加一点铃
    if bar >= 8:
        bell.append([round(t + BAR / 2, 3), 1.2, notes[2] + 12, 30])
    bar += 1
    t = bar * BAR

score = {
    "title": "鱼友局 · 推广配乐",
    "tracks": [
        {"name": "钢琴", "instrument": "piano", "gainDb": -3, "pan": -0.1, "reverb": 0.35, "notes": piano},
        {"name": "弦乐", "instrument": "strings", "gainDb": -9, "pan": 0.1, "reverb": 0.5, "notes": pad},
        {"name": "低音", "instrument": "bass", "gainDb": -6, "pan": 0, "reverb": 0.1, "notes": bass},
        {"name": "铃", "instrument": "celesta", "gainDb": -14, "pan": 0.3, "reverb": 0.6, "notes": bell},
    ],
    "automation": [],
}

with open('dsh-fish-friends/video/score.json', 'w', encoding='utf-8') as f:
    json.dump(score, f, ensure_ascii=False, indent=1)

print('notes:', len(piano), len(pad), len(bass), len(bell), 'bars:', bar)
