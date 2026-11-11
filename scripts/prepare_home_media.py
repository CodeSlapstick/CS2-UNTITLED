import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, PngImagePlugin
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "upload": "upload.gif",
    "replay": "2d demo reviewer.gif",
    "heatmap": "heatmap.gif",
    "economy": "economy.gif",
    "analysis": "analysis page .gif",
    "opening": "open route.gif",
    "report": "coach export .gif",
}
DEST = ROOT / "frontend/public/media/home"


def ffmpeg_path():
    found = shutil.which("ffmpeg")
    if found:
        return found
    sys.path.insert(0, str(ROOT / "output/tools/video-codecs"))
    import imageio_ffmpeg
    return imageio_ffmpeg.get_ffmpeg_exe()


def poster(image, destination, origin):
    image = image.convert("RGB")
    image.thumbnail((960, 600))
    metadata = PngImagePlugin.PngInfo()
    metadata.add_text("Source", origin)
    metadata.add_text("Description", "Frame from a user-provided CS2 UNTITLED screen recording; no generated content.")
    image.save(destination, pnginfo=metadata, optimize=True)


def run(ffmpeg, *args):
    subprocess.run([ffmpeg, "-hide_banner", "-loglevel", "error", "-y", *map(str, args)], check=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--inspect", action="store_true")
    args = parser.parse_args()
    ffmpeg = ffmpeg_path()
    DEST.mkdir(parents=True, exist_ok=True)
    review = ROOT / "output/ui-review/home-brand"
    review.mkdir(parents=True, exist_ok=True)
    contact = Image.new("RGB", (960, 540), "#151a23")
    draw = ImageDraw.Draw(contact)
    manifest = {}
    for i, (key, filename) in enumerate(SOURCES.items()):
        source = ROOT / "Media" / filename
        with Image.open(source) as image:
            frame = image.n_frames // 3
            print(filename, image.size, image.n_frames, flush=True)
            image.seek(frame)
            sample = image.convert("RGB")
            pixels = np.asarray(sample)
            green = (pixels[:, :, 1] > 200) & (pixels[:, :, 0] < 60) & (pixels[:, :, 2] < 80)
            columns = np.flatnonzero(green.mean(axis=0) < 0.85)
            rows = np.flatnonzero(green.mean(axis=1) < 0.85)
            crop = (int(columns[0]), int(rows[0]), int(columns[-1]) + 1, int(rows[-1]) + 1)
            sample = sample.crop(crop)
            print("crop", crop, flush=True)
            thumb = sample.copy()
            thumb.thumbnail((310, 150))
            x, y = i % 3 * 320, i // 3 * 180
            contact.paste(thumb, (x, y + 22))
            draw.text((x + 4, y + 4), filename, fill="white")
            if not args.inspect:
                poster(sample, DEST / f"{key}.png", f"Media/{filename}, frame {frame}")
        if not args.inspect:
            x, y, right, bottom = crop
            filters = f"crop={right-x}:{bottom-y}:{x}:{y},fps=12,scale='min(960,iw)':-2"
            run(ffmpeg, "-i", source, "-t", "12", "-vf", filters, "-an",
                "-c:v", "libvpx-vp9", "-crf", "38", "-b:v", "0", "-cpu-used", "5",
                "-metadata", f"comment=Source: Media/{filename}", DEST / f"{key}.webm")
            manifest[key] = {"source": f"Media/{filename}", "poster_frame": frame, "crop": crop, "preview": f"{key}.webm"}
    contact.save(review / "media-contact.png")
    source = ROOT / "Media/demoweb1.mp4"
    if args.inspect:
        sheet = Image.new("RGB", (960, 400), "#151a23")
        for i, second in enumerate([40, 45, 50, 55, 65, 155]):
            capture = review / f"demo-{second}.png"
            run(ffmpeg, "-ss", second, "-i", source, "-frames:v", "1", capture)
            with Image.open(capture) as image:
                image.thumbnail((310, 175))
                sheet.paste(image, (i % 3 * 320, i // 3 * 200 + 20))
            ImageDraw.Draw(sheet).text((i % 3 * 320 + 5, i // 3 * 200 + 3), f"{second} seconds", fill="white")
        sheet.save(review / "video-contact.png")
    if not args.inspect:
        run(ffmpeg, "-i", source, "-vf", "scale=1280:-2", "-r", "24", "-c:v", "libx264",
            "-preset", "fast", "-crf", "24", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
            "-metadata", "comment=Source: Media/demoweb1.mp4", DEST / "demoweb1.mp4")
        run(ffmpeg, "-ss", "65", "-i", source, "-frames:v", "1", review / "demo-frame.png")
        with Image.open(review / "demo-frame.png") as image:
            poster(image, DEST / "demo-poster.png", "Media/demoweb1.mp4 at 65 seconds")
        manifest["demo"] = {"source": "Media/demoweb1.mp4", "output": "demoweb1.mp4"}
        (DEST / "sources.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")


if __name__ == "__main__":
    main()
