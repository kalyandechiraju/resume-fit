# Chrome Web Store Listing: Resume Fit

> Last Updated: 2026-09-19

## Store Listing

**Extension Name** [REQUIRED]

Resume Fit

The name matches `manifest.json`.

**Short Description** [REQUIRED]

Compare your resume with the current job page using a clear overall score and four match metrics.

**Detailed Description** [REQUIRED]

Resume Fit compares one PDF or DOCX resume with the job open in the current Chrome tab.

FEATURES
• A simple overall match score
• Four focused ratings for experience, skills, responsibilities, and qualifications
• One-click capture of the current public job listing
• Paste fallback when a site blocks page capture
• Local resume parsing with no source-file storage

HOW TO USE
1. Add a resume and your Vercel AI Gateway key during setup.
2. Open a public job listing and click the Resume Fit toolbar icon.
3. Confirm the detected job title and select Analyze match.
4. Review the overall score and metric bars in the side panel.

PRIVACY
Resume Fit stores extracted resume text locally and never stores the original file. The current job and Gateway key last only for the browser session. Analysis sends the extracted resume text and confirmed job text through the user's Vercel AI Gateway account to TypeSafe. Resume Fit has no analytics, ads, cloud account, or application backend.

**Category** [REQUIRED]

Productivity

**Single Purpose** [REQUIRED]

Compare one locally parsed resume with the job page selected by the user.

**Primary Language** [REQUIRED]

English

## Graphics and Assets

| Asset | Dimensions | Status | Filename |
| --- | --- | --- | --- |
| Store Icon [REQUIRED] | 128x128 PNG | Ready | `extension/static/icons/icon-128.png` |
| Screenshot 1 [REQUIRED] | 1280x800 or 640x400 | Ready | `store-assets/screenshot-onboarding.png` |
| Screenshot 2 [RECOMMENDED] | 1280x800 or 640x400 | Ready | `store-assets/screenshot-job-ready.png` |
| Screenshot 3 [RECOMMENDED] | 1280x800 or 640x400 | Ready | `store-assets/screenshot-results.png` |
| Screenshot 4 | 1280x800 or 640x400 | Not needed | |
| Screenshot 5 | 1280x800 or 640x400 | Not needed | |
| Small Promo Tile [RECOMMENDED] | 440x280 | TODO: create before submission | |
| Marquee Promo Tile | 1400x560 | TODO: decide before submission | |

### Screenshot Notes

Screenshots use fictional fixture content and contain no names, contact details, account avatars, or API keys. Refresh them after material UI changes.

## Permissions Justification

| Permission | Type | Justification |
| --- | --- | --- |
| `sidePanel` | permissions | Opens the Resume Fit side panel when the user clicks the extension action. |
| `activeTab` | permissions | Grants one-time access to the current page only after the user clicks the Resume Fit action. |
| `scripting` | permissions | Extracts readable text from the current page during that action click. |
| `storage` | permissions | Keeps extracted resume text locally and keeps the current job and API key for the browser session. |
| `https://ai-gateway.vercel.sh/*` | host permissions | Sends confirmed resume and job text through the user's Vercel AI Gateway account to TypeSafe's Jev model for analysis. |

The extension does not request `tabs`, `<all_urls>`, persistent content scripts, or access to other sites.

## Privacy and Data Use

### Data Collection

**Does the extension collect user data?** Yes, only for its single purpose.

Resume Fit handles three user-provided data types:

- Resume content. The extension extracts text from a PDF or DOCX file and stores the extracted text in `chrome.storage.local`. It does not store the original file.
- Job content. The extension captures readable text after an action click or accepts pasted text when capture fails. The extension stores it in `chrome.storage.session` and shows only the title before analysis.
- Vercel AI Gateway key. The extension stores the key in `chrome.storage.session` and sends it only to `https://ai-gateway.vercel.sh` as authorization for an analysis request.

When the user selects **Analyze match**, Resume Fit sends the extracted resume text and selected job text through Vercel AI Gateway to TypeSafe. Resume Fit does not send the source file, browsing history, analytics, or advertising identifiers. Closing the browser clears the job text and API key. The saved resume remains until the user deletes it or removes the extension.

### Data Use Certification

- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

## Privacy Policy

**Privacy Policy URL** [REQUIRED]

Source policy: `PRIVACY.md`. TODO: publish it at a stable HTTPS URL and add that URL before submission.

## Distribution

**Visibility**: TODO: choose Public, Unlisted, or Private before submission.

**Regions**: TODO: choose All regions or list specific regions before submission.

## Developer Info

**Publisher Name** [REQUIRED]

TODO: provide the publisher name.

**Contact Email** [REQUIRED]

TODO: provide the public support contact email.

**Support URL and Email** [RECOMMENDED]

TODO: provide a support URL or email.

**Homepage URL** [RECOMMENDED]

Optional. This extension has no product website; the published privacy-policy URL may be used.

## Version History

| Version | Date | Changes | Status |
| --- | --- | --- | --- |
| 0.3.0 | 2026-09-19 | Added the redesigned side panel, minimal score report, workflow illustrations, and production icon set. | Release candidate |
| 0.2.0 | 2026-09-18 | Added local resume parsing, one-shot job capture, TypeSafe analysis, and evidence reports. | Draft |
| 0.1.0 | 2026-09-18 | Added the working side-panel shell. | Draft |

## Review Notes

### Known Issues and Limitations

- Protected Chrome pages and pages without readable text require paste fallback.
- Publisher name, contact email, hosted privacy URL, visibility, and regions require publisher input before upload.

### Rejection History

None.
