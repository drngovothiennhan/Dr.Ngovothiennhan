# A.I Thiệt Chẩn — Android Native Shell

Phase 1 native Android wrapper for the existing A.I Thiệt Chẩn production flow.

Scope is intentionally locked to: fullscreen/immersive Android shell, overlay blocking on Android 12+, camera permission/file chooser bridge, resilient WebView loading, and the existing Camera → QC → AI → result → chatbot/report web flow.

## Build

Open this repository in Android Studio or run the included GitHub Actions workflow. The workflow builds `app-debug.apk` and publishes it as the `ai-thiet-chan-debug-apk` artifact.

## Runtime

The native shell loads the current production backend at:

`https://a-i-thiet-chan-v1-o2gk7z.v2.appdeploy.ai/`

External links are opened outside the app; camera permission is only granted to the trusted production origin.
