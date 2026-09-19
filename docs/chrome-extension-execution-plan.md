# Chrome extension execution plan

Status: implementation complete; unpacked Chrome workflow verified.

## Done predicate

The product is ready when an unpacked Manifest V3 extension proves this loop in Chrome:

1. The user uploads a PDF or DOCX resume. Parsing happens locally; only extracted text and minimal metadata persist locally.
2. The user adds a Vercel AI Gateway key for the current browser session.
3. The user clicks the extension action on a public job page. That gesture captures the selected listing, opens the side panel, and shows only its title.
4. Analyze sends only the saved resume text and selected job text to TypeSafe, then renders a deterministic score with exact supporting evidence.
5. The user can delete the saved resume. Restarting Chrome removes the job text and API key.
6. The extension uses no website runtime, Clerk, application backend, remote code, analytics, or broad `<all_urls>` access.
7. `pnpm check` passes and the real Chrome workflow succeeds.
8. The manifest, `PRIVACY.md`, and `CHROMEWEBSTORE.md` describe the same permissions and data flow.

## Runtime ownership

- Service worker: action-click orchestration, one-shot page capture, and side-panel opening.
- Side panel: two-step setup, selected job title, TypeSafe request, cancellation, truthful progress, settings, and visual report.
- Domain modules: boundary parsing, source-span validation, and deterministic scoring.
- Chrome storage: resume text in `storage.local`; API key and current job in `storage.session`.

The action click opens the panel synchronously, then uses `activeTab` plus `scripting` to capture the current main document once. Recapture requires another action click. The extension requests only `activeTab`, `scripting`, `sidePanel`, `storage`, and `https://ai-gateway.vercel.sh/*`.

## Remaining verification

- Upload representative PDF and DOCX fixtures.
- Verify delete, browser-session retention, keyboard flow, narrow width, and 200% zoom.
- Publish `PRIVACY.md` at a stable HTTPS URL before Chrome Web Store submission.

## Deferred

- Hosted website or backend.
- Authentication, cloud sync, analytics, resume history, multiple profiles, and rewrite suggestions.
- Automatic monitoring of visited pages or persistent content scripts.
- Chrome Web Store submission itself.
