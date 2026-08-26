"""glitch video-mode backend — transcodes uploads to a moshable AVI and
renders edited (byte-corrupted) AVIs back to playable MP4. All actual
frame manipulation happens client-side in the browser; this service only
wraps ffmpeg for the two steps that need a real codec."""

import os
import subprocess
import tempfile
import uuid

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 400 * 1024 * 1024  # 400MB upload cap (high-res re-prepare for export)

MAX_DURATION = 20      # seconds taken from the source clip
DEFAULT_WIDTH = 480    # moshable proxy resolution while editing (fast + small payloads)
MAX_WIDTH = 1920       # cap for high-quality export re-prepare
PREPARE_FPS = 15
GOP = 15                # keyframe every ~1s -> several I-frames to mosh with
FFMPEG_TIMEOUT = 120

ALLOWED_EXT = {'.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.gif'}


def run_ffmpeg(args):
    proc = subprocess.run(
        ['ffmpeg', '-y', '-hide_banner', *args],
        capture_output=True, timeout=FFMPEG_TIMEOUT,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode('utf-8', errors='replace')[-1500:])


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


@app.route('/api/glitch/prepare', methods=['POST'])
def prepare():
    if 'video' not in request.files:
        return jsonify(error='Keine Datei erhalten.'), 400
    f = request.files['video']
    ext = os.path.splitext(f.filename or '')[1].lower()
    if ext not in ALLOWED_EXT:
        return jsonify(error='Nicht unterstütztes Format.'), 400

    try:
        width = clamp(int(request.form.get('width', DEFAULT_WIDTH)), 240, MAX_WIDTH)
    except ValueError:
        width = DEFAULT_WIDTH

    with tempfile.TemporaryDirectory(prefix='glitch-') as tmp:
        in_path = os.path.join(tmp, f'in{ext}')
        out_path = os.path.join(tmp, 'moshable.avi')
        f.save(in_path)

        try:
            run_ffmpeg([
                '-i', in_path,
                '-t', str(MAX_DURATION),
                '-vf', f'scale={width}:-2:flags=fast_bilinear',
                '-r', str(PREPARE_FPS),
                '-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', '4',
                '-g', str(GOP), '-bf', '0',
                '-an',
                out_path,
            ])
        except RuntimeError as e:
            return jsonify(error=f'Encoding fehlgeschlagen: {e}'), 500
        except subprocess.TimeoutExpired:
            return jsonify(error='Encoding hat zu lange gedauert.'), 504

        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            return jsonify(error='Encoding hat keine Datei erzeugt.'), 500

        return send_file(out_path, mimetype='video/x-msvideo',
                          as_attachment=True, download_name='moshable.avi')


@app.route('/api/glitch/render', methods=['POST'])
def render():
    if 'video' not in request.files:
        return jsonify(error='Keine Datei erhalten.'), 400
    f = request.files['video']

    try:
        brightness = clamp(float(request.form.get('brightness', 0)), -100, 100) / 100
        contrast = 1 + clamp(float(request.form.get('contrast', 0)), -100, 100) / 100
        saturation = 1 + clamp(float(request.form.get('saturation', 0)), -100, 100) / 100
    except ValueError:
        brightness, contrast, saturation = 0, 1, 1

    crf = '16' if request.form.get('quality') == 'high' else '20'

    with tempfile.TemporaryDirectory(prefix='glitch-') as tmp:
        in_path = os.path.join(tmp, 'in.avi')
        out_path = os.path.join(tmp, f'{uuid.uuid4().hex}.mp4')
        f.save(in_path)

        args = ['-fflags', '+genpts+igndts', '-i', in_path]
        if brightness != 0 or contrast != 1 or saturation != 1:
            args += ['-vf', f'eq=brightness={brightness}:contrast={contrast}:saturation={saturation}']
        args += ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', crf,
                  '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_path]

        try:
            run_ffmpeg(args)
        except RuntimeError as e:
            return jsonify(error=f'Rendern fehlgeschlagen — evtl. zu stark korrumpiert: {e}'), 500
        except subprocess.TimeoutExpired:
            return jsonify(error='Rendern hat zu lange gedauert.'), 504

        if not os.path.exists(out_path) or os.path.getsize(out_path) == 0:
            return jsonify(error='Rendern hat keine Datei erzeugt.'), 500

        return send_file(out_path, mimetype='video/mp4', as_attachment=False)


@app.route('/api/glitch/health', methods=['GET'])
def health():
    return jsonify(status='ok')


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5007)
