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
sys.modules.setdefault("ytmusicapi", types.SimpleNamespace(YTMusic=object))
sys.modules.setdefault("dotenv", types.SimpleNamespace(load_dotenv=lambda: None))

from music_service import _apply_album_artwork, _best_ytmusic_thumbnail, _handle_matches_query, _is_preferred_audio_result, _is_track_result, _is_youtube_video_id, _normalise_ytmusic_song, _parse_view_count, _rank_music, _search_catalogue


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

    def test_long_videos_are_excluded_from_music_results(self):
        results = _rank_music([
            track("film", "Artist documentary", "Artist", duration=1_244),
            track("song", "Artist - Song", "Artist", duration=240),
        ], "Artist", 5)
        self.assertEqual([item["ytVideoId"] for item in results], ["song"])

    def test_official_clip_is_kept_and_reaction_is_removed(self):
        official_clip = {"snippet": {"title": "Artist - Song (Official Music Video)", "channelTitle": "Artist"}}
        reaction = {"snippet": {"title": "Artist - Song reaction", "channelTitle": "Viewer"}}
        self.assertTrue(_is_track_result(official_clip))
        self.assertFalse(_is_track_result(reaction))

    def test_ytdlp_fallback_excludes_music_video_versions(self):
        self.assertFalse(_is_preferred_audio_result("Artist - Song (Official Music Video)", "Artist"))
        self.assertFalse(_is_preferred_audio_result("Artist - Song (Clip officiel)", "Artist"))
        self.assertTrue(_is_preferred_audio_result("Artist - Song (Official Audio)", "Artist"))

    def test_ytdlp_fallback_rejects_channel_ids_disguised_as_videos(self):
        self.assertFalse(_is_youtube_video_id("UCVkQ-P3Oh2cH7SYX104U8OQ"))
        self.assertFalse(_is_youtube_video_id("PL123456789012345678901234567890"))
        self.assertTrue(_is_youtube_video_id("qJZy8zy0Uy0"))

    def test_artist_search_prioritizes_their_topic_channel(self):
        results = _rank_music([
            track("fan", "PNL best mix", "Fan Music", viewCount=2_000_000),
            track("topic", "Au DD", "PNL - Topic", viewCount=30_000_000),
        ], "PNL", 5)
        self.assertEqual(results[0]["ytVideoId"], "topic")

    def test_official_handle_matches_artist_query(self):
        self.assertTrue(_handle_matches_query("@pnl", "PNL"))
        self.assertFalse(_handle_matches_query("@pnlfan", "PNL"))

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

    def test_ytmusic_song_preserves_the_existing_track_contract(self):
        result = _normalise_ytmusic_song({
            "videoId": "abc123",
            "title": "Song",
            "artists": [{"name": "Artist", "id": "artist-id"}],
            "album": {"name": "Album", "id": "album-id"},
            "duration_seconds": 210,
            "thumbnails": [
                {"url": "https://image.example/small.jpg", "width": 60},
                {"url": "https://image.example/large.jpg", "width": 544},
            ],
            "isExplicit": True,
        })
        self.assertEqual(result["trackId"], "yt_abc123")
        self.assertEqual(result["ytVideoId"], "abc123")
        self.assertEqual(result["artistName"], "Artist")
        self.assertEqual(result["artworkUrl"], "https://image.example/large.jpg")
        self.assertEqual(result["artworkSmall"], "https://image.example/small.jpg")
        self.assertEqual(result["streamEndpoint"], "/tracks/abc123/stream")
        self.assertEqual(result["source"], "ytmusicapi")
        self.assertTrue(result["explicit"])

    def test_ytmusic_prefers_a_square_album_thumbnail_over_a_wide_video_still(self):
        thumbnails = [
            {"url": "https://image.example/video.jpg", "width": 1280, "height": 720},
            {"url": "https://image.example/cover-small.jpg", "width": 120, "height": 120},
            {"url": "https://image.example/cover-large.jpg", "width": 600, "height": 600},
        ]
        self.assertEqual(_best_ytmusic_thumbnail(thumbnails, "abc123"), "https://image.example/cover-large.jpg")
        self.assertEqual(_best_ytmusic_thumbnail(thumbnails, "abc123", small=True), "https://image.example/cover-small.jpg")

    def test_ytmusic_human_readable_view_counts_are_safe_for_ranking(self):
        self.assertEqual(_parse_view_count("1.4M views"), 1_400_000)
        self.assertEqual(_parse_view_count("22K"), 22_000)
        self.assertEqual(_parse_view_count(None), 0)

    def test_empty_ytmusic_response_uses_ytdlp_fallback(self):
        expected = [track("fallback", "Song", "Artist")]
        with patch("music_service._search_ytmusic", return_value=[]), patch(
            "music_service._search_ytdlp", return_value=expected
        ) as fallback:
            self.assertEqual(_search_catalogue("Artist - Song", 5), expected)
        fallback.assert_called_once_with("Artist - Song", 5)


if __name__ == "__main__":
    unittest.main()
