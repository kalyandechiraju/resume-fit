import { extractPageText, parseInjectionResults } from "./capture";
import { newOpaqueVersion } from "./domain";
import { beginCapture, saveCapture } from "./storage";

async function persistCapture(attemptId: string, execution: Promise<unknown>): Promise<void> {
  try {
    const result = await execution;
    await saveCapture(chrome.storage, parseInjectionResults(result, attemptId));
  } catch {
    await saveCapture(chrome.storage, { kind: "capture-failed", captureAttemptId: attemptId, code: "unavailable" });
  }
}

chrome.action.onClicked.addListener((tab) => {
  if (tab.windowId === undefined) return;

  void chrome.sidePanel.open({ windowId: tab.windowId });
  if (tab.id === undefined) return;

  const captureAttemptId = newOpaqueVersion();
  const execution = chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: extractPageText,
  });
  void beginCapture(chrome.storage, captureAttemptId);
  void persistCapture(captureAttemptId, execution);
});
