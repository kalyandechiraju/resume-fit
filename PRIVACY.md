# Privacy Policy for Resume Fit

Last updated: September 19, 2026

## Data handled

Resume Fit handles the resume file you select, readable job-page text captured after you click the extension action or paste into the panel, and the Vercel AI Gateway key you enter. The extension does not collect browsing history, analytics, advertising identifiers, or account information.

## Storage

Resume files are parsed on your device. The original file is not stored. Extracted resume text and minimal file metadata are stored in Chrome local extension storage until you delete the resume or remove the extension.

The current job text and Vercel AI Gateway key are stored in Chrome session extension storage and are cleared when the browser session ends.

## Use and sharing

Resume Fit uses this data only to compare the selected resume with the selected job description. When you select **Analyze match**, the extension sends the extracted resume text, selected job text, and Gateway key to Vercel AI Gateway at `https://ai-gateway.vercel.sh`. The Gateway routes the evaluation to TypeSafe's Jev model. No data is sent to a Resume Fit server because no such server exists.

Resume Fit does not sell data or use it for advertising. Vercel operates the Gateway, and TypeSafe processes the model evaluation, under their respective terms and privacy practices.

## Deletion

Use **Delete resume** in the extension to remove locally stored resume text. Close Chrome to clear the current job text and API key. Removing the extension deletes its Chrome extension storage.

## Changes

This policy will be updated before the extension's data practices change. The updated date above identifies the current version.

## Contact

Report privacy questions through the repository's [issue tracker](https://github.com/kalyandechiraju/resume-fit/issues).
