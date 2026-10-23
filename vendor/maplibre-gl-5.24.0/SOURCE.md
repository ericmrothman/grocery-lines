# MapLibre GL JS 5.24.0 (vendored)

- Source: https://registry.npmjs.org/maplibre-gl/-/maplibre-gl-5.24.0.tgz
- npm integrity (verified on download, 2026-10-06): sha512-ALyFxgtd5R+65UqZ/++lOqwWcC0SNho9c27fYSyLmG7AfnAul2o46F05aDJGPbFU57wos9dgcIySHs0Xe6ia3A==
- Licence: BSD-3-Clause, see `LICENSE.txt`.
- Files (sha256):
  - `maplibre-gl.js (package/dist, unchanged)` 45a9b07a9189ce56054c620a947ccf41e291e58c95e9b61533b740aaa65ee5cb
  - `maplibre-gl.css (package/dist, unchanged)` ab1e70d59ec40465bae7e7030da2f3ccf28133fd502e62bd598eefbadfd7a732
  - `LICENSE.txt` ee5fc05a0677eaf69601d2c7db0d9ecd6cc27c3abc1d0733bc9ed34707cf8ef2

Loaded with a classic script tag before the app module, so `src/ui/map.js` reads the `maplibregl` global; nothing else in the app touches it. Replaced Leaflet 1.9.4 in step DEF-016. Outside the DEF-008 app bundle budget.
