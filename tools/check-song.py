"""Bounded browser checks for the real Khushti song experience.

This runner deliberately reads the generated ``public/data/song.json`` and
uses the shipped MP3. It does not substitute fixture lyrics or relax Chrome's
normal autoplay policy.
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from pathlib import Path
from typing import Any, Callable

from playwright.sync_api import Browser, Page, sync_playwright


ROOT = Path(__file__).resolve().parent.parent
SONG_PATH = ROOT / "public/data/song.json"
AUDIO_PATH = ROOT / "public/media/khushti.mp3"
DEFAULT_OUT = ROOT / "test-results/song/checks"


parser = argparse.ArgumentParser()
parser.add_argument("--url", default="http://127.0.0.1:4317/")
parser.add_argument("--chromium", default="/usr/bin/google-chrome-stable")
parser.add_argument("--output", default=str(DEFAULT_OUT))
args = parser.parse_args()

OUT = Path(args.output)
OUT.mkdir(parents=True, exist_ok=True)
results: list[dict[str, Any]] = []
page_errors: list[dict[str, str]] = []
responses: list[dict[str, Any]] = []


def check(condition: Any, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def record(name: str, fn: Callable[[], Any]) -> None:
    started = time.monotonic()
    try:
        detail = fn()
        results.append(
            {
                "name": name,
                "passed": True,
                "seconds": round(time.monotonic() - started, 2),
                "detail": detail,
            }
        )
        print(f"PASS {name}", flush=True)
    except Exception as error:  # Continue so one failure does not hide the rest.
        results.append(
            {
                "name": name,
                "passed": False,
                "seconds": round(time.monotonic() - started, 2),
                "error": str(error),
            }
        )
        print(f"FAIL {name}: {error}", flush=True)


def write_report(extra: dict[str, Any] | None = None) -> dict[str, Any]:
    report: dict[str, Any] = {
        "test_mode": (
            "Live Vite app, generated song.json, shipped MP3, Google Chrome, "
            "and the browser's normal autoplay policy. No fixture lyrics and "
            "no autoplay-policy override."
        ),
        "url": args.url,
        "song_json": str(SONG_PATH),
        "audio": str(AUDIO_PATH),
        "results": results,
        "page_errors": page_errors,
        "media_responses": responses,
        "passed": sum(bool(result["passed"]) for result in results),
        "failed": sum(not result["passed"] for result in results),
    }
    if extra:
        report.update(extra)
    (OUT / "report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n")
    return report


missing = [str(path) for path in (SONG_PATH, AUDIO_PATH) if not path.is_file()]
if missing:
    results.append(
        {
            "name": "Real song assets are present",
            "passed": False,
            "error": "Missing: " + ", ".join(missing),
        }
    )
    report = write_report({"blocked": True})
    print(json.dumps({"blocked": True, "missing": missing, "report": str(OUT / "report.json")}), flush=True)
    sys.exit(2)

song = json.loads(SONG_PATH.read_text())
check(isinstance(song.get("phrases"), list) and song["phrases"], "song.json has no timed phrases")
check(isinstance(song.get("commentsById"), dict) and song["commentsById"], "song.json has no original comments")
check(AUDIO_PATH.stat().st_size > 0, "The shipped MP3 is empty")


def phrase_at(seconds: float) -> int:
    found = -1
    for index, phrase in enumerate(song["phrases"]):
        if float(phrase["start"]) <= seconds:
            found = index
        else:
            break
    return found


def choose_timed_comment_word() -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for phrase_index, phrase in enumerate(song["phrases"]):
        for word_index, word in enumerate(phrase.get("words", [])):
            start, end = float(word["start"]), float(word["end"])
            midpoint = (start + end) / 2
            matches = word.get("matches") or []
            if word.get("source") == "comment" and matches and end > start and phrase_at(midpoint) == phrase_index:
                candidates.append(
                    {
                        "phrase_index": phrase_index,
                        "word_index": word_index,
                        "word": word,
                        "midpoint": midpoint,
                        "match": matches[0],
                    }
                )
    check(candidates, "No timed source word can be checked")
    return candidates[len(candidates) // 2]


def choose_added_word() -> dict[str, Any]:
    candidates: list[dict[str, Any]] = []
    for phrase_index, phrase in enumerate(song["phrases"]):
        for word_index, word in enumerate(phrase.get("words", [])):
            start, end = float(word["start"]), float(word["end"])
            if word.get("source") != "comment" and start > 0.3 and end > start:
                candidates.append(
                    {
                        "phrase_index": phrase_index,
                        "word_index": word_index,
                        "word": word,
                        "before": max(0.0, start - 0.2),
                        "midpoint": (start + end) / 2,
                    }
                )
    check(candidates, "No timed added word can be checked")
    return candidates[len(candidates) // 2]


timed_target = choose_timed_comment_word()
added_target = choose_added_word()


def clock_label(seconds: float) -> str:
    value = max(0, int(seconds))
    return f"{value // 60}:{value % 60:02d}"


def watch(page: Page, label: str) -> None:
    page.on("pageerror", lambda error: page_errors.append({"page": label, "error": str(error)}))

    def capture(response: Any) -> None:
        if response.url.endswith("/data/song.json") or "/media/khushti.mp3" in response.url:
            responses.append({"page": label, "url": response.url, "status": response.status})

    page.on("response", capture)


def load_page(
    browser: Browser,
    label: str,
    *,
    width: int = 1440,
    height: int = 900,
    mobile: bool = False,
    sample: bool = False,
) -> Page:
    context = browser.new_context(
        viewport={"width": width, "height": height},
        device_scale_factor=1,
        has_touch=mobile,
        is_mobile=mobile,
        reduced_motion="no-preference",
    )
    page = context.new_page()
    page.set_default_timeout(12_000)
    watch(page, label)
    query = "?debug&renderer=canvas" + ("&demo=1" if sample else "")
    page.goto(args.url.rstrip("/") + "/" + query, wait_until="domcontentloaded")
    page.wait_for_function("window.__sky?.snapshot().ready", timeout=60_000)
    return page


def wait_for_real_song(page: Page) -> None:
    page.wait_for_function("window.__sky?.snapshot().song.available", timeout=20_000)
    page.wait_for_function("__sky.snapshot().phase === 'gate'", timeout=20_000)


def enter_and_finish(page: Page, *, sound: bool = False) -> None:
    page.locator("#enter-sound" if sound else "#enter-silent").click()
    page.wait_for_function("__sky.snapshot().phase === 'birth'")
    page.evaluate("__sky.finish()")
    page.wait_for_function("__sky.snapshot().birth === 1")
    page.wait_for_function("!document.querySelector('#song-radar').hidden")


def open_song(page: Page) -> None:
    page.locator("#song-radar").click()
    page.wait_for_function("__sky.snapshot().song.active && __sky.snapshot().song.gathering")
    page.wait_for_function("__sky.snapshot().song.active && !__sky.snapshot().song.gathering", timeout=8_000)


def seek(page: Page, seconds: float) -> None:
    page.locator("#song-seek").evaluate(
        "(element, value) => { element.value = String(value); "
        "element.dispatchEvent(new Event('input', {bubbles: true})); }",
        seconds,
    )
    page.wait_for_timeout(80)


def pause(page: Page) -> float:
    if not page.evaluate("__sky.snapshot().song.paused"):
        page.locator("#song-play").click()
        page.wait_for_function("__sky.snapshot().song.paused")
    return float(page.evaluate("__sky.snapshot().song.time"))


def overflow_metrics(page: Page) -> dict[str, Any]:
    return page.evaluate(
        """() => {
          const selectors = ['html','body','#song-scene','.song-header','.song-scroll','.song-lines','.song-footer','.song-transport'];
          const viewport = {width: innerWidth, height: innerHeight};
          const elements = Object.fromEntries(selectors.map(selector => {
            const element = document.querySelector(selector);
            const box = element.getBoundingClientRect();
            return [selector, {
              left: box.left, right: box.right, width: box.width,
              clientWidth: element.clientWidth, scrollWidth: element.scrollWidth
            }];
          }));
          return {viewport, elements, documentWidth: document.documentElement.scrollWidth};
        }"""
    )


def assert_no_horizontal_overflow(metrics: dict[str, Any]) -> None:
    width = metrics["viewport"]["width"]
    check(metrics["documentWidth"] <= width + 1, f"Document width {metrics['documentWidth']} exceeds viewport {width}")
    for selector, values in metrics["elements"].items():
        check(values["left"] >= -1, f"{selector} starts outside the viewport: {values}")
        check(values["right"] <= width + 1, f"{selector} ends outside the viewport: {values}")
        check(values["scrollWidth"] <= values["clientWidth"] + 1, f"{selector} has horizontal overflow: {values}")


with sync_playwright() as playwright:
    # Deliberately omit --autoplay-policy and all related bypasses.
    browser = playwright.chromium.launch(
        executable_path=args.chromium,
        headless=True,
        args=[
            "--no-sandbox",
            "--disable-dev-shm-usage",
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
        ],
    )

    page = load_page(browser, "desktop")
    wait_for_real_song(page)

    def radar_lifecycle() -> dict[str, Any]:
        gate = page.evaluate("__sky.snapshot()")
        check(page.locator("#song-radar").evaluate("element => element.hidden"), "Radar is exposed at the gate")
        page.locator("#enter-silent").click()
        page.wait_for_function("__sky.snapshot().phase === 'birth'")
        check(page.locator("#song-radar").evaluate("element => element.hidden"), "Radar is exposed during birth")
        page.evaluate("__sky.finish()")
        page.wait_for_function("__sky.snapshot().birth === 1")
        page.wait_for_function("!document.querySelector('#song-radar').hidden")
        ready = page.evaluate("__sky.snapshot()")
        check(not ready["audio"]["wanted"] and not ready["audio"]["enabled"], "Silent entry enabled the score")
        return {"gate_phase": gate["phase"], "ready_phase": ready["phase"], "song_available": ready["song"]["available"]}

    record("Radar stays absent at the gate and birth, then appears for the real archive", radar_lifecycle)

    def gathering_and_playback() -> dict[str, Any]:
        open_song(page)
        start = page.evaluate("__sky.snapshot().song")
        check(not start["paused"], "Song did not start after the radar gesture")
        page.wait_for_function("time => __sky.snapshot().song.time > time + 0.55", arg=start["time"], timeout=5_000)
        advanced = page.evaluate("__sky.snapshot().song")
        check(advanced["duration"] > 1, "Browser did not load real MP3 metadata")
        check(page.locator("#song-error").evaluate("element => element.hidden"), "Song reported a playback error")
        return {"from": round(start["time"], 3), "to": round(advanced["time"], 3), "duration": advanced["duration"]}

    record("Radar gathering hands off to an advancing real MP3 clock", gathering_and_playback)

    def transport() -> dict[str, Any]:
        stopped = pause(page)
        page.wait_for_timeout(550)
        stable = float(page.evaluate("__sky.snapshot().song.time"))
        check(abs(stable - stopped) < 0.12, f"Paused media clock advanced from {stopped} to {stable}")
        page.locator("#song-play").click()
        page.wait_for_function("time => !__sky.snapshot().song.paused && __sky.snapshot().song.time > time + 0.35", arg=stable, timeout=4_000)
        resumed = float(page.evaluate("__sky.snapshot().song.time"))
        pause(page)
        duration = float(page.evaluate("__sky.snapshot().song.duration"))
        seek(page, min(max(4.0, duration * 0.45), duration - 1.0))
        page.locator("#song-restart").click()
        page.wait_for_function("!__sky.snapshot().song.paused && __sky.snapshot().song.time < 1")
        replay_start = float(page.evaluate("__sky.snapshot().song.time"))
        page.wait_for_function("time => __sky.snapshot().song.time > time + 0.25", arg=replay_start, timeout=4_000)
        page.locator("#song-mute").click()
        muted = page.evaluate("__sky.snapshot().song.muted")
        check(muted and page.locator("#song-mute").get_attribute("aria-pressed") == "true", "Mute state did not synchronize")
        page.locator("#song-mute").click()
        check(not page.evaluate("__sky.snapshot().song.muted"), "Unmute failed")
        return {"paused_at": stopped, "resumed_at": resumed, "replay_started_at": replay_start}

    record("Pause, resume, replay, mute, and unmute follow the media element", transport)

    def real_timing_and_sources() -> dict[str, Any]:
        pause(page)
        midpoint = float(timed_target["midpoint"])
        seek(page, midpoint)
        phrase_index = timed_target["phrase_index"]
        word_index = timed_target["word_index"]
        word = page.locator(f'.song-line[data-phrase="{phrase_index}"] .song-word').nth(word_index)
        check(word.get_attribute("data-state") == "singing", "Provider-timed source word is not highlighted while singing")
        check(page.evaluate("__sky.snapshot().song.phrase") == phrase_at(midpoint), "Audio time selected the wrong phrase")
        current = page.locator(f'.song-line[data-phrase="{phrase_at(midpoint)}"]')
        check("is-current" in (current.get_attribute("class") or ""), "Current phrase class is missing")
        check(current.get_attribute("aria-current") == "true", "Current phrase is not exposed to assistive technology")
        displayed = page.locator("#song-time").evaluate("element => element.value")
        expected_label = clock_label(midpoint)
        check(displayed == expected_label, f"Displayed time {displayed!r} does not match {expected_label!r}")
        value_text = page.locator("#song-seek").get_attribute("aria-valuetext") or ""
        check(value_text.startswith(expected_label + " of "), f"Seek value text is stale: {value_text!r}")

        match = timed_target["match"]
        source_states = page.locator(
            f'.song-line[data-phrase="{phrase_index}"] .song-source[data-comment-id="{match["commentId"]}"] .source-word'
        ).evaluate_all("elements => elements.map(element => element.dataset.state)")
        check("singing" in source_states, "Original-source range did not highlight with its lyric word")

        quotes = page.locator(".song-source").evaluate_all(
            "elements => elements.map(element => ({id: element.dataset.commentId, text: element.querySelector('blockquote').textContent}))"
        )
        check(quotes, "No original source quotes were rendered")
        changed = [quote["id"] for quote in quotes if song["commentsById"].get(quote["id"], {}).get("text") != quote["text"]]
        check(not changed, "Rendered original quote text changed for: " + ", ".join(changed[:5]))
        return {
            "phrase": phrase_index,
            "word": timed_target["word"]["text"],
            "time": midpoint,
            "source_comment": match["commentId"],
            "quotes_checked": len(quotes),
        }

    record("Real provider timings drive lyric and exact-source highlighting", real_timing_and_sources)

    def added_word_reveal() -> dict[str, Any]:
        pause(page)
        phrase_index = added_target["phrase_index"]
        word_index = added_target["word_index"]
        word = page.locator(f'.song-line[data-phrase="{phrase_index}"] .song-word').nth(word_index)
        seek(page, float(added_target["before"]))
        page.wait_for_timeout(320)
        waiting_state = word.get_attribute("data-state")
        waiting_opacity = float(word.evaluate("element => getComputedStyle(element).opacity"))
        check(waiting_state == "waiting", f"Added word starts in {waiting_state!r}, not waiting")
        check(waiting_opacity < 0.08, f"Added word is visible before its time (opacity {waiting_opacity})")
        seek(page, float(added_target["midpoint"]))
        # Let the declared 240 ms opacity transition settle. Headless Chrome can
        # coalesce a frame while the lyric row scrolls to the newly sought line.
        page.wait_for_timeout(650)
        singing_state = word.get_attribute("data-state")
        singing_opacity = float(word.evaluate("element => getComputedStyle(element).opacity"))
        check(singing_state == "singing", f"Added word did not enter singing state: {singing_state!r}")
        check(singing_opacity > 0.9, f"Added word did not reveal (opacity {singing_opacity})")
        return {
            "phrase": phrase_index,
            "word": added_target["word"]["text"],
            "hidden_opacity": waiting_opacity,
            "revealed_opacity": singing_opacity,
        }

    record("Song-added words stay hidden until their real sung time", added_word_reveal)

    def hidden_page_pause() -> dict[str, Any]:
        pause(page)
        page.locator("#song-play").click()
        page.wait_for_function("!__sky.snapshot().song.paused")
        starting = float(page.evaluate("__sky.snapshot().song.time"))
        # Wait for play() and its status update to settle before emulating the
        # tab transition; otherwise this tests an artificial same-task race.
        page.wait_for_function("time => __sky.snapshot().song.time > time + 0.15", arg=starting, timeout=3_000)
        before = float(page.evaluate("__sky.snapshot().song.time"))
        # Headless Chrome keeps every tab visible. Override the read-only document
        # visibility values, then dispatch the same browser event to exercise the
        # production hidden-page listener against the real Audio element.
        page.evaluate(
            """() => {
              Object.defineProperty(document, 'hidden', {configurable: true, get: () => true});
              Object.defineProperty(document, 'visibilityState', {configurable: true, get: () => 'hidden'});
              document.dispatchEvent(new Event('visibilitychange'));
            }"""
        )
        page.wait_for_function("__sky.snapshot().song.paused")
        page.wait_for_timeout(350)
        after = float(page.evaluate("__sky.snapshot().song.time"))
        check(abs(after - before) < 0.2, f"Hidden song kept advancing from {before} to {after}")
        check("Paused" in page.locator("#song-status").text_content(), "Hidden-page pause status is missing")
        page.evaluate(
            """() => {
              delete document.hidden;
              delete document.visibilityState;
              document.dispatchEvent(new Event('visibilitychange'));
            }"""
        )
        return {"before": before, "after": after}

    record("A hidden-page visibility change pauses the song", hidden_page_pause)

    def desktop_overflow() -> dict[str, Any]:
        metrics = overflow_metrics(page)
        assert_no_horizontal_overflow(metrics)
        return metrics

    record("Desktop song scene has no horizontal overflow", desktop_overflow)

    def close_and_silent_consent() -> dict[str, Any]:
        page.locator("#song-close").click()
        page.wait_for_function("!__sky.snapshot().song.active")
        state = page.evaluate("__sky.snapshot()")
        check(state["song"]["paused"] and state["song"]["time"] == 0, "Close did not reset and pause the song")
        check(page.locator("#song-scene").evaluate("element => element.hidden"), "Closed song scene remains exposed")
        check(not page.locator("#song-radar").evaluate("element => element.hidden"), "Radar did not return after close")
        check(not state["audio"]["wanted"] and not state["audio"]["enabled"], "Silent score consent was not preserved")
        return {"song": state["song"], "score": state["audio"]}

    record("Close resets the song and preserves silent score consent", close_and_silent_consent)
    page.context.close()

    sound_page = load_page(browser, "sound-cancel")
    wait_for_real_song(sound_page)

    def close_during_gathering() -> dict[str, Any]:
        enter_and_finish(sound_page, sound=True)
        sound_page.wait_for_function("__sky.snapshot().audio.wanted && __sky.snapshot().audio.enabled", timeout=8_000)
        sound_page.locator("#song-radar").click()
        sound_page.wait_for_function("__sky.snapshot().song.active && __sky.snapshot().song.gathering")
        during = sound_page.evaluate("__sky.snapshot()")
        check(not during["audio"]["wanted"] and not during["audio"]["enabled"], "Score kept playing during gathering")
        sound_page.locator("#song-close").click()
        sound_page.wait_for_function("!__sky.snapshot().song.active")
        sound_page.wait_for_function("__sky.snapshot().audio.wanted && __sky.snapshot().audio.enabled", timeout=8_000)
        sound_page.wait_for_timeout(2_300)
        after = sound_page.evaluate("__sky.snapshot()")
        check(after["song"]["paused"], "A cancelled gather started the song later")
        check(after["song"]["time"] == 0, f"Cancelled song advanced to {after['song']['time']}")
        check(not after["song"]["active"] and not after["song"]["gathering"], "Cancelled song became active again")
        check(after["audio"]["wanted"] and after["audio"]["enabled"], "Opted-in score was not restored")
        return {"song_after_wait": after["song"], "score_restored": after["audio"]["enabled"]}

    record("Closing during gathering cannot start late audio and restores opted-in score", close_during_gathering)
    sound_page.context.close()

    sample_page = load_page(browser, "sample", sample=True)

    def sample_hides_radar() -> dict[str, Any]:
        sample_page.wait_for_function("__sky.snapshot().sample")
        sample_page.locator("#enter-silent").click()
        sample_page.wait_for_function("__sky.snapshot().phase === 'birth'")
        sample_page.evaluate("__sky.finish()")
        sample_page.wait_for_function("__sky.snapshot().birth === 1")
        sample_page.wait_for_timeout(250)
        state = sample_page.evaluate("__sky.snapshot()")
        check(state["sample"], "Demo page is not marked as sample data")
        check(not state["song"]["available"], "Song became available for sample comments")
        check(sample_page.locator("#song-radar").evaluate("element => element.hidden"), "Radar is visible in sample mode")
        return {"sample": state["sample"], "song_available": state["song"]["available"]}

    record("Sample mode never exposes the real-archive song radar", sample_hides_radar)
    sample_page.context.close()

    mobile_page = load_page(browser, "mobile", width=390, height=844, mobile=True)
    wait_for_real_song(mobile_page)
    enter_and_finish(mobile_page)
    open_song(mobile_page)
    pause(mobile_page)

    def mobile_overflow() -> dict[str, Any]:
        metrics = overflow_metrics(mobile_page)
        assert_no_horizontal_overflow(metrics)
        check(mobile_page.locator("#song-close").is_visible(), "Mobile close control is not visible")
        check(mobile_page.locator("#song-play").is_visible(), "Mobile play control is not visible")
        check(mobile_page.locator("#song-seek").bounding_box()["width"] > 40, "Mobile seek control collapsed")
        return metrics

    record("390px mobile song scene has no horizontal overflow", mobile_overflow)
    mobile_page.context.close()

    record(
        "Real song JSON and MP3 returned successfully",
        lambda: (
            check(any(item["url"].endswith("/data/song.json") and item["status"] == 200 for item in responses), "No successful song.json response"),
            check(any("/media/khushti.mp3" in item["url"] and 200 <= item["status"] < 300 for item in responses), "No successful MP3 response"),
            {"responses": responses},
        )[-1],
    )
    record(
        "No uncaught page errors",
        lambda: (check(not page_errors, json.dumps(page_errors, ensure_ascii=False)), {"errors": page_errors})[-1],
    )
    browser.close()


report = write_report(
    {
        "song": {
            "title": song.get("title"),
            "duration": song.get("duration"),
            "phrases": len(song["phrases"]),
            "source_comments": len(song["commentsById"]),
            "audio_bytes": AUDIO_PATH.stat().st_size,
        }
    }
)
print(json.dumps({"passed": report["passed"], "failed": report["failed"], "report": str(OUT / "report.json")}), flush=True)
sys.exit(1 if report["failed"] else 0)
