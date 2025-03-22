// Minimal background script
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Comment Sentiment Analyzer installed');
});

// No additional background processing needed for this extension
// All sentiment analysis happens in the popup