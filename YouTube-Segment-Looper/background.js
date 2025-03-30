// Background script to manage connections with tabs
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Segment Looper extension installed');
});

// Function to inject the content script
function injectContentScript(tabId, attemptCount = 0) {
  // Maximum 3 attempts
  if (attemptCount >= 3) {
    console.error('Failed to inject content script after multiple attempts');
    return;
  }

  chrome.scripting.executeScript({
    target: { tabId: tabId },
    files: ['content.js']
  }).then(() => {
    console.log('Content script injected successfully');
  }).catch(err => {
    console.error('Failed to inject content script:', err);
    // Retry after a delay
    setTimeout(() => {
      injectContentScript(tabId, attemptCount + 1);
    }, 1000);
  });
}

// Listen for when a tab is updated
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only run on complete load and only for YouTube watch pages
  if (changeInfo.status === 'complete' && tab.url && tab.url.includes('youtube.com/watch')) {
    console.log('YouTube page detected, injecting content script');
    injectContentScript(tabId);
  }
});

// Listen for when a tab is activated - but don't check for content script
// to avoid the error with tabs.sendMessage
chrome.tabs.onActivated.addListener((activeInfo) => {
  chrome.tabs.get(activeInfo.tabId, (tab) => {
    if (chrome.runtime.lastError) {
      console.error('Error getting tab info:', chrome.runtime.lastError);
      return;
    }
    
    if (tab.url && tab.url.includes('youtube.com/watch')) {
      console.log('YouTube tab activated');
      // Just inject the script - it's safe to inject multiple times
      injectContentScript(activeInfo.tabId);
    }
  });
});

// Set up a connection relay for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Log from content script
  if (message.from === 'content' && message.status === 'ready') {
    console.log('Content script is ready on YouTube page');
    return false;
  }
  
  // Relay messages from popup to content script
  if (message.from === 'popup') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length === 0) {
        sendResponse({ success: false, error: 'No active tab found' });
        return;
      }
      
      const activeTab = tabs[0];
      if (!activeTab.url || !activeTab.url.includes('youtube.com/watch')) {
        // For getLoopSettings, return empty settings instead of error
        if (message.action === 'getLoopSettings') {
          sendResponse({ 
            success: false, 
            isLooping: false, 
            startTime: null, 
            endTime: null 
          });
          return;
        }
        
        sendResponse({ success: false, error: 'Not on a YouTube video page' });
        return;
      }
      
      // Send message to content script
      chrome.tabs.sendMessage(
        activeTab.id, 
        { 
          action: message.action,
          ...message.data 
        },
        (response) => {
          if (chrome.runtime.lastError) {
            console.error('Error sending message to content script:', chrome.runtime.lastError);
            
            // Try to reload the content script
            injectContentScript(activeTab.id);
            
            sendResponse({ 
              success: false, 
              error: 'Content script not responsive. Please refresh the YouTube page.'
            });
            return;
          }
          
          sendResponse(response || { success: false, error: 'No response from content script' });
        }
      );
    });
    
    return true; // Keep channel open for asynchronous response
  }
});