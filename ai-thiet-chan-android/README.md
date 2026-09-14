# A.I Thiệt Chẩn — Android Native Shell

Phase 1 native Android wrapper for the existing A.I Thiệt Chẩn production flow.

Scope is intentionally locked to: fullscreen/immersive Android shell, overlay blocking on Android 12+, camera permission/file chooser bridge, resilient WebView loading, and the existing Camera → QC → AI → result → chatbot/report web flow.

## Build

The isolated GitHub Actions workflow builds `app-debug.apk`, runs Android lint, generates SHA-256, and uploads artifact `ai-thiet-chan-debug-apk`.

## Runtime

Trusted production origin:

`https://a-i-thiet-chan-v1-o2gk7z.v2.appdeploy.ai/`

Security/runtime rules:
- Android 12+: `HIDE_OVERLAY_WINDOWS` + `setHideOverlayWindows(true)`.
- Fullscreen immersive mode is restored when window focus returns.
- Camera permission is granted only to the trusted production origin and only for video capture.
- External URLs leave the WebView and open in a system handler.
- Cleartext HTTP is disabled.
- Camera/file chooser and network failure paths return safely without crashing.
