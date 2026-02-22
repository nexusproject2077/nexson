#!/usr/bin/env python3
"""
NexSon – Music Service
Search + Stream proxy via yt-dlp uniquement (plus de dépendance ytmusicapi)

Endpoints:
  GET /health
  GET /search?q=<term>&limit=25
  GET /stream?id=<videoId>   ← proxy audio avec support Range (seeking OK)
"""

import time
import threading
import traceback

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
import yt_dlp
import requests as req_lib

app = Flask(__name__)
CORS(app)

# ── Cache des URLs yt-dlp (expirent ~6h sur YouTube) ─────────────────────────
_url_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600  # 1 h


def _resolve_stream_url(video_id: str) -> str:
    """Retourne l'URL directe du flux audio (avec cache 1h)."""
    now = time.time()
    with _cache_lock:
        entry = _url_cache.get(video_id)
        if entry and entry['exp'] > now:
            return entry['url']

    ydl_opts = {
        'format': 'bestaudio[ext=webm]/bestaudio/best',
        'quiet': True,
        'no_warnings': True,
        'extract_flat': False,
    }
    url = ''
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f'https://www.youtube.com/watch?v={video_id}',
            download=False
        )
        url = info.get('url', '')
        if not url:
            fmts = [f for f in info.get('formats', [])
                    if f.get('vcodec') == 'none' and f.get('url')]
            url = fmts[-1]['url'] if fmts else ''

    if url:
        with _cache_lock:
            _url_cache[video_id] = {'url': url, 'exp': now + CACHE_TTL}

    return url


# ── Routes ───────────────────────────────────────────────────────────────────

@app.route('/health')
def health():
    return jsonify({'status': 'ok', 'service': 'NexSon Music Service'})


@app.route('/search')
def search():
    q     = request.args.get('q', '').strip()
    limit = min(int(request.args.get('limit', 25)), 50)
    if not q:
        return jsonify([])

    try:
        ydl_opts = {
            'quiet': True,
            'no_warnings': True,
            'extract_flat': True,   # métadonnées seulement, pas de stream
            'ignoreerrors': True,
        }
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f'ytsearch{limit}:{q}', download=False)

        entries = (info or {}).get('entries', [])
        tracks  = []

        for e in entries:
            if not e:
                continue
            vid = e.get('id') or e.get('videoId')
            if not vid:
                continue

            # Thumbnails YouTube standard (pas besoin de les résoudre)
            art_big = f'https://i.ytimg.com/vi/{vid}/hqdefault.jpg'
            art_sm  = f'https://i.ytimg.com/vi/{vid}/default.jpg'

            tracks.append({
                'trackId':        f'yt_{vid}',
                'trackName':      e.get('title', 'Inconnu'),
                'artistName':     e.get('uploader') or e.get('channel') or 'Artiste inconnu',
                'collectionName': '',
                'collectionId':   '',
                'artworkUrl':     art_big,
                'artworkSmall':   art_sm,
                'ytVideoId':      vid,
                'duration':       int(e.get('duration') or 0),
                'genre':          '',
                'releaseDate':    '',
                'trackNumber':    1,
                'artistId':       '',
                'source':         'youtube',
                'explicit':       False,
            })

        return jsonify(tracks)

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/stream')
def stream():
    """
    Proxy du flux audio YouTube.
    Supporte les Range requests → seeking dans le navigateur.
    """
    video_id = request.args.get('id', '').strip()
    if not video_id:
        return jsonify({'error': 'Paramètre id manquant'}), 400

    try:
        yt_url = _resolve_stream_url(video_id)
        if not yt_url:
            return jsonify({'error': 'Impossible de résoudre le flux'}), 404

        fwd_headers = {
            'User-Agent': (
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) '
                'AppleWebKit/537.36 (KHTML, like Gecko) '
                'Chrome/120.0.0.0 Safari/537.36'
            ),
        }
        if 'Range' in request.headers:
            fwd_headers['Range'] = request.headers['Range']

        r = req_lib.get(yt_url, headers=fwd_headers, stream=True, timeout=30)
        r.raise_for_status()

        resp_headers = {
            'Content-Type':  r.headers.get('Content-Type', 'audio/webm'),
            'Accept-Ranges': 'bytes',
        }
        for h in ('Content-Length', 'Content-Range'):
            if h in r.headers:
                resp_headers[h] = r.headers[h]

        def generate():
            for chunk in r.iter_content(chunk_size=16384):
                if chunk:
                    yield chunk

        return Response(
            stream_with_context(generate()),
            status=r.status_code,
            headers=resp_headers,
        )

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print('NexSon Music Service démarré sur http://localhost:5000')
    print('Endpoints : /health  /search?q=...  /stream?id=...')
    app.run(host='0.0.0.0', port=5000, debug=False, threaded=True)
