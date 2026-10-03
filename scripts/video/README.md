# MealMint walkthrough renderer

The 58-second edited demo uses actual hosted UI screenshots from a successful
Codex `gpt-6-luna` / `max` flow with synthetic food data. It is a motion walkthrough,
not uninterrupted screen recording. No Telegram conversation is portrayed.

Run locally with Python 3, Pillow, system DejaVu fonts and FFmpeg:

```sh
python3 scripts/video/render.py --preview
python3 scripts/video/render.py
ffprobe -v error -show_streams -show_format .local/hosting/video/mealmint-demo.mp4
```

Capture files are intentionally excluded from the public repo. Expected files in
`.local/hosting/demo/`: `01-start.png`, `02-request.png`, `03-shortlist.png`,
`03-selected.png`, `04-approval.png`, `05-result.png`, `06-directives.png`.
Capture only after sign-in, using the browser control tools; never include tokens,
real account details or unrelated tabs. Remove fictional filming preferences.

`scenes.json` defines timing, captions, zoom focus and cursor paths. Cursor points
are screenshot pixels, measured against the actual 1276×718 captures; recapture
at other dimensions requires new points. Outputs are ignored MP4, poster and
contact sheet under `.local/hosting/video/`. Frames stream to FFmpeg without
storing thousands of intermediate images. Render on the desktop, not the small VM.

Publish reviewed `index.html`, `poster.jpg` and `mealmint-demo.mp4` under
`/srv/mealmint-public/demo/`, using the route in `deploy/mealmint.caddy`.
Verify anonymous HTTPS, `video/mp4`, HTTP range 206 and browser playback before
updating the application packet. The private app and runtime state must remain
behind the owner token.
