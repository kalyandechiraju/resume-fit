# Project contract

## Product

- Resume Fit is a Chrome extension only. Do not add a website, Next.js, React, a server, or a hosted application backend.
- `extension/` owns the complete product runtime. Build output is `extension/dist`.
- The extension locally parses one resume, captures or accepts one job description, and evaluates confirmed text with TypeSafe Jev through Vercel AI Gateway.
- It stores extracted resume text locally. It stores the current job and API key for the browser session. It never stores the source resume file.
- Do not claim a live TypeSafe request works until the unpacked extension is verified with a real key.

## Architecture

- Use plain strict TypeScript, native static HTML and CSS, and esbuild. Do not add React, Vite, Tailwind, a popup, or a framework.
- Keep the service worker in `extension/src/background.ts`. Register the top-level synchronous `chrome.action.onClicked` listener.
- Open the side panel with `chrome.sidePanel.open({ windowId: tab.windowId })` directly in that listener before any asynchronous work.
- Keep service-worker state out of globals. Keep panel workflow, job confirmation, and evidence state as discriminated unions.
- Keep AI SDK evaluation requests in the visible panel. The service worker owns only the action gesture and capture.
- Build with `pnpm build` or verify with `pnpm check`. Load `extension/dist` as an unpacked extension in Chrome.

## Security and privacy

- Keep permissions limited to `activeTab`, `scripting`, `sidePanel`, and `storage`. Keep host access limited to `https://ai-gateway.vercel.sh/*`.
- Keep extension scripts and assets self-only. `connect-src` may include only `https://ai-gateway.vercel.sh`. Do not add remote code, inline scripts, or inline event handlers.
- Validate page capture, resume bytes, Chrome storage, and Gateway responses at their trust boundaries. Bound all text and response sizes.
- Keep resume text, job text, API keys, request bodies, and response bodies out of logs and test artifacts.

## Quality

- Run `pnpm check` before handoff.
- Keep `extension/test/build.test.mjs` aligned with the manifest and output contract.
- Preserve keyboard focus, forced-colors fallback, semantic landmarks, narrow-width layout, and 200% zoom support.
