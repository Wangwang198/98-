#!/usr/bin/env python3
# 用 minimaxi music-2.6 生成游戏BGM（三国打斗纯音乐）
import json, os, sys, time, base64, urllib.request

API = "https://api.minimaxi.com/v1/music_generation"
KEY = "sk-cp-g2B6sEzavQ5nKqPszn6aqBE9ictkmXkWGYvYU6DjWYL9CxGzwkNSy3hwqrgjBlM54TL5nMPB13-W88kEb76-IavaQHysXVtNN-zogFFcANoiew-aXMYkl9Y"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "music")
os.makedirs(OUT, exist_ok=True)

TRACKS = {
  "bgm_battle": "Epic Chinese Three Kingdoms battle theme, instrumental only: thundering taiko war drums, intense erhu and guzheng melodies, heroic brass, fast driving rhythm 140bpm, cinematic war epic, adrenaline fighting game music, no vocals",
  "bgm_menu": "Majestic ancient China ambient theme, instrumental: gentle guzheng and dizi flute, distant war drums, heroic and mysterious atmosphere, Three Kingdoms menu music, calm but epic, no vocals",
}

def decode_audio(d):
    """兼容 hex / base64 / url 三种返回"""
    data = d.get("data") or {}
    au = data.get("audio") or d.get("audio")
    if not au and data.get("url"):
        with urllib.request.urlopen(data["url"], timeout=180) as r:
            return r.read()
    if not au:
        raise RuntimeError("no audio field: " + json.dumps(d)[:300])
    if isinstance(au, str):
        try:
            return bytes.fromhex(au)          # minimax 常见 hex
        except ValueError:
            return base64.b64decode(au)
    raise RuntimeError("unknown audio type")

def gen(name, prompt, tries=3):
    path = os.path.join(OUT, name + ".mp3")
    if os.path.exists(path) and os.path.getsize(path) > 100000:
        print(f"[skip] {name}"); return True
    body = json.dumps({
        "model": "music-2.6",
        "prompt": prompt,
        "lyrics": "[Intro]\n(Instrumental)\n[Verse]\n(Instrumental)\n[Chorus]\n(Instrumental)\n[Bridge]\n(Instrumental)\n[Outro]\n(Instrumental)",
        "audio_setting": {"sample_rate": 44100, "bitrate": 256000, "format": "mp3"},
    }).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(API, data=body, headers={
                "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=600) as r:
                raw_text = r.read().decode()
            d = json.loads(raw_text)
            if d.get("base_resp", {}).get("status_code", 0) not in (0,):
                raise RuntimeError(raw_text[:300])
            raw = decode_audio(d)
            with open(path, "wb") as f:
                f.write(raw)
            print(f"[ok] {name} {len(raw)//1024}KB"); return True
        except Exception as e:
            print(f"[retry {i+1}] {name}: {e}"); time.sleep(5)
    return False

if __name__ == "__main__":
    only = sys.argv[1] if len(sys.argv) > 1 else None
    for name, p in TRACKS.items():
        if only and name != only: continue
        gen(name, p)
    print("MUSIC DONE")
