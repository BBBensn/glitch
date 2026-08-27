"""glitch video-mode backend — transcodes uploads to a moshable AVI and
renders edited (byte-corrupted) AVIs back to playable MP4. All actual
frame manipulation happens client-side in the browser; this service only
wraps ffmpeg for the two steps that need a real codec."""

import colorsys
import json
import os
import re
import subprocess
import tempfile
import uuid

from flask import Flask, request, send_file, jsonify

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 400 * 1024 * 1024  # 400MB upload cap (high-res re-prepare for export)

MAX_DURATION = 20      # seconds taken from the source clip
DEFAULT_WIDTH = 480    # moshable proxy resolution while editing (fast + small payloads)
MAX_WIDTH = 1920       # cap for high-quality export re-prepare / canvas dimensions
PREPARE_FPS = 15
GOP = 15                # keyframe every ~1s -> several I-frames to mosh with
FFMPEG_TIMEOUT = 120

ALLOWED_EXT = {'.mp4', '.mov', '.avi', '.webm', '.mkv', '.m4v', '.gif'}
HEX_COLOR_RE = re.compile(r'^#[0-9a-fA-F]{6}$')


def run_ffmpeg(args):
    proc = subprocess.run(
        ['ffmpeg', '-y', '-hide_banner', *args],
        capture_output=True, timeout=FFMPEG_TIMEOUT,
    )
    if proc.returncode != 0:
        raise RuntimeError(proc.stderr.decode('utf-8', errors='replace')[-1500:])


def clamp(value, lo, hi):
    return max(lo, min(hi, value))


def even(n):
    """mpeg4/xvid needs even dimensions — ffmpeg's own rounding here is
    undocumented/version-dependent, so we force it ourselves."""
    n = int(n) - (int(n) % 2)
    return max(2, n)


def valid_bg(bg):
    """Only free-form string that reaches a filter_complex/-vf string in this
    file — validate against a strict hex pattern before interpolating it,
    so a stray value can't break the filtergraph syntax (not a shell-
    injection risk, subprocess.run has no shell, but a broken filtergraph
    still turns into a confusing 500)."""
    if isinstance(bg, str) and HEX_COLOR_RE.match(bg):
        return bg
    return '#000000'


def hex_to_hue_sat(hex_color):
    """Derives ffmpeg colorize's hue (0-360) and saturation (0-1) from a
    hex color the user picked, so 'choose a color' maps directly onto the
    filter instead of exposing raw hue/saturation sliders."""
    if not (isinstance(hex_color, str) and HEX_COLOR_RE.match(hex_color)):
        hex_color = '#00ff66'
    r = int(hex_color[1:3], 16) / 255
    g = int(hex_color[3:5], 16) / 255
    b = int(hex_color[5:7], 16) / 255
    h, _l, s = colorsys.rgb_to_hls(r, g, b)
    return h * 360, s


def probe_dimensions(path):
    """Reads back the actual encoded width/height so the client can seed its
    canvas from whatever the first clip ended up as (mirrors the photo
    mode's 'first image defines the canvas' behavior)."""
    try:
        proc = subprocess.run(
            ['ffprobe', '-v', 'error', '-select_streams', 'v:0',
             '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
            capture_output=True, timeout=10,
        )
        if proc.returncode != 0:
            return None
        w_str, h_str = proc.stdout.decode('utf-8', errors='replace').strip().split(',')
        return int(w_str), int(h_str)
    except Exception:
        return None


def build_fit_filter(mode, w, h, pan_x, pan_y, bg):
    """Fits a clip into a fixed output canvas — 'cover' scales up and crops
    the excess (pan_x/pan_y shift which part survives), 'contain' scales
    down and pads with bg, 'stretch' ignores the source aspect ratio
    entirely (kept as a deliberate glitch-aesthetic option, not just a
    fallback). Verified against real ffmpeg before wiring this in."""
    w, h = even(w), even(h)
    pan_x = clamp(float(pan_x), -1, 1)
    pan_y = clamp(float(pan_y), -1, 1)
    if mode == 'contain':
        bg = valid_bg(bg)
        return (f"scale={w}:{h}:force_original_aspect_ratio=decrease:flags=fast_bilinear,"
                f"pad={w}:{h}:(ow-iw)/2:(oh-ih)/2:color={bg}")
    if mode == 'stretch':
        return f"scale={w}:{h}:flags=fast_bilinear"
    # cover (default)
    return (f"scale={w}:{h}:force_original_aspect_ratio=increase:flags=fast_bilinear,"
            f"crop={w}:{h}:x='(in_w-out_w)/2*(1+{pan_x})':y='(in_h-out_h)/2*(1+{pan_y})'")


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

    canvas_w_raw = request.form.get('canvasW')
    canvas_h_raw = request.form.get('canvasH')
    use_canvas = False
    canvas_w = canvas_h = 0
    if canvas_w_raw and canvas_h_raw:
        try:
            canvas_w = clamp(int(float(canvas_w_raw)), 16, MAX_WIDTH)
            canvas_h = clamp(int(float(canvas_h_raw)), 16, MAX_WIDTH)
            use_canvas = True
        except ValueError:
            use_canvas = False

    fit_mode = request.form.get('fitMode', 'cover')
    if fit_mode not in ('cover', 'contain', 'stretch'):
        fit_mode = 'cover'
    try:
        pan_x = clamp(float(request.form.get('panX', 0)), -1, 1)
        pan_y = clamp(float(request.form.get('panY', 0)), -1, 1)
    except ValueError:
        pan_x = pan_y = 0
    bg = valid_bg(request.form.get('bg', '#000000'))

    with tempfile.TemporaryDirectory(prefix='glitch-') as tmp:
        in_path = os.path.join(tmp, f'in{ext}')
        out_path = os.path.join(tmp, 'moshable.avi')
        f.save(in_path)

        vf = (build_fit_filter(fit_mode, canvas_w, canvas_h, pan_x, pan_y, bg) if use_canvas
              else f'scale={width}:-2:flags=fast_bilinear')

        try:
            run_ffmpeg([
                '-i', in_path,
                '-t', str(MAX_DURATION),
                '-vf', vf,
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

        resp = send_file(out_path, mimetype='video/x-msvideo',
                          as_attachment=True, download_name='moshable.avi')
        dims = probe_dimensions(out_path)
        if dims:
            resp.headers['X-Video-Width'] = str(dims[0])
            resp.headers['X-Video-Height'] = str(dims[1])
        return resp


def build_segment_filter(segments):
    """One eq/hue/negate/tint/glitch-filter chain per clip segment
    (frame-range within the merged video), then concat back together —
    lets each original clip keep its own color grading and glitch filters
    in the final render. Filter syntax verified against real ffmpeg before
    this was wired in (see docs/changelogs).

    Tint (colorize) needs a small branch (split -> colorize -> blend)
    instead of a plain comma-chained filter, since it has to mix the
    colorized version back with the original at an adjustable strength —
    unlike every other stage here, which is a single-input/single-output
    filter that can just be appended to the linear chain."""
    if not segments:
        return None
    try:
        parts = []
        for i, seg in enumerate(segments):
            start = max(0, int(seg.get('start', 0)))
            end = max(start + 1, int(seg.get('end', start + 1)))
            b = clamp(float(seg.get('brightness', 0)), -100, 100) / 100
            c = 1 + clamp(float(seg.get('contrast', 0)), -100, 100) / 100
            s = 1 + clamp(float(seg.get('saturation', 0)), -100, 100) / 100
            h = clamp(float(seg.get('hue', 0)), -180, 180)
            base_chain = (f"trim=start_frame={start}:end_frame={end},setpts=PTS-STARTPTS,"
                          f"eq=brightness={b}:contrast={c}:saturation={s}")
            if seg.get('bw'):
                base_chain += ",hue=s=0"
            if h:
                base_chain += f",hue=h={h}"
            if seg.get('invert'):
                base_chain += ",negate"

            tail_chain = ""
            rgb_shift = seg.get('rgbShift') or {}
            if rgb_shift.get('enabled'):
                amount = int(clamp(float(rgb_shift.get('amount', 8)), 0, 20))
                if amount:
                    tail_chain += f",rgbashift=rh={amount}:bh=-{amount}"

            noise = seg.get('noise') or {}
            if noise.get('enabled'):
                strength = int(clamp(float(noise.get('strength', 20)), 0, 100))
                if strength:
                    tail_chain += f",noise=alls={strength}:allf=t"

            pixelate = seg.get('pixelate') or {}
            if pixelate.get('enabled'):
                block = int(clamp(float(pixelate.get('blockSize', 8)), 2, 40))
                tail_chain += f",scale=iw/{block}:ih/{block}:flags=neighbor,scale=iw*{block}:ih*{block}:flags=neighbor"

            scanlines = seg.get('scanlines') or {}
            if scanlines.get('enabled'):
                intensity = clamp(float(scanlines.get('intensity', 40)), 0, 100)
                factor = 1 - intensity / 100 * 0.8
                # lum()/cb()/cr() must be lowercase — verified against ffmpeg 8.0.1,
                # uppercase (as some stale docs show) fails with "Unknown function".
                tail_chain += (",geq=lum='if(mod(floor(Y/2)\\,2)\\,lum(X\\,Y)*"
                                f"{factor}\\,lum(X\\,Y))':cb='cb(X,Y)':cr='cr(X,Y)'")

            tint = seg.get('tint') or {}
            if tint.get('enabled'):
                hue_deg, sat = hex_to_hue_sat(tint.get('color', '#00ff66'))
                mix = clamp(float(tint.get('mix', 60)), 0, 100) / 100
                # blend's all_opacity is the BASE (bottom/original) layer's
                # visibility, not the top layer's — opacity=0 shows the top
                # (colored) input fully, opacity=1 shows only the base.
                # Counterintuitive, verified empirically; inverted here so
                # mix=100% (user wants full tint) -> opacity=0.
                opacity = 1 - mix
                pre, base_lbl, src_lbl, colored_lbl = (
                    f"seg{i}pre", f"seg{i}base", f"seg{i}src", f"seg{i}colored")
                parts.append(f"[0:v]{base_chain}[{pre}]")
                parts.append(f"[{pre}]split=2[{base_lbl}][{src_lbl}]")
                parts.append(f"[{src_lbl}]colorize=hue={hue_deg:.2f}:saturation={sat:.3f}:lightness=0.5:mix=1[{colored_lbl}]")
                parts.append(f"[{base_lbl}][{colored_lbl}]blend=all_mode=normal:all_opacity={opacity:.3f}{tail_chain}[s{i}]")
            else:
                parts.append(f"[0:v]{base_chain}{tail_chain}[s{i}]")
        concat_inputs = ''.join(f"[s{i}]" for i in range(len(segments)))
        parts.append(f"{concat_inputs}concat=n={len(segments)}:v=1:a=0[outv]")
        return ';'.join(parts)
    except (TypeError, ValueError, KeyError):
        return None


@app.route('/api/glitch/render', methods=['POST'])
def render():
    if 'video' not in request.files:
        return jsonify(error='Keine Datei erhalten.'), 400
    f = request.files['video']

    try:
        segments = json.loads(request.form.get('segments', '[]'))
        if not isinstance(segments, list):
            segments = []
    except (TypeError, ValueError):
        segments = []

    crf = '16' if request.form.get('quality') == 'high' else '20'

    with tempfile.TemporaryDirectory(prefix='glitch-') as tmp:
        in_path = os.path.join(tmp, 'in.avi')
        out_path = os.path.join(tmp, f'{uuid.uuid4().hex}.mp4')
        f.save(in_path)

        args = ['-fflags', '+genpts+igndts', '-i', in_path]
        filter_complex = build_segment_filter(segments)
        if filter_complex:
            args += ['-filter_complex', filter_complex, '-map', '[outv]']
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
