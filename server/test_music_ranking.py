import unittest
import sys
import types
from unittest.mock import patch


class _App:
    def route(self, *_args, **_kwargs):
        return lambda function: function


# Ranking is pure Python.  Stub web-only dependencies so this small regression
# suite can run in a minimal CI environment too.
sys.modules.setdefault("flask", types.SimpleNamespace(
    Flask=lambda *_args, **_kwargs: _App(),
    jsonify=lambda value: value,
    request=types.SimpleNamespace(),
    Response=object,
    stream_with_context=lambda function: function,
))
sys.modules.setdefault("flask_cors", types.SimpleNamespace(CORS=lambda *_args, **_kwargs: None))
sys.modules.setdefault("requests", types.SimpleNamespace(Session=lambda: object(), RequestException=Exception))
sys.modules.setdefault("yt_dlp", types.SimpleNamespace(YoutubeDL=object))
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda: None))

from music_service import _apply_album_artwork, _is_track_result, _rank_music


def track(video_id, title, channel, **extra):
    return {
        "ytVideoId": video_id,
        "trackId": f"yt_{video_id}",
        "trackName": title,
        "artistName": channel,
        "duration": 210,
        "viewCount": 0,
        **extra,
    }


class MusicRankingTests(unittest.TestCase):
    def test_exact_artist_and_title_beat_a_popular_loose_match(self):
        results = _rank_music([
            track("viral", "Blinding Lights lyrics", "Random Channel", viewCount=2_000_000_000),
            track("official", "The Weeknd - Blinding Lights (Official Audio)", "The Weeknd", viewCount=800_000_000),
        ], "The Weeknd - Blinding Lights", 5)
        self.assertEqual(results[0]["ytVideoId"], "official")

    def test_popularity_breaks_tie_without_hiding_alternatives(self):
        results = _rank_music([
            track("small", "Midnight City", "M83", viewCount=10_000),
            track("large", "Midnight City", "M83", viewCount=100_000_000),
        ], "M83 - Midnight City", 5)
        self.assertEqual([item["ytVideoId"] for item in results], ["large", "small"])

    def test_official_clip_is_kept_and_reaction_is_removed(self):
        official_clip = {"snippet": {"title": "Artist - Song (Official Music Video)", "channelTitle": "Artist"}}
        reaction = {"snippet": {"title": "Artist - Song reaction", "channelTitle": "Viewer"}}
        self.assertTrue(_is_track_result(official_clip))
        self.assertFalse(_is_track_result(reaction))

    def test_artist_search_prioritizes_their_topic_channel(self):
        results = _rank_music([
            track("fan", "PNL best mix", "Fan Music", viewCount=2_000_000),
            track("topic", "Au DD", "PNL - Topic", viewCount=30_000_000),
        ], "PNL", 5)
        self.assertEqual(results[0]["ytVideoId"], "topic")

    def test_exact_song_and_artist_use_album_artwork(self):
        song = track("cover", "The Weeknd - Blinding Lights (Official Audio)", "The Weeknd")
        metadata = [{
            "trackName": "Blinding Lights",
            "artistName": "The Weeknd",
            "collectionName": "After Hours",
            "collectionId": 123,
            "artworkUrl100": "https://cover.example/100x100bb.jpg",
        }]
        with patch("music_service._album_artwork_candidates", return_value=metadata):
            result = _apply_album_artwork([song], "The Weeknd - Blinding Lights")[0]
        self.assertEqual(result["artworkUrl"], "https://cover.example/600x600bb.jpg")
        self.assertEqual(result["collectionName"], "After Hours")
        self.assertEqual(result["videoArtworkUrl"], "")


if __name__ == "__main__":
    unittest.main()
