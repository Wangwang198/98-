#!/usr/bin/env python3
# 生成8个关卡的背景图（gpt-image-2），失败自动重试，保存到 assets/bg/
import json, os, sys, time, base64, urllib.request

API = "http://cf.douzimi.com:58728/v1/images/generations"
KEY = "sk-LevqgoSsx0T8uoARC17zTQjvkfJO9MFfv8X4Kk5R7Sd9RKxe"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets", "bg")
os.makedirs(OUT, exist_ok=True)

COMMON = ", 2D game background art, wide landscape composition, the bottom 25% is a flat empty ground platform for a fighting game stage, no characters, no people, no text, no watermark, high quality, vibrant"

SCENES = {
  "changban": "Beautiful ancient Chinese countryside battlefield at dusk: golden sunset sky, waving red war banners on poles, distant army tents and mountain silhouettes, drifting clouds, warm orange and purple tones, flat stylized game art" + COMMON,
  "chibi": "Night naval battle of Red Cliffs (Chibi), Three Kingdoms: chained warships burning on the river, huge orange fire glow against deep blue night, embers flying, full moon, dramatic silhouette style" + COMMON,
  "hulao": "Majestic Hulao Pass fortress of ancient China: massive stone city walls and gate tower, war clouds, red flags on ramparts, morning light rays, epic scale" + COMMON,
  "wuzhang": "Autumn night at Wuzhangyuan plains: falling stars and milky way, lonely war camp with small bonfires, golden grassland, shooting star trails, melancholic beautiful night sky" + COMMON,
  "pixel": "Retro pixel art game world: 16-bit pixelated fantasy landscape, blocky green hills, pixel clouds, giant pixel castle in distance, bright cheerful colors, crisp pixel style, video game stage" + COMMON + ", pixel art, 16-bit",
  "neon": "Futuristic alien planet sci-fi landscape: neon purple and cyan glowing terrain, two moons in starry sky, floating rocks, distant cyber city lights, holographic aurora, synthwave colors" + COMMON,
  "volcano": "Volcanic hell landscape: rivers of glowing lava, erupting volcano in background, obsidian black rocks, sparks and embers in dark red sky, dramatic fire glow" + COMMON,
  "sakura": "Japanese sakura dojo courtyard at sunset: cherry blossom trees with falling pink petals, wooden torii gate, traditional temple silhouette, mount Fuji in distance, soft pink and gold light" + COMMON,
}

def gen(name, prompt, tries=3):
    path = os.path.join(OUT, f"bg_{name}.jpg")
    if os.path.exists(path) and os.path.getsize(path) > 30000:
        print(f"[skip] {name} exists"); return True
    body = json.dumps({"model": "gpt-image-2", "prompt": prompt, "size": "1536x1024", "n": 1}).encode()
    for i in range(tries):
        try:
            req = urllib.request.Request(API, data=body, headers={
                "Authorization": "Bearer " + KEY, "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=300) as r:
                d = json.loads(r.read().decode())
            item = d["data"][0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"])
            elif item.get("url"):
                with urllib.request.urlopen(item["url"], timeout=120) as r:
                    raw = r.read()
            else:
                raise RuntimeError("no image field: " + str(item.keys()))
            with open(path, "wb") as f:
                f.write(raw)
            print(f"[ok] {name} {len(raw)//1024}KB"); return True
        except Exception as e:
            print(f"[retry {i+1}] {name}: {e}"); time.sleep(4)
    return False

ok = 0
for name, p in SCENES.items():
    if gen(name, p): ok += 1
print(f"DONE {ok}/{len(SCENES)}")
