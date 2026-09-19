# Privacy Policy for Resume Fit

Last updated: September 19, 2026

## Data handled

Resume Fit handles the resume file you select, readable job-page text captured after you click the extension action or paste into the panel, and the API key for the provider you select. The extension does not collect browsing history, analytics, advertising identifiers, or account information.

## Storage

Resume files are parsed on your device. The original file is not stored. Extracted resume text and minimal file metadata are stored in Chrome local extension storage until you delete the resume or remove the extension.

The current job text and one active provider connection are stored in Chrome session extension storage and are cleared when the browser session ends. Saving another provider replaces the active connection. The connection stores the provider name and its API key under the existing session key.

## Use and sharing

Resume Fit uses this data only to compare the selected resume with the selected job description. When you select **Analyze match**, the extension sends the extracted resume text and selected job text to the provider you selected. Vercel AI Gateway requests send the API key to Vercel at `https://ai-gateway.vercel.sh`, which routes the evaluation to TypeSafe's Jev model. Direct requests send the API key to TypeSafe at `https://api.typesafe.ai/v1/systemone` and use the `jev-latest` model. No data is sent to a Resume Fit server because no such server exists.

Resume Fit does not sell data or use it for advertising. Vercel operates the Gateway, and TypeSafe operates the direct API and processes model evaluations, under their respective terms and privacy practices.

## Deletion

Use **Delete resume** in the extension to remove locally stored resume text. Use **Clear session connection** to remove the active provider and API key. Close Chrome to clear the current job text and any remaining session connection. Removing the extension deletes its Chrome extension storage.

## Changes

This policy will be updated before the extension's data practices change. The updated date above identifies the current version.

## Contact

Report privacy questions through the repository's [issue tracker](https://github.com/kalyandechiraju/resume-fit/issues).
