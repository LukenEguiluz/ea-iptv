import json
import os
import re
import subprocess
import threading
from pathlib import Path

import requests
from django.http import FileResponse, HttpResponse, StreamingHttpResponse

STREAM_CHUNK = 64 * 1024
CACHE_DIR = Path(os.environ.get('IPTV_TRANSCODE_CACHE', '/tmp/iptv-transcode-cache'))
BROWSER_AUDIO_CODECS = {'aac', 'mp3', 'opus', 'vorbis', 'flac'}
BROWSER_CONTAINERS = {'mp4', 'mov', 'm4v'}
NON_BROWSER_VIDEO_CODECS = {'hevc', 'h265', 'mpeg2video', 'mpeg1video', 'av1', 'vp9'}
_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


def _lock_for(key: str) -> threading.Lock:
    with _locks_guard:
        if key not in _locks:
            _locks[key] = threading.Lock()
        return _locks[key]


def probe_streams(upstream_url: str, user_agent: str) -> list[dict]:
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_streams',
        '-show_format',
        '-user_agent', user_agent,
        upstream_url,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=90, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return []
    if result.returncode != 0:
        return []
    try:
        payload = json.loads(result.stdout or '{}')
    except json.JSONDecodeError:
        return []
    return payload.get('streams', [])


def _first_stream(streams: list[dict], codec_type: str) -> dict | None:
    for stream in streams:
        if stream.get('codec_type') == codec_type:
            return stream
    return None


def resolve_live_url(upstream_url: str, user_agent: str) -> str:
    try:
        response = requests.get(
            upstream_url,
            headers={'User-Agent': user_agent, 'Range': 'bytes=0-0'},
            allow_redirects=True,
            timeout=12,
            stream=True,
        )
        final_url = response.url
        response.close()
        return final_url
    except requests.RequestException:
        return upstream_url


def probe_video_codec(upstream_url: str, user_agent: str, timeout: int = 15) -> str:
    resolved = resolve_live_url(upstream_url, user_agent)
    cmd = [
        'ffprobe',
        '-v', 'quiet',
        '-select_streams', 'v:0',
        '-show_entries', 'stream=codec_name',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        '-user_agent', user_agent,
        '-probesize', '5000000',
        '-analyzeduration', '5000000',
        resolved,
    ]
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout, check=False)
    except (subprocess.TimeoutExpired, OSError):
        return ''
    raw = (result.stdout or '').strip().lower()
    if not raw:
        return ''
    return raw.splitlines()[0].strip()


def live_needs_transcode(upstream_url: str, user_agent: str) -> bool:
    codec = probe_video_codec(upstream_url, user_agent)
    if codec.startswith('h264'):
        return False
    if codec in NON_BROWSER_VIDEO_CODECS:
        return True
    return not codec


def ffmpeg_live_h264_stream(upstream_url: str, user_agent: str) -> StreamingHttpResponse:
    source_url = resolve_live_url(upstream_url, user_agent)
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', user_agent,
        '-fflags', '+genpts+nobuffer',
        '-flags', 'low_delay',
        '-probesize', '5000000',
        '-analyzeduration', '5000000',
        '-i', source_url,
        '-map', '0:v:0?',
        '-map', '0:a:0?',
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-tune', 'zerolatency',
        '-g', '48',
        '-keyint_min', '48',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ac', '2',
        '-f', 'mpegts',
        'pipe:1',
    ]
    process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

    def stream():
        try:
            while True:
                chunk = process.stdout.read(STREAM_CHUNK)
                if not chunk:
                    break
                yield chunk
        finally:
            process.terminate()
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                process.kill()

    response = StreamingHttpResponse(stream(), content_type='video/mp2t')
    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


def analyze_stream(upstream_url: str, ext: str, user_agent: str) -> dict:
    streams = probe_streams(upstream_url, user_agent)
    audio = _first_stream(streams, 'audio')
    video = _first_stream(streams, 'video')
    audio_codec = (audio or {}).get('codec_name', '').lower()
    video_codec = (video or {}).get('codec_name', '').lower()
    container = ext.lower().lstrip('.')
    audio_ok = not audio_codec or audio_codec in BROWSER_AUDIO_CODECS
    container_ok = container in BROWSER_CONTAINERS
    needs_processing = not container_ok or not audio_ok
    return {
        'streams': streams,
        'audio_codec': audio_codec,
        'video_codec': video_codec,
        'container': container,
        'audio_ok': audio_ok,
        'container_ok': container_ok,
        'needs_processing': needs_processing,
    }


def cache_path(kind: str, stream_id: str | int, ext: str) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe_ext = re.sub(r'[^a-z0-9]+', '', (ext or 'mp4').lower()) or 'mp4'
    return CACHE_DIR / f'{kind}_{stream_id}_{safe_ext}.mp4'


def ensure_browser_mp4(upstream_url: str, output_path: Path, analysis: dict, user_agent: str) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    partial = output_path.with_suffix('.partial.mp4')
    if partial.exists():
        partial.unlink(missing_ok=True)

    audio_codec = analysis.get('audio_codec', '')
    copy_audio = analysis.get('audio_ok', False)
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', user_agent,
        '-i', upstream_url,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'copy',
    ]
    if copy_audio:
        cmd.extend(['-c:a', 'copy'])
    else:
        cmd.extend(['-c:a', 'aac', '-b:a', '192k', '-ac', '2'])
    cmd.extend(['-movflags', '+faststart', str(partial)])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60 * 60, check=False)
    if result.returncode != 0 or not partial.exists() or partial.stat().st_size == 0:
        partial.unlink(missing_ok=True)
        detail = (result.stderr or 'ffmpeg failed').strip()[-300:]
        raise RuntimeError(detail or 'No se pudo preparar el video')

    os.replace(partial, output_path)


def get_or_create_browser_mp4(
    upstream_url: str,
    kind: str,
    stream_id: str | int,
    ext: str,
    user_agent: str,
) -> Path:
    target = cache_path(kind, stream_id, ext)
    if target.exists() and target.stat().st_size > 0:
        return target

    key = str(target)
    lock = _lock_for(key)
    with lock:
        if target.exists() and target.stat().st_size > 0:
            return target
        analysis = analyze_stream(upstream_url, ext, user_agent)
        ensure_browser_mp4(upstream_url, target, analysis, user_agent)
        return target


def file_range_response(path: Path, request, content_type: str = 'video/mp4') -> FileResponse | HttpResponse:
    file_size = path.stat().st_size
    range_header = request.META.get('HTTP_RANGE', '').strip()

    if range_header:
        match = re.match(r'bytes=(\d*)-(\d*)', range_header)
        if match:
            start_str, end_str = match.groups()
            start = int(start_str) if start_str else 0
            end = int(end_str) if end_str else file_size - 1
            end = min(end, file_size - 1)
            if start <= end:
                length = end - start + 1
                with path.open('rb') as handle:
                    handle.seek(start)
                    data = handle.read(length)
                response = HttpResponse(data, status=206, content_type=content_type)
                response['Content-Range'] = f'bytes {start}-{end}/{file_size}'
                response['Content-Length'] = str(length)
                response['Accept-Ranges'] = 'bytes'
                response['Cache-Control'] = 'no-cache, no-transform'
                return response

    response = FileResponse(path.open('rb'), content_type=content_type)
    response['Content-Length'] = str(file_size)
    response['Accept-Ranges'] = 'bytes'
    response['Cache-Control'] = 'no-cache, no-transform'
    return response
