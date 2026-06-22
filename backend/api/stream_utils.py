import json
import os
import re
import subprocess
import threading
from pathlib import Path

import requests
from django.conf import settings
from django.http import FileResponse, HttpResponse, StreamingHttpResponse

STREAM_CHUNK = 64 * 1024
CACHE_DIR = Path(os.environ.get('IPTV_TRANSCODE_CACHE', '/tmp/iptv-transcode-cache'))
BROWSER_AUDIO_CODECS = {'aac', 'mp3', 'opus', 'vorbis', 'flac'}
NON_BROWSER_AUDIO_CODECS = {'ac3', 'eac3', 'dts', 'truehd', 'dts_hd', 'pcm_s16le', 'pcm_s24le'}
BROWSER_CONTAINERS = {'mp4', 'mov', 'm4v'}
BROWSER_VIDEO_CODECS = {'h264', 'avc1', 'mpeg4', 'mp4v'}
NON_BROWSER_VIDEO_CODECS = {'hevc', 'h265', 'hev1', 'hvc1', 'vp9', 'av1', 'mpeg2video', 'wmv3', 'vc1'}
TEXT_SUBTITLE_CODECS = {'subrip', 'ass', 'ssa', 'webvtt', 'mov_text'}
_media_info_cache: dict[str, tuple[float, dict]] = {}
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


def _probe_payload(upstream_url: str, user_agent: str) -> dict:
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
        return {}
    if result.returncode != 0:
        return {}
    try:
        return json.loads(result.stdout or '{}')
    except json.JSONDecodeError:
        return {}


def _language_label(tags: dict, fallback: str) -> str:
    lang = (tags or {}).get('language', '').strip()
    title = (tags or {}).get('title', '').strip()
    if title:
        return title
    if lang:
        return lang.upper()
    return fallback


def get_media_playback_info(upstream_url: str, user_agent: str) -> dict:
    cached = _media_info_cache.get(upstream_url)
    if cached and cached[0] > __import__('time').time():
        return cached[1]

    payload = _probe_payload(upstream_url, user_agent)
    streams = payload.get('streams', [])
    fmt = payload.get('format', {})
    duration_raw = fmt.get('duration')
    try:
        duration_seconds = float(duration_raw) if duration_raw else 0
    except (TypeError, ValueError):
        duration_seconds = 0

    audio_tracks = []
    subtitle_tracks = []
    audio_count = 0
    sub_count = 0

    for stream in streams:
        codec_type = stream.get('codec_type', '')
        stream_index = stream.get('index')
        tags = stream.get('tags') or {}
        if codec_type == 'audio':
            audio_count += 1
            audio_tracks.append({
                'index': stream_index,
                'language': tags.get('language', ''),
                'label': _language_label(tags, f'Audio {audio_count}'),
                'codec': stream.get('codec_name', ''),
                'channels': stream.get('channels') or 0,
            })
        elif codec_type == 'subtitle':
            codec_name = (stream.get('codec_name') or '').lower()
            if codec_name not in TEXT_SUBTITLE_CODECS:
                continue
            sub_count += 1
            subtitle_tracks.append({
                'index': stream_index,
                'language': tags.get('language', ''),
                'label': _language_label(tags, f'Subtítulos {sub_count}'),
                'codec': codec_name,
            })

    info = {
        'duration_seconds': round(duration_seconds, 1) if duration_seconds > 0 else None,
        'audio': audio_tracks,
        'subtitles': subtitle_tracks,
    }
    _media_info_cache[upstream_url] = (__import__('time').time() + 600, info)
    return info


def ffmpeg_subtitle_vtt_stream(upstream_url: str, sub_index: int, user_agent: str) -> StreamingHttpResponse:
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', user_agent,
        '-i', upstream_url,
        '-map', f'0:{sub_index}?',
        '-f', 'webvtt',
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

    response = StreamingHttpResponse(stream(), content_type='text/vtt; charset=utf-8')
    response['Cache-Control'] = 'public, max-age=3600'
    return response


def _first_stream(streams: list[dict], codec_type: str) -> dict | None:
    for stream in streams:
        if stream.get('codec_type') == codec_type:
            return stream
    return None


def resolve_live_url(upstream_url: str, user_agent: str) -> str:
    headers = {'User-Agent': user_agent, 'Range': 'bytes=0-0'}
    try:
        if getattr(settings, 'XTREAM_HTTP_PROXY', '').strip():
            from api.xtream import provider_stream_get
            response = provider_stream_get(
                upstream_url,
                stream=True,
                timeout=(12, 30),
                extra_headers=headers,
            )
        else:
            response = requests.get(
                upstream_url,
                headers=headers,
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


def _video_codec_ok(video_codec: str) -> bool:
    codec = (video_codec or '').lower()
    if not codec:
        return False
    if codec.startswith('h264') or codec in BROWSER_VIDEO_CODECS:
        return True
    return codec not in NON_BROWSER_VIDEO_CODECS


def _append_transcode_output(
    cmd: list,
    analysis: dict,
    *,
    audio_stream_index: int | None = None,
    faststart: bool = False,
    fragmented: bool = False,
    output: str | None = None,
) -> None:
    has_audio = analysis.get('has_audio', bool(analysis.get('audio_codec')))
    video_ok = analysis.get('video_ok', _video_codec_ok(analysis.get('video_codec', '')))

    cmd.extend(['-map', '0:v:0?'])
    if has_audio:
        if audio_stream_index is not None:
            cmd.extend(['-map', f'0:{audio_stream_index}?'])
        else:
            cmd.extend(['-map', '0:a:0?'])

    cmd.extend(['-fflags', '+genpts', '-avoid_negative_ts', 'make_zero'])

    if video_ok:
        cmd.extend(['-c:v', 'copy'])
    else:
        cmd.extend([
            '-c:v', 'libx264',
            '-preset', 'veryfast',
            '-profile:v', 'main',
            '-level', '4.0',
            '-pix_fmt', 'yuv420p',
        ])

    if not has_audio:
        cmd.append('-an')
    elif analysis.get('audio_ok'):
        cmd.extend(['-c:a', 'copy'])
    else:
        cmd.extend([
            '-af', 'aresample=async=1:first_pts=0',
            '-c:a', 'aac',
            '-b:a', '192k',
            '-ac', '2',
            '-ar', '48000',
        ])

    if output is not None:
        if fragmented:
            cmd.extend(['-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', output])
        elif faststart:
            cmd.extend(['-movflags', '+faststart', output])
        else:
            cmd.extend(['-f', 'mp4', output])


def analyze_stream(upstream_url: str, ext: str, user_agent: str) -> dict:
    streams = probe_streams(upstream_url, user_agent)
    audio = _first_stream(streams, 'audio')
    video = _first_stream(streams, 'video')
    audio_codec = (audio or {}).get('codec_name', '').lower()
    video_codec = (video or {}).get('codec_name', '').lower()
    container = ext.lower().lstrip('.')
    audio_channels = int((audio or {}).get('channels') or 0)
    has_audio = bool(audio_codec)
    audio_ok = (
        not has_audio
        or (
            audio_codec in BROWSER_AUDIO_CODECS
            and audio_codec not in NON_BROWSER_AUDIO_CODECS
            and audio_channels in (0, 1, 2)
        )
    )
    video_ok = _video_codec_ok(video_codec)
    container_ok = container in BROWSER_CONTAINERS
    needs_processing = not container_ok or not video_ok or (has_audio and not audio_ok)
    return {
        'streams': streams,
        'audio_codec': audio_codec,
        'video_codec': video_codec,
        'container': container,
        'audio_channels': audio_channels,
        'has_audio': has_audio,
        'audio_ok': audio_ok,
        'video_ok': video_ok,
        'container_ok': container_ok,
        'needs_processing': needs_processing,
    }


def cache_path(kind: str, stream_id: str | int, ext: str, audio_index: int = 0) -> Path:
    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    safe_ext = re.sub(r'[^a-z0-9]+', '', (ext or 'mp4').lower()) or 'mp4'
    suffix = f'_a{audio_index}' if audio_index else ''
    return CACHE_DIR / f'{kind}_{stream_id}_{safe_ext}{suffix}.mp4'


def ensure_browser_mp4(
    upstream_url: str,
    output_path: Path,
    analysis: dict,
    user_agent: str,
    audio_stream_index: int | None = None,
) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    partial = output_path.with_suffix('.partial.mp4')
    if partial.exists():
        partial.unlink(missing_ok=True)

    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', user_agent,
        '-fflags', '+genpts',
        '-avoid_negative_ts', 'make_zero',
        '-i', upstream_url,
    ]
    _append_transcode_output(
        cmd,
        analysis,
        audio_stream_index=audio_stream_index,
        faststart=True,
        output=str(partial),
    )

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
    audio_stream_index: int | None = None,
) -> Path:
    audio_key = audio_stream_index if audio_stream_index is not None else 0
    target = cache_path(kind, stream_id, ext, audio_key)
    if target.exists() and target.stat().st_size > 0:
        return target

    key = str(target)
    lock = _lock_for(key)
    with lock:
        if target.exists() and target.stat().st_size > 0:
            return target
        analysis = analyze_stream(upstream_url, ext, user_agent)
        ensure_browser_mp4(upstream_url, target, analysis, user_agent, audio_stream_index)
        return target


def _ffmpeg_transcode_cmd(
    upstream_url: str,
    analysis: dict,
    user_agent: str,
    *,
    output: str,
    audio_stream_index: int | None = None,
) -> list[str]:
    cmd = [
        'ffmpeg',
        '-hide_banner',
        '-loglevel', 'error',
        '-user_agent', user_agent,
        '-fflags', '+genpts',
        '-avoid_negative_ts', 'make_zero',
        '-i', upstream_url,
    ]
    _append_transcode_output(
        cmd,
        analysis,
        audio_stream_index=audio_stream_index,
        fragmented=True,
        output=output,
    )
    return cmd


def ffmpeg_browser_mp4_stream(
    upstream_url: str,
    analysis: dict,
    user_agent: str,
    audio_stream_index: int | None = None,
) -> StreamingHttpResponse:
    cmd = _ffmpeg_transcode_cmd(
        upstream_url,
        analysis,
        user_agent,
        output='pipe:1',
        audio_stream_index=audio_stream_index,
    )
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

    response = StreamingHttpResponse(stream(), content_type='video/mp4')
    response['Cache-Control'] = 'no-cache, no-transform'
    response['X-Accel-Buffering'] = 'no'
    return response


def warm_browser_mp4_cache(
    upstream_url: str,
    kind: str,
    stream_id: str | int,
    ext: str,
    user_agent: str,
    audio_stream_index: int | None = None,
) -> None:
    audio_key = audio_stream_index if audio_stream_index is not None else 0
    target = cache_path(kind, stream_id, ext, audio_key)
    if target.exists() and target.stat().st_size > 0:
        return

    def run():
        try:
            get_or_create_browser_mp4(
                upstream_url, kind, stream_id, ext, user_agent, audio_stream_index,
            )
        except Exception:
            pass

    threading.Thread(target=run, daemon=True).start()


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
