#!/usr/bin/env python3
"""
NexSon – Music Service

Search metadata:
  1. YouTube Data API v3 (official, via YOUTUBE_API_KEY)
  2. yt-dlp fallback if the API key is unavailable

Audio playback:
  yt-dlp resolves the media URL and this service proxies the audio stream.

Endpoints:
  GET /health
  GET /search?q=<term>&limit=25
  GET /tracks/<video_id>
  GET /tracks/<video_id>/stream
  GET /stream?id=<video_id>
"""

import os
import re
import time
import threading
import traceback

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
import requests as req_lib
import yt_dlp

app = Flask(__name__)
CORS(app)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

_url_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600


def _parse_iso8601_duration(value: str) -> int:
    """Convertit une durée ISO 8601 YouTube (PT3M42S) en secondes."""
    if not value:
        return 0

    match = re.fullmatch(
        r"P(?:(?P<days>\d+)D)?T"
        r"(?:(?P<hours>\d+)H)?"
        r"(?:(?P<minutes>\d+)M)?"
        r"(?:(?P<seconds>\d+)S)?",
        value,
    )
    if not match:
        return 0

    parts = {k: int(v or 0) for k, v in match.groupdict().items()}
    return (
        parts["days"] * 86400
        + parts["hours"] * 3600
        + parts["minutes"] * 60
        + parts["seconds"]
    )


def _best_thumbnail(snippet: dict, video_id: str, small: bool = False) -> str:
    thumbs = (snippet or {}).get("thumbnails") or {}
    order = ("default", "medium", "high", "standard", "maxres") if small else (
        "maxres", "standard", "high", "medium", "default"
    )

    for key in order:
        url = (thumbs.get(key) or {}).get("url")
        if url:
            return url

    return (
        f"https://i.ytimg.com/vi/{video_id}/default.jpg"
        if small
        else f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg"
    )


def _normalize_youtube_video(video: dict) -> dict:
    video_id = video.get("id") or ""
    snippet = video.get("snippet") or {}
    details = video.get("contentDetails") or {}

    return {
        "trackId": f"yt_{video_id}",
        "trackName": snippet.get("title") or "Inconnu",
        "artistName": snippet.get("channelTitle") or "Artiste inconnu",
        "collectionName": "",
        "collectionId": "",
        "artworkUrl": _best_thumbnail(snippet, video_id),
        "artworkSmall": _best_thumbnail(snippet, video_id, small=True),
        "ytVideoId": video_id,
        "duration": _parse_iso8601_duration(details.get("duration", "")),
        "genre": "Music",
        "releaseDate": snippet.get("publishedAt") or "",
        "trackNumber": 1,
        "artistId": snippet.get("channelId") or "",
        "source": "youtube-data-api",
        "explicit": False,
        "streamEndpoint": f"/tracks/{video_id}/stream",
    }


def _youtube_api_get(resource: str, params: dict) -> dict:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY absente")

    query = {**params, "key": YOUTUBE_API_KEY}
    response = req_lib.get(
        f"{YOUTUBE_API_BASE}/{resource}",
        params=query,
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def _search_youtube_api(term: str, limit: int) -> list:
    search_data = _youtube_api_get(
        "search",
        {
            "part": "snippet",
            "q": term,
            "type": "video",
            "videoCategoryId": "10",
            "maxResults": min(max(limit, 1), 50),
            "safeSearch": "none",
        },
    )

    video_ids = [
        (item.get("id") or {}).get("videoId")
        for item in search_data.get("items", [])
    ]
    video_ids = [video_id for video_id in video_ids if video_id]

    if not video_ids:
        return []

    details_data = _youtube_api_get(
        "videos",
        {
            "part": "snippet,contentDetails",
            "id": ",".join(video_ids),
            "maxResults": len(video_ids),
        },
    )

    by_id = {
        item.get("id"): item
        for item in details_data.get("items", [])
        if item.get("id")
    }

    tracks = []
    for video_id in video_ids:
        item = by_id.get(video_id)
        if item:
            tracks.append(_normalize_youtube_video(item))

    return tracks


def _get_youtube_video_api(video_id: str):
    data = _youtube_api_get(
        "videos",
        {
            "part": "snippet,contentDetails",
            "id": video_id,
            "maxResults": 1,
        },
    )
    items = data.get("items", [])
    if not items:
        return None
    return _normalize_youtube_video(items[0])


def _search_ytdlp(term: str, limit: int) -> list:
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "ignoreerrors": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(f"ytsearch{limit}:{term}", download=False)

    tracks = []
    for entry in (info or {}).get("entries", []):
        if not entry:
            continue

        video_id = entry.get("id") or entry.get("videoId")
        if not video_id:
            continue

        tracks.append({
            "trackId": f"yt_{video_id}",
            "trackName": entry.get("title", "Inconnu"),
            "artistName": entry.get("uploader") or entry.get("channel") or "Artiste inconnu",
            "collectionName": "",
            "collectionId": "",
            "artworkUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "artworkSmall": f"https://i.ytimg.com/vi/{video_id}/default.jpg",
            "ytVideoId": video_id,
            "duration": int(entry.get("duration") or 0),
            "genre": "Music",
            "releaseDate": "",
            "trackNumber": 1,
            "artistId": entry.get("channel_id") or "",
            "source": "youtube-ytdlp",
            "explicit": False,
            "streamEndpoint": f"/tracks/{video_id}/stream",
        })

    return tracks


def _resolve_stream_url(video_id: str) -> str:
    """Retourne l'URL directe du flux audio (cache 1h)."""
    now = time.time()

    with _cache_lock:
        entry = _url_cache.get(video_id)
        if entry and entry["exp"] > now:
            return entry["url"]

    ydl_opts = {
        "format": "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "noplaylist": True,
    }

    url = ""
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False,
        )

        url = info.get("url", "")
        if not url:
            formats = [
                f for f in info.get("formats", [])
                if f.get("vcodec") == "none" and f.get("url")
            ]
            if formats:
                formats.sort(key=lambda f: f.get("abr") or f.get("tbr") or 0)
                url = formats[-1]["url"]

    if url:
        with _cache_lock:
            _url_cache[video_id] = {
                "url": url,
                "exp": now + CACHE_TTL,
            }

    return url


def _proxy_stream(video_id: str):
    if not video_id:
        return jsonify({"error": "Paramètre id manquant"}), 400

    try:
        media_url = _resolve_stream_url(video_id)
        if not media_url:
            return jsonify({"error": "Impossible de résoudre le flux"}), 404

        forward_headers = {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/154.0.0.0 Safari/537.36"
            ),
        }

        if "Range" in request.headers:
            forward_headers["Range"] = request.headers["Range"]

        upstream = req_lib.get(
            media_url,
            headers=forward_headers,
            stream=True,
            timeout=30,
        )
        upstream.raise_for_status()

        response_headers = {
            "Content-Type": upstream.headers.get("Content-Type", "audio/webm"),
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=300",
        }

        for header in ("Content-Length", "Content-Range"):
            if header in upstream.headers:
                response_headers[header] = upstream.headers[header]

        def generate():
            try:
                for chunk in upstream.iter_content(chunk_size=32768):
                    if chunk:
                        yield chunk
            finally:
                upstream.close()

        return Response(
            stream_with_context(generate()),
            status=upstream.status_code,
            headers=response_headers,
        )

    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "NexSon Music Service",
        "youtubeDataApi": bool(YOUTUBE_API_KEY),
        "searchProvider": "youtube-data-api" if YOUTUBE_API_KEY else "yt-dlp",
    })


@app.route("/search")
def search():
    term = request.args.get("q", "").strip()

    try:
        limit = min(max(int(request.args.get("limit", 25)), 1), 50)
    except ValueError:
        limit = 25

    if not term:
        return jsonify([])

    if YOUTUBE_API_KEY:
        try:
            tracks = _search_youtube_api(term, limit)
            if tracks:
                return jsonify(tracks)
        except Exception as exc:
            print(f"[NexSon] YouTube Data API search failed: {exc}")

    try:
        return jsonify(_search_ytdlp(term, limit))
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


@app.route("/tracks/<video_id>")
def track(video_id):
    clean_id = video_id.replace("yt_", "", 1).strip()

    if not clean_id:
        return jsonify({"error": "ID manquant"}), 400

    if YOUTUBE_API_KEY:
        try:
            result = _get_youtube_video_api(clean_id)
            if result:
                return jsonify(result)
        except Exception as exc:
            print(f"[NexSon] YouTube Data API track failed: {exc}")

    try:
        results = _search_ytdlp(
            f"https://www.youtube.com/watch?v={clean_id}",
            1,
        )
        if results:
            return jsonify(results[0])
    except Exception:
        pass

    return jsonify({"error": "Titre introuvable"}), 404


@app.route("/tracks/<video_id>/stream")
def track_stream(video_id):
    clean_id = video_id.replace("yt_", "", 1).strip()
    return _proxy_stream(clean_id)


@app.route("/stream")
def stream():
    video_id = request.args.get("id", "").replace("yt_", "", 1).strip()
    return _proxy_stream(video_id)


if __name__ == "__main__":
    provider = "YouTube Data API v3" if YOUTUBE_API_KEY else "yt-dlp fallback"
    print("NexSon Music Service démarré sur http://localhost:5000")
    print(f"Recherche: {provider}")
    print("Endpoints: /health  /search  /tracks/<id>  /tracks/<id>/stream")
    app.run(
        host="0.0.0.0",
        port=int(os.getenv("MUSIC_PORT", "5000")),
        debug=False,
        threaded=True,
    )
