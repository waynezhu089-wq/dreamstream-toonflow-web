# Dream Stream Toonflow Web v1.1.8 Baseline

This branch is the controlled frontend starting point for the Dream Stream video factory.

## Source baseline

- Upstream repository: `HBAI-Ltd/Toonflow-web`
- Candidate source commit: `8df658a07f4bf5d9c7b83d2365c6a01c6af0bf6a`
- Upstream commit time: 2026-06-08 12:03:34 UTC
- Immediately-following Toonflow-app commit: `edba9e45ae02d4980c0909793b509ee48000619e` ("更新web", 2026-06-08 12:04:46 UTC)
- Toonflow-app v1.1.8 source commit: `cd3e7c4e83963bea255be2e621eb78d2cd1c2188`

## Installed-bundle fingerprint

The user's installed Toonflow 1.1.8 frontend bundle was compared with the official
`HBAI-Ltd/Toonflow-app@v1.1.8:data/web/index.html`.

They match exactly by Git blob SHA:

`b71d6c2a1e25c6fa66e25ca1ca746a3fcf3f4682`

Local installed file facts:
- byte size: `26880189`
- SHA-256: `28d92b1d26e8aea43e2dae52064124ced2a3def810d35651225e8d96995d9538`

## Verification gate

Before modifying frontend behavior:

1. Install dependencies strictly from the committed lockfile.
2. Build the candidate source commit.
3. Compare the produced single-file frontend bundle to the installed/official v1.1.8 fingerprint above.
4. Map project creation/type selection, routing, script/novel navigation, ProductionAgent entry, workbench/editor pages, and relevant API/socket calls.
5. Do not call production APIs, model providers, media generation services, or expose secrets.
6. Do not modify business behavior during this gate.

## First product direction

After the baseline is verified, preserve the existing `novel` and `script` routes and
add the minimum frontend path for:

- `projectType = general_video`
- first profile: `advertisement`

The first acceptance target remains one real ~30-second advertisement/brand short video.
