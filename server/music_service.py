#!/usr/bin/env python3
"""
NexSon – Music Service

Search metadata:
  1. YouTube Data API v3 (official, via YOUTUBE_API_KEY)
  2. yt-dlp fallback if the API key is unavailable

Audio playback:
  yt-dlp resolves the media URL and this service proxies the audio stream.

Video playback:
  yt-dlp resolves a progressive video with its audio track for the in-app clip.

Endpoints:
  GET /health
  GET /search?q=<term>&limit=25
  GET /tracks/<video_id>
  GET /tracks/<video_id>/stream
  GET /tracks/<video_id>/video
  GET /stream?id=<video_id>
"""

import os
import re
import time
import threading
import traceback
from urllib.parse import quote

from flask import Flask, jsonify, request, Response, stream_with_context
from flask_cors import CORS
import requests as req_lib
import yt_dlp
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "").strip()
# Path to a Netscape-format cookie export.  This must live on the VPS and is
# intentionally only read from the environment; never put cookies in Git.
YOUTUBE_COOKIEFILE = os.getenv("YOUTUBE_COOKIEFILE", "").strip()
YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3"

_url_cache: dict = {}
_lyrics_cache: dict = {}
_artwork_cache: dict = {}
_cache_lock = threading.Lock()
CACHE_TTL = 3600
SEARCH_CACHE_TTL = 600
LYRICS_CACHE_TTL = 3600
ARTWORK_CACHE_TTL = 21600
_http = req_lib.Session()

# Search can return a music-category video that is still a reaction, a live
# performance, or an editorial clip. Keep the catalogue focused on tracks.
_NON_TRACK_PATTERN = re.compile(
    r"\b(?:reaction|r[ée]agit|interview|podcast|trailer|teaser|"
    r"making\s+of|behind\s+the\s+scenes|tutorial|commentary|review|"
    r"full\s+movie|film\s+complet|sound\s+effect|ambience|"
    r"gameplay|walkthrough)\b",
    re.IGNORECASE,
)

_OFFICIAL_CHANNEL_PATTERN = re.compile(r"(?:\btopic\b|\bvevo\b|official\b)", re.IGNORECASE)


def _with_youtube_cookies(options: dict) -> dict:
    """Attach the optional server-side YouTube cookie jar to yt-dlp calls."""
    if YOUTUBE_COOKIEFILE:
        if os.path.isfile(YOUTUBE_COOKIEFILE):
            options["cookiefile"] = YOUTUBE_COOKIEFILE
        else:
            print(f"[NexSon] YOUTUBE_COOKIEFILE introuvable: {YOUTUBE_COOKIEFILE}")
    return options


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
    statistics = video.get("statistics") or {}

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
        "viewCount": int(statistics.get("viewCount") or 0),
        "genre": "Music",
        "releaseDate": snippet.get("publishedAt") or "",
        "trackNumber": 1,
        "artistId": snippet.get("channelId") or "",
        "source": "youtube-data-api",
        "explicit": False,
        "streamEndpoint": f"/tracks/{video_id}/stream",
        "videoEndpoint": f"/tracks/{video_id}/video",
    }


def _youtube_api_get(resource: str, params: dict) -> dict:
    if not YOUTUBE_API_KEY:
        raise RuntimeError("YOUTUBE_API_KEY absente")

    query = {**params, "key": YOUTUBE_API_KEY}
    response = _http.get(
        f"{YOUTUBE_API_BASE}/{resource}",
        params=query,
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def _normalise_search_text(value: str) -> str:
    """Lowercase and remove accents/punctuation for fair title comparisons."""
    import unicodedata
    value = unicodedata.normalize("NFKD", str(value or "").casefold())
    value = "".join(c for c in value if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def _split_artist_title(query: str) -> tuple[str, str]:
    """Recognise the common `Artist - Title` request without requiring it."""
    parts = re.split(r"\s+(?:-|–|—|by|par)\s+", query, maxsplit=1, flags=re.IGNORECASE)
    if len(parts) == 2 and all(parts):
        return _normalise_search_text(parts[0]), _normalise_search_text(parts[1])
    return "", _normalise_search_text(query)


def _phrase_score(value: str, expected: str, exact: float, partial: float) -> float:
    if not expected:
        return 0.0
    if value == expected:
        return exact
    if expected in value:
        return partial
    expected_tokens = expected.split()
    return partial * sum(token in value.split() for token in expected_tokens) / len(expected_tokens)


def _is_official_source(track: dict) -> bool:
    channel = str(track.get("artistName") or "")
    title = str(track.get("trackName") or "")
    return bool(
        _OFFICIAL_CHANNEL_PATTERN.search(channel)
        or re.search(r"\b(?:official\s+(?:audio|video)|audio\s+officiel|clip\s+officiel|provided\s+to\s+youtube)\b", title, re.I)
    )


def _music_score(track: dict, query: str) -> float:
    """Rank songs by exact artist/title intent, official sources and reach."""
    import math

    requested_artist, requested_title = _split_artist_title(query)
    q = _normalise_search_text(query)
    title = _normalise_search_text(track.get("trackName"))
    channel = _normalise_search_text(track.get("artistName"))
    if not q:
        return 0.0

    score = _phrase_score(title, requested_title or q, 120, 46)
    score += _phrase_score(channel, requested_artist, 90, 30)
    if not requested_artist:
        score += _phrase_score(channel, q, 18, 8)
    if _is_official_source(track):
        score += 30
    if _NON_TRACK_PATTERN.search(f"{title} {channel}"):
        score -= 180
    if "#" in str(track.get("trackName", "")):
        score -= 12
    duration = int(track.get("duration") or 0)
    if 90 <= duration <= 600:
        score += 10
    elif duration > 1200 or (duration and duration < 45):
        score -= 30
    # Popularity breaks ties without hiding a lower-viewed exact interpretation.
    views = max(0, int(track.get("viewCount") or 0))
    if views:
        score += min(18, math.log10(views + 1) * 2.2)
    return score


def _rank_music(tracks: list, term: str, limit: int) -> list:
    """Stable sort; preserve API response format and YouTube IDs."""
    unique = {}
    for track in tracks:
        key = track.get("ytVideoId") or track.get("trackId")
        if key and key not in unique:
            unique[key] = track
    return sorted(unique.values(), key=lambda t: _music_score(t, term), reverse=True)[:limit]


def _album_artwork_candidates(term: str) -> list:
    """Fetch one cached music-metadata page; never make playback depend on it."""
    cache_key = term.casefold()
    now = time.time()
    with _cache_lock:
        cached = _artwork_cache.get(cache_key)
        if cached and cached["exp"] > now:
            return cached["value"]

    candidates = []
    try:
        response = _http.get(
            "https://itunes.apple.com/search",
            params={"term": term, "media": "music", "entity": "song", "limit": 50},
            timeout=5,
        )
        if response.ok:
            candidates = response.json().get("results") or []
    except (req_lib.RequestException, ValueError):
        pass

    with _cache_lock:
        _artwork_cache[cache_key] = {"value": candidates, "exp": now + ARTWORK_CACHE_TTL}
    return candidates


def _apply_album_artwork(tracks: list, term: str) -> list:
    """Replace video thumbnails only when title *and* artist identify an album."""
    candidates = _album_artwork_candidates(term)
    if not candidates:
        return tracks

    for track in tracks:
        raw_title = str(track.get("trackName") or "")
        artist = _normalise_search_text(track.get("artistName"))
        title = _normalise_search_text(re.sub(r"\s*[\[(].*?[\])]\s*", " ", raw_title))
        # Many YouTube results are written as "Artist - Title".  Remove the
        # artist prefix only when it agrees with the channel name.
        if " - " in raw_title:
            prefix, possible_title = raw_title.split(" - ", 1)
            if _normalise_search_text(prefix) in artist or artist in _normalise_search_text(prefix):
                title = _normalise_search_text(
                    re.sub(r"\s*[\[(].*?[\])]\s*", " ", possible_title)
                )

        best, best_score = None, 0
        for candidate in candidates:
            candidate_title = _normalise_search_text(candidate.get("trackName"))
            candidate_artist = _normalise_search_text(candidate.get("artistName"))
            if not candidate_title or not candidate_artist:
                continue
            score = _phrase_score(title, candidate_title, 110, 45)
            score += _phrase_score(artist, candidate_artist, 85, 30)
            if score > best_score:
                best, best_score = candidate, score

        # A title-only match is too risky for common song names: preserve the
        # original YouTube thumbnail unless both identities agree.
        artwork = (best or {}).get("artworkUrl100") if best_score >= 140 else ""
        if artwork:
            track["videoArtworkUrl"] = track.get("artworkUrl", "")
            track["artworkUrl"] = artwork.replace("100x100bb", "600x600bb")
            track["artworkSmall"] = artwork
            track["collectionName"] = track.get("collectionName") or best.get("collectionName", "")
            track["collectionId"] = track.get("collectionId") or str(best.get("collectionId") or "")
    return tracks


def _search_youtube_api(term: str, limit: int) -> list:
    search_data = _youtube_api_get(
        "search",
        {
            "part": "snippet",
            "q": term,
            "type": "video",
            "videoCategoryId": "10",
            # Rank a broad pool rather than trusting YouTube's first results.
            "maxResults": min(max(limit * 4, 20), 50),
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
            "part": "snippet,contentDetails,statistics",
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
        if item and _is_track_result(item):
            tracks.append(_normalize_youtube_video(item))

    return _rank_music(_apply_album_artwork(tracks, term), term, limit)


def _is_track_result(video: dict) -> bool:
    """Reject YouTube visual/editorial content from the music catalogue."""
    snippet = video.get("snippet") or {}
    text = " ".join((
        str(snippet.get("title") or ""),
        str(snippet.get("description") or ""),
        str(snippet.get("channelTitle") or ""),
    ))
    return not _NON_TRACK_PATTERN.search(text)


def _get_lyrics(artist: str, title: str, album: str = "", duration: int = 0) -> dict:
    """Fetch free lyrics server-side so provider failures never reach the UI."""
    cache_key = f"{artist.casefold()}::{title.casefold()}::{duration}"
    now = time.time()
    with _cache_lock:
        cached = _lyrics_cache.get(cache_key)
        if cached and cached["exp"] > now:
            return cached["value"]

    result = {"plain": "", "synced": "", "source": ""}
    try:
        params = {"track_name": title, "artist_name": artist}
        if album:
            params["album_name"] = album
        if duration > 0:
            params["duration"] = duration
        response = _http.get(
            "https://lrclib.net/api/get",
            params=params,
            headers={"Lrclib-Client": "NexSon/2.0"},
            timeout=6,
        )
        if response.ok:
            data = response.json()
            result = {
                "plain": data.get("plainLyrics") or "",
                "synced": data.get("syncedLyrics") or "",
                "source": "LRCLIB",
            }
    except req_lib.RequestException:
        pass

    if not (result["plain"] or result["synced"]):
        try:
            response = _http.get(
                f"https://api.lyrics.ovh/v1/{quote(artist, safe='')}/{quote(title, safe='')}",
                timeout=6,
            )
            if response.ok:
                data = response.json()
                if data.get("lyrics"):
                    result = {"plain": data["lyrics"], "synced": "", "source": "Lyrics.ovh"}
        except req_lib.RequestException:
            pass

    with _cache_lock:
        _lyrics_cache[cache_key] = {"value": result, "exp": now + LYRICS_CACHE_TTL}
    return result


def _get_youtube_video_api(video_id: str):
    data = _youtube_api_get(
        "videos",
        {
            "part": "snippet,contentDetails,statistics",
            "id": video_id,
            "maxResults": 1,
        },
    )
    items = data.get("items", [])
    if not items:
        return None
    return _normalize_youtube_video(items[0])


def _search_ytdlp(term: str, limit: int) -> list:
    ydl_opts = _with_youtube_cookies({
        "quiet": True,
        "no_warnings": True,
        "extract_flat": True,
        "ignoreerrors": True,
    })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        candidate_limit = min(max(limit * 4, 20), 50)
        info = ydl.extract_info(f"ytsearch{candidate_limit}:{term}", download=False)

    tracks = []
    for entry in (info or {}).get("entries", []):
        if not entry:
            continue

        video_id = entry.get("id") or entry.get("videoId")
        if not video_id:
            continue

        title = entry.get("title", "Inconnu")
        channel = entry.get("uploader") or entry.get("channel") or ""
        if _NON_TRACK_PATTERN.search(f"{title} {channel}"):
            continue

        tracks.append({
            "trackId": f"yt_{video_id}",
            "trackName": title,
            "artistName": channel or "Artiste inconnu",
            "collectionName": "",
            "collectionId": "",
            "artworkUrl": f"https://i.ytimg.com/vi/{video_id}/hqdefault.jpg",
            "artworkSmall": f"https://i.ytimg.com/vi/{video_id}/default.jpg",
            "ytVideoId": video_id,
            "duration": int(entry.get("duration") or 0),
            "viewCount": int(entry.get("view_count") or 0),
            "genre": "Music",
            "releaseDate": "",
            "trackNumber": 1,
            "artistId": entry.get("channel_id") or "",
            "source": "youtube-ytdlp",
            "explicit": False,
            "streamEndpoint": f"/tracks/{video_id}/stream",
            "videoEndpoint": f"/tracks/{video_id}/video",
        })

    return _rank_music(_apply_album_artwork(tracks, term), term, limit)


def _audio_quality_score(format_info: dict) -> tuple:
    """Classe les flux audio par qualité réelle, puis compatibilité web."""
    codec = (format_info.get("acodec") or "").lower()
    extension = (format_info.get("ext") or "").lower()
    # Le débit est le premier critère. À débit égal, le taux d'échantillonnage
    # puis Opus/AAC (tous deux lus nativement par les navigateurs récents)
    # permettent de départager les flux.
    bitrate = format_info.get("abr") or format_info.get("tbr") or 0
    sample_rate = format_info.get("asr") or 0
    web_codec = int("opus" in codec or "mp4a" in codec or "aac" in codec)
    web_container = int(extension in {"webm", "m4a", "mp4"})
    return bitrate, sample_rate, web_codec, web_container


def _best_audio_url(info: dict, quality: str = "very-high") -> str:
    """Extrait une piste audio selon le niveau demandé, sans suréchantillonnage."""
    formats = [
        format_info for format_info in info.get("formats", [])
        if format_info.get("vcodec") == "none" and format_info.get("url")
    ]
    if not formats:
        return info.get("url", "")
    targets = {"low": 64, "normal": 128, "high": 160}
    target = targets.get(quality)
    if target:
        under_target = [
            format_info for format_info in formats
            if (format_info.get("abr") or format_info.get("tbr") or 0) <= target
        ]
        if under_target:
            return max(under_target, key=_audio_quality_score)["url"]
        return min(
            formats,
            key=lambda format_info: abs((format_info.get("abr") or format_info.get("tbr") or 0) - target),
        )["url"]
    return max(formats, key=_audio_quality_score)["url"]


def _video_quality_score(format_info: dict) -> tuple:
    """Privilégie un clip progressif lisible directement dans le navigateur."""
    extension = (format_info.get("ext") or "").lower()
    height = min(int(format_info.get("height") or 0), 720)
    return (
        height,
        format_info.get("fps") or 0,
        format_info.get("tbr") or 0,
        int(extension in {"mp4", "webm"}),
    )


def _best_video_url(info: dict) -> str:
    """Extrait une vidéo avec sa piste audio, limitée à 720p pour le web."""
    formats = [
        format_info for format_info in info.get("formats", [])
        if (
            format_info.get("vcodec") not in {None, "none"}
            and format_info.get("acodec") not in {None, "none"}
            and format_info.get("url")
            and (format_info.get("height") or 0) <= 720
        )
    ]
    if not formats:
        return ""
    return max(formats, key=_video_quality_score)["url"]


def _resolve_stream_url(video_id: str, quality: str = "very-high") -> str:
    """Retourne l'URL directe de la meilleure piste audio disponible (cache 1h)."""
    now = time.time()

    with _cache_lock:
        entry = _url_cache.get(f"audio:{quality}:{video_id}")
        if entry and entry["exp"] > now:
            return entry["url"]

    ydl_opts = _with_youtube_cookies({
        # Ne pas imposer M4A : sur YouTube, Opus/WebM offre fréquemment un
        # débit plus élevé. La sélection finale ci-dessous compare tous les
        # formats audio réellement retournés par l'extracteur.
        "format": "bestaudio/best",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "noplaylist": True,
        # With authenticated cookies, yt-dlp's tv_downgraded client can be
        # rejected by YouTube with "The page needs to be reloaded". Prefer
        # the maintained web clients instead.
        "extractor_args": {
            "youtube": {"player_client": ["default", "web_embedded"]},
        },
    })

    url = ""
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False,
        )

        url = _best_audio_url(info, quality)

    if url:
        with _cache_lock:
            _url_cache[f"audio:{quality}:{video_id}"] = {
                "url": url,
                "exp": now + CACHE_TTL,
            }

    return url


def _resolve_video_url(video_id: str) -> str:
    """Retourne un clip avec audio intégré, lisible dans l'élément video."""
    now = time.time()
    cache_key = f"video:{video_id}"

    with _cache_lock:
        entry = _url_cache.get(cache_key)
        if entry and entry["exp"] > now:
            return entry["url"]

    ydl_opts = _with_youtube_cookies({
        # Les formats adaptatifs vidéo seuls ne contiennent pas de son. On
        # sélectionne donc un format progressif, jusqu'à 720p, qui rassemble
        # image et audio dans un seul flux lisible par le navigateur.
        "format": "best[acodec!=none][vcodec!=none][height<=720][ext=mp4]/best[acodec!=none][vcodec!=none][height<=720]",
        "quiet": True,
        "no_warnings": True,
        "extract_flat": False,
        "noplaylist": True,
        "extractor_args": {
            "youtube": {"player_client": ["default", "web_embedded"]},
        },
    })

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f"https://www.youtube.com/watch?v={video_id}",
            download=False,
        )
        url = _best_video_url(info)

    if url:
        with _cache_lock:
            _url_cache[cache_key] = {"url": url, "exp": now + CACHE_TTL}

    return url


def _proxy_stream(video_id: str, media_kind: str = "audio"):
    if not video_id:
        return jsonify({"error": "Paramètre id manquant"}), 400

    try:
        quality = request.args.get("quality", "very-high").strip().lower()
        if quality not in {"low", "normal", "high", "very-high"}:
            quality = "very-high"
        media_url = _resolve_video_url(video_id) if media_kind == "video" else _resolve_stream_url(video_id, quality)
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

        upstream = _http.get(
            media_url,
            headers=forward_headers,
            stream=True,
            timeout=30,
        )
        upstream.raise_for_status()

        response_headers = {
            "Content-Type": upstream.headers.get(
                "Content-Type", "video/mp4" if media_kind == "video" else "audio/webm"
            ),
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
        # This is usually a YouTube anti-bot challenge.  A 503 describes the
        # temporary upstream requirement more accurately than a generic 500.
        if "Sign in to confirm you\u2019re not a bot" in str(exc) or "Sign in to confirm you're not a bot" in str(exc):
            return jsonify({
                "error": "YouTube exige une authentification serveur pour lire ce flux",
                "code": "YOUTUBE_AUTH_REQUIRED",
            }), 503
        return jsonify({"error": str(exc)}), 500


@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "service": "NexSon Music Service",
        "youtubeDataApi": bool(YOUTUBE_API_KEY),
        "youtubeCookieFileConfigured": bool(YOUTUBE_COOKIEFILE and os.path.isfile(YOUTUBE_COOKIEFILE)),
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

    cache_key = f"search:v2:{term.casefold()}:{limit}"
    now = time.time()
    with _cache_lock:
        cached = _url_cache.get(cache_key)
        if cached and cached["exp"] > now:
            response = jsonify(cached["value"])
            response.headers["Cache-Control"] = "public, max-age=300"
            return response

    if YOUTUBE_API_KEY:
        try:
            tracks = _search_youtube_api(term, limit)
            if tracks:
                with _cache_lock:
                    _url_cache[cache_key] = {"value": tracks, "exp": now + SEARCH_CACHE_TTL}
                response = jsonify(tracks)
                response.headers["Cache-Control"] = "public, max-age=300"
                return response
        except Exception as exc:
            print(f"[NexSon] YouTube Data API search failed: {exc}")

    try:
        tracks = _search_ytdlp(term, limit)
        with _cache_lock:
            _url_cache[cache_key] = {"value": tracks, "exp": now + SEARCH_CACHE_TTL}
        response = jsonify(tracks)
        response.headers["Cache-Control"] = "public, max-age=300"
        return response
    except Exception as exc:
        traceback.print_exc()
        return jsonify({"error": str(exc)}), 500


@app.route("/lyrics")
def lyrics():
    artist = request.args.get("artist", "").strip()
    title = request.args.get("title", "").strip()
    album = request.args.get("album", "").strip()
    try:
        duration = max(0, int(request.args.get("duration", "0")))
    except ValueError:
        duration = 0
    if not artist or not title:
        return jsonify({"plain": "", "synced": "", "source": ""})
    return jsonify(_get_lyrics(artist, title, album, duration))


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


@app.route("/tracks/<video_id>/video")
def track_video(video_id):
    clean_id = video_id.replace("yt_", "", 1).strip()
    return _proxy_stream(clean_id, media_kind="video")


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
