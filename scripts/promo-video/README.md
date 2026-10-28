# Promo video pipeline (real screens, not generated)

Version 1 (57 s, 1080×1920, 5 scenes) was made with these scripts on 2026-10-28.
Everything shown is the **live site** filmed in a real browser — no mocked or AI-drawn UI.

## How it works

1. `record.cjs` — Playwright (Chromium) opens the live site at a phone viewport (430×932, device scale 2)
   and drives each scene like a user (typing, sliders, taps, smooth scrolling). Frames are captured with the
   Chrome DevTools screencast (`Page.startScreencast`, 860×1864 JPEG) with their real timestamps, so the
   video is sharp. Each scene writes `promo-out/frames/<scene>.txt` (ffmpeg concat list with true frame
   durations) and `<scene>.json` (time marks, e.g. when the AI answer appeared — used to cut waiting time).
   Convert each scene to mp4:
   `ffmpeg -f concat -safe 0 -i promo-out/frames/<scene>.txt -vf "fps=30,format=yuv420p" -c:v libx264 -crf 18 promo-out/frames/<scene>.mp4`
2. `layers.cjs` — renders the backgrounds (navy brand gradient, LeaderMed logo, Georgian headline per scene,
   scene counter) and the intro/outro cards with Noto Sans Georgian.
3. `bezel.py` — draws the phone frame overlay with a transparent rounded screen.
4. `assemble.py` — cuts and speeds each scene (`cuts` table: source start, end, speed), places the
   recording inside the phone, adds intro/outro with a slow zoom, joins everything with 0.4 s cross-fades
   and writes `promo-out/gmai-promo.mp4` (H.264, faststart).
5. Subtitles: an `.srt` file whose cue times follow the scene boundaries (see `subtitles-v1.ka_GE.srt`).
   Keep the `.ka_GE` suffix so Facebook knows the language.

Order: `node scripts/promo-video/record.cjs` → convert scenes → `node scripts/promo-video/layers.cjs`
→ `python3 scripts/promo-video/bezel.py` → `python3 scripts/promo-video/assemble.py`.
Requirements: Node 22, Playwright Chromium, Python 3 with Pillow, ffmpeg.

## Rules for any new version

- Film the real live site only. Never fake a screen, an answer or a number.
- Georgian headlines and subtitles; keep the brand look (navy `#102638`, cyan `#08C6FF`, logo top-left).
- Every on-screen word must be legible on a phone: check frames at several timestamps before delivering.
- AI waiting time is cut, never the answer itself; the answer text must stay readable for ≥ 2 s.
- No copyrighted music in the file (the owner adds music from the Facebook / Instagram library).
- Do not show personal data; use invented demo values only.
- Output is git-ignored (`promo-out/`); deliver the mp4 and the srt to the owner, do not commit them.
