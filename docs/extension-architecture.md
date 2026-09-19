# Resume Fit extension architecture

Resume Fit is a Manifest V3 side-panel extension. It compares one locally parsed resume with one confirmed job description. The repository contains no website or application backend.

## Runtime flow

The toolbar action owns the Chrome user gesture:

1. `background.ts` calls `chrome.sidePanel.open()` synchronously.
2. The same listener starts `chrome.scripting.executeScript()` before any asynchronous work.
3. The injected capture function finds the visible job heading and chooses the smallest ancestor containing recognizable job sections. It falls back to `main`, `article`, `[role="main"]`, then `body`.
4. The capture function normalizes and bounds text inside the page before Chrome serializes the result.
5. The service worker writes the result to a session-only capture inbox.

The side panel owns the assessment:

1. `panel.ts` consumes the latest capture and shows only its title and source.
2. `resume.ts` parses a PDF or DOCX file locally. It stores extracted text, not the source file.
3. The user selects Vercel AI Gateway or TypeSafe direct API and saves its key for the current browser session.
4. `analysis.ts` reports two real phases, calls the selected TypeSafe Jev evaluation provider, and builds the report from validated source spans.
5. The report renders one match gauge and four metric bars.

Canceling analysis aborts the in-flight request. The service worker never owns analysis state.

## File ownership

```text
extension/
├── src/
│   ├── background.ts   action gesture and capture start
│   ├── capture.ts      injected extraction and capture validation
│   ├── domain.ts       assessment and report types, limits, normalization
│   ├── storage.ts      private Chrome storage keys and boundary parsing
│   ├── resume.ts       local PDF and DOCX parsing
│   ├── analysis.ts     TypeSafe requests, span validation, and scoring
│   └── panel.ts        DOM events, workflow state, cancellation, and rendering
├── static/
│   ├── assets/         mark, local fonts, and font licenses
│   ├── THIRD_PARTY_NOTICES.txt
│   ├── manifest.json
│   └── sidepanel/
├── scripts/build.mjs
└── test/
```

The build bundles `background.ts` and `panel.ts`. It copies the manifest, side-panel document, local assets, and third-party notices into `extension/dist`.

## Data model

`ResumeDocument` and `JobConfirmed` have independent opaque versions. `crypto.randomUUID()` creates each version. Analysis captures both versions and an in-memory attempt ID. The panel renders a response only when the current versions and attempt ID still match.

Capture and manual paste produce a bounded `JobConfirmed` value. The workflow state is a closed discriminated union. Full resume text, job text, and the active provider key stay outside render state. A successful resume, job, or provider connection change hides an older report.

`RequirementEvidence` is an internal discriminated union:

- `no-match` requires `resumeEvidence: null`.
- `related`, `partial`, and `clear` require an exact resume span.

The report builder validates every job and resume span against its source text. It rejects normalized duplicate requirements and contradictory evidence. TypeScript calculates the four metric scores and weighted overall score. The public report contains only those scores.

## Storage and retention

| Data | Storage | Retention |
| --- | --- | --- |
| Extracted resume text and file metadata | `chrome.storage.local` | Until the user deletes it or removes the extension |
| Selected job text | `chrome.storage.session` | Current browser session |
| Active provider connection and API key | `chrome.storage.session` | Current browser session |
| Capture inbox | `chrome.storage.session` | Removed after the panel consumes it |

The extension stores no raw resume file and no report history. The service worker stores no state in globals.

## Evaluation boundary

The panel uses AI SDK 7's `experimental_evaluate` with one selected evaluation model. Vercel requests use `createGateway(...).evaluationModel("typesafe-ai/jev")` and send to `https://ai-gateway.vercel.sh/v4/ai/evaluation-model`. Direct requests use `createTypeSafeAi(...).evaluationModel("jev-latest")` and send to `https://api.typesafe.ai/v1/systemone`. Both requests use the selected session-only key.

Code performs the extraction and arithmetic:

1. Code splits confirmed job text into bounded exact spans.
2. TypeSafe Boolean questions decide whether each span is a concrete requirement.
3. Independent Choice questions label surviving requirements as required or preferred.
4. Code shortlists bounded resume spans for each requirement.
5. TypeSafe Choice questions judge each requirement and resume-span pair as no, related, partial, or clear support.
6. Code selects the strongest evidence, validates exact source membership, and calculates the report.

Each request has a 15-second timeout and no automatic retries. A fetch boundary caps response bodies at 512 KB before AI SDK validates the typed answers. The extension does not log the key, documents, request body, or response body.

## Permissions

| Permission | Use |
| --- | --- |
| `sidePanel` | Open the assessment panel from the toolbar action |
| `activeTab` | Grant one-time access after the action click |
| `scripting` | Run the bounded capture function in the active tab |
| `storage` | Store the assessment inputs according to their retention rules |
| `https://ai-gateway.vercel.sh/*` | Send a user-requested TypeSafe Jev evaluation through Vercel AI Gateway |
| `https://api.typesafe.ai/*` | Send a user-requested TypeSafe Jev evaluation through the TypeSafe direct API |

The extension requests no `tabs`, `<all_urls>`, persistent content scripts, remote code, analytics, or application backend.

## Verification

Run the deterministic checks with:

```sh
pnpm check
```

`pnpm check` type-checks the source, builds the real MV3 directory, runs scoring and exact-span tests, and inspects the built manifest, bundles, capture listener order, and third-party notices.

The unpacked extension has been rebuilt and checked in Chrome at side-panel width. The toolbar action captured a Google Careers job title and advanced through onboarding to the job-ready screen. Live Gateway verification requires a real session key after each extension reload.
