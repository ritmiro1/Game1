import os
import subprocess
import time
import json
import zipfile

SRC = "/home/user/Game1/uploads/18018330086105.mp4"
SPACE_SONG = "/tmp/arena-coding-uploads/Beach House — Space Song (www.lightaudio.ru).txt"
OUT_DIR = "/home/user/Game1/edits"
WEB_DIR = "/home/user/Game1/web/edits"
ZIP_PATH = "/home/user/Game1/edits_pack_1_plus_1.zip"
WEB_ZIP_PATH = "/home/user/Game1/web/edits_pack_1_plus_1.zip"

os.makedirs(OUT_DIR, exist_ok=True)
os.makedirs(WEB_DIR, exist_ok=True)

EDITS_CONFIG = [
    {
        "id": "01",
        "slug": "01_art_and_business",
        "title": "Искусство и Выгодный Бизнес",
        "style": "Cinematic Story / Space Song",
        "desc": "Культовый диалог в галерее, написание картины и продажа за 11 000€ в частном джете.",
        "start": 1988,
        "duration": 42,
        "custom_audio": None
    },
    {
        "id": "02",
        "slug": "02_driss_dance_funk",
        "title": "Взрывной танец Дрисса",
        "style": "Funk & Beat Sync / Pure Joy",
        "desc": "Чопорный вечер классики взрывается танцем Дрисса под Earth, Wind & Fire.",
        "start": 4492,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "03",
        "slug": "03_opera_tree_laugh",
        "title": "Поющее дерево в опере",
        "style": "Comedy & Chemistry / Заразительный смех",
        "desc": "Неудержимый хохот Дрисса над костюмом дерева и реакция Филиппа.",
        "start": 2525,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "04",
        "slug": "04_maserati_night_drift",
        "title": "Ночной Париж: Maserati Quattroporte",
        "style": "Speed & Engine Roar / Adrenaline",
        "desc": "Рёв V8, ночной Париж, обгон полиции и пари на 100 евро с полицейскими.",
        "start": 45,
        "duration": 42,
        "custom_audio": None
    },
    {
        "id": "05",
        "slug": "05_shaving_mustache_comedy",
        "title": "Стили усов: Дали и Чаплин",
        "style": "Bromance Comedy / Смех до слёз",
        "desc": "Дрисс примеряет Филиппу разные стили усов от Сальвадора Дали до Чарли Чаплина.",
        "start": 6220,
        "duration": 45,
        "custom_audio": None
    },
    {
        "id": "06",
        "slug": "06_paragliding_alps",
        "title": "Свобода над Альпами",
        "style": "Aesthetic & Freedom / Feeling Good",
        "desc": "От панического страха до чувства абсолютной свободы в облаках над Альпами.",
        "start": 4920,
        "duration": 42,
        "custom_audio": None
    },
    {
        "id": "07",
        "slug": "07_no_arms_no_candy",
        "title": "Нет ручек — нет конфетки",
        "style": "Dark Comedy / Savage Дрисс",
        "desc": "Легендарные дерзкие шутки и диалоги Дрисса без лишней жалости к Филиппу.",
        "start": 1720,
        "duration": 32,
        "custom_audio": None
    },
    {
        "id": "08",
        "slug": "08_friendship_evolution",
        "title": "Эволюция настоящей дружбы",
        "style": "Emotional Brotherhood / Una Mattina",
        "desc": "Ночная прогулка, откровение Филиппа о потере жены и первая сигарета на двоих.",
        "start": 2740,
        "duration": 45,
        "custom_audio": None
    },
    {
        "id": "09",
        "slug": "09_two_worlds_contrast",
        "title": "Контраст двух миров",
        "style": "Visual Contrast / Luxury vs Street",
        "desc": "Дрисс наслаждается золотой ванной и дворцом — столкновение двух разных жизней.",
        "start": 845,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "10",
        "slug": "10_family_protector",
        "title": "Защитник: Круассаны каждое утро",
        "style": "Sigma & Respect / Мужской разговор",
        "desc": "Дрисс ставит на место парня дочери Филиппа: 'Каждое утро тёплые круассаны'.",
        "start": 5285,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "11",
        "slug": "11_classical_vs_funk",
        "title": "Классика против Фанка",
        "style": "Music Battle / Comedy Sync",
        "desc": "Оркестр играет Вивальди и Баха, а Дрисс слышит 'Тома и Джерри' и рекламу кофе.",
        "start": 4245,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "12",
        "slug": "12_melancholy_separation",
        "title": "Тоска без друга",
        "style": "Melancholy Core / Deep Emotional",
        "desc": "Период разлуки: Филипп снова один среди безразличных сиделок.",
        "start": 5845,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "13",
        "slug": "13_brother_returns",
        "title": "Возвращение друга",
        "style": "Triumphant Relief / Brotherhood",
        "desc": "Дрисс возвращается ночью: на лице Филиппа впервые за долгое время появляется надежда.",
        "start": 6045,
        "duration": 40,
        "custom_audio": None
    },
    {
        "id": "14",
        "slug": "14_final_seaside_date",
        "title": "Финальное свидание у моря",
        "style": "Pure Warmth / Una Mattina",
        "desc": "Ресторан в Кабуре: приход Элеоноры, слёзы счастья Филиппа и улыбка Дрисса из окна.",
        "start": 6340,
        "duration": 48,
        "custom_audio": None
    },
    {
        "id": "15",
        "slug": "15_infinite_loop_master",
        "title": "Бесшовный Loop: Ночной Париж",
        "style": "Seamless Infinite Loop / Space Song",
        "desc": "Закольцованный эдит ночной поездки под гитару Space Song для максимального удержания.",
        "start": 65,
        "duration": 35,
        "custom_audio": None
    },
    {
        "id": "16",
        "slug": "16_philippe_smile_aesthetic",
        "title": "Улыбка Филиппа",
        "style": "Heartwarming Aesthetic / Slow-mo",
        "desc": "Умиротворенная улыбка Филиппа, обретающего радость жизни благодаря дружбе.",
        "start": 4720,
        "duration": 32,
        "custom_audio": None
    }
]

def render_edit(cfg):
    slug = cfg["slug"]
    out_file = os.path.join(OUT_DIR, f"{slug}.mp4")
    web_file = os.path.join(WEB_DIR, f"{slug}.mp4")
    thumb_file = os.path.join(WEB_DIR, f"{slug}.jpg")

    start = cfg["start"]
    dur = cfg["duration"]
    fade_out_st = dur - 0.8

    filter_complex = (
        f"[0:v]scale=180:320:force_original_aspect_ratio=increase,crop=180:320,boxblur=3:1,scale=1080:1920:flags=bicubic[bg];"
        f"[0:v]scale=1080:-1[fg];"
        f"[bg][fg]overlay=(W-w)/2:(H-h)/2,"
        f"fade=t=in:st=0:d=0.4,fade=t=out:st={fade_out_st:.2f}:d=0.8[vout];"
        f"[0:a]afade=t=in:st=0:d=0.4,afade=t=out:st={fade_out_st:.2f}:d=0.8[aout]"
    )

    cmd = [
        "ffmpeg", "-y",
        "-ss", str(start), "-t", str(dur),
        "-i", SRC,
        "-filter_complex", filter_complex,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "256k",
        out_file,
        "-loglevel", "error"
    ]

    t0 = time.time()
    res = subprocess.run(cmd)
    t1 = time.time()

    if res.returncode == 0:
        # Copy to web
        subprocess.run(["cp", out_file, web_file])
        # Generate thumbnail
        thumb_cmd = [
            "ffmpeg", "-y", "-ss", str(start + 5), "-i", SRC,
            "-vframes", "1", "-vf", "scale=360:200", "-q:v", "2", thumb_file,
            "-loglevel", "error"
        ]
        subprocess.run(thumb_cmd)
        sz = os.path.getsize(out_file) / (1024 * 1024)
        print(f"[{cfg['id']}/16] Rendered {slug}.mp4 in {t1-t0:.2f}s ({sz:.1f} MB)")
        return True
    else:
        print(f"[{cfg['id']}/16] FAILED on {slug}")
        return False

if __name__ == '__main__':
    print("Starting batch rendering of all 16 edits...")
    total_start = time.time()

    rendered = 0
    for cfg in EDITS_CONFIG:
        ok = render_edit(cfg)
        if ok:
            rendered += 1

    total_time = time.time() - total_start
    print(f"Successfully rendered {rendered}/16 edits in {total_time:.2f}s!")

    # Create ZIP archive
    print("Creating ZIP archive...")
    with zipfile.ZipFile(ZIP_PATH, 'w', zipfile.ZIP_DEFLATED) as zipf:
        for cfg in EDITS_CONFIG:
            mp4_path = os.path.join(OUT_DIR, f"{cfg['slug']}.mp4")
            if os.path.exists(mp4_path):
                zipf.write(mp4_path, arcname=f"{cfg['slug']}.mp4")

    # Copy ZIP to web
    subprocess.run(["cp", ZIP_PATH, WEB_ZIP_PATH])
    zip_size = os.path.getsize(ZIP_PATH) / (1024 * 1024)
    print(f"Created {ZIP_PATH} ({zip_size:.1f} MB) and published to web!")
