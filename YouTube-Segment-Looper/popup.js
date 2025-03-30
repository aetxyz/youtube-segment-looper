// This handles the popup UI logic
document.addEventListener('DOMContentLoaded', function() {
  const startTimeInput = document.getElementById('startTime');
  const endTimeInput = document.getElementById('endTime');
  const setLoopBtn = document.getElementById('setLoopBtn');
  const currentTimeBtn = document.getElementById('currentTimeBtn');
  const stopLoopBtn = document.getElementById('stopLoopBtn');
  const statusElement = document.getElementById('status');
  
  // Check if we're on a YouTube page and get loop settings
  checkYouTubePage();
  
  // Load current loop settings if they exist
  loadLoopSettings();
  
  // Set loop with manually entered times
  setLoopBtn.addEventListener('click', function() {
    const startTime = startTimeInput.value.trim();
    const endTime = endTimeInput.value.trim();
    
    if (!startTime || !endTime) {
      updateStatus('Please enter both start and end times', 'error');
      return;
    }
    
    const startSeconds = convertTimeToSeconds(startTime);
    const endSeconds = convertTimeToSeconds(endTime);
    
    if (startSeconds >= endSeconds) {
      updateStatus('End time must be after start time', 'error');
      return;
    }
    
    sendMessageToContentScript('setLoop', { startTime: startSeconds, endTime: endSeconds }, function(response) {
      if (response && response.success) {
        // Update UI to reflect active loop
        stopLoopBtn.disabled = false;
      }
    });
  });
  
  // Use current video time
  currentTimeBtn.addEventListener('click', function() {
    sendMessageToContentScript('getCurrentTime', {}, function(response) {
      if (response && response.success) {
        const currentTime = response.currentTime;
        
        // If start time is empty, fill it. Otherwise, fill end time
        if (!startTimeInput.value.trim()) {
          startTimeInput.value = formatTime(currentTime);
          updateStatus('Start time set to current position');
        } else {
          endTimeInput.value = formatTime(currentTime);
          updateStatus('End time set to current position');
        }
      } else {
        updateStatus('Failed to get current time', 'error');
      }
    });
  });
  
  // Stop loop
  stopLoopBtn.addEventListener('click', function() {
    sendMessageToContentScript('stopLoop', {}, function(response) {
      if (response && response.success) {
        // Update UI to reflect no active loop
        stopLoopBtn.disabled = true;
      }
    });
  });
  
  // Helper function to send messages to content script via background
  function sendMessageToContentScript(action, data = {}, callback) {
    chrome.runtime.sendMessage({
      from: 'popup',
      action: action,
      data: data
    }, function(response) {
      if (response && response.success) {
        if (action === 'setLoop') {
          updateStatus('Loop set successfully!');
        } else if (action === 'stopLoop') {
          updateStatus('Loop stopped');
        }
      } else if (response && response.error) {
        updateStatus(response.error, 'error');
      } else {
        updateStatus('Communication error with YouTube page', 'error');
      }
      
      if (callback) callback(response);
    });
  }
  
  // Check if we're on a YouTube page and update UI accordingly
  function checkYouTubePage() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        updateStatus('Cannot access active tab', 'error');
        disableControls();
        return;
      }
      
      const activeTab = tabs[0];
      if (!activeTab.url || !activeTab.url.includes('youtube.com/watch')) {
        updateStatus('Not on a YouTube video page', 'error');
        disableControls();
      } else {
        // Don't set status here - we'll let loadLoopSettings handle that
        // based on whether there's an active loop
        enableControls();
      }
    });
  }
  
  // Disable control buttons
  function disableControls() {
    setLoopBtn.disabled = true;
    currentTimeBtn.disabled = true;
    stopLoopBtn.disabled = true;
    startTimeInput.disabled = true;
    endTimeInput.disabled = true;
  }
  
  // Enable control buttons
  function enableControls() {
    setLoopBtn.disabled = false;
    currentTimeBtn.disabled = false;
    // Don't enable stop button here - we'll let loadLoopSettings handle that
    // based on whether there's an active loop
    startTimeInput.disabled = false;
    endTimeInput.disabled = false;
  }
  
  // Update status message
  function updateStatus(message, type = 'success') {
    statusElement.textContent = message;
    statusElement.style.color = type === 'error' ? '#f44336' : '#4CAF50';
  }
  
  // Convert time format (1:30, 1:30.5, 01:30, 1:30:45) to seconds
  function convertTimeToSeconds(timeString) {
    // Handle decimal seconds
    const hasDecimal = timeString.includes('.');
    let decimalPart = 0;
    
    if (hasDecimal) {
      const parts = timeString.split('.');
      timeString = parts[0];
      decimalPart = parseFloat(`0.${parts[1]}`);
    }
    
    // Split by colons
    const timeParts = timeString.split(':').map(part => parseInt(part, 10));
    let seconds = 0;
    
    if (timeParts.length === 3) {
      // hours:minutes:seconds
      seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
    } else if (timeParts.length === 2) {
      // minutes:seconds
      seconds = timeParts[0] * 60 + timeParts[1];
    } else {
      // seconds only
      seconds = timeParts[0];
    }
    
    return seconds + decimalPart;
  }
  
  // Format seconds to MM:SS
  function formatTime(totalSeconds) {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
    const decimalPart = totalSeconds % 1;
    
    let formattedTime = `${minutes}:${seconds.toString().padStart(2, '0')}`;
    
    // Add decimal part if it exists
    if (decimalPart > 0) {
      formattedTime += decimalPart.toFixed(2).substring(1);
    }
    
    return formattedTime;
  }
  
  // Load current loop settings from content script
  function loadLoopSettings() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs.length === 0) {
        return;
      }
      
      const activeTab = tabs[0];
      if (!activeTab.url || !activeTab.url.includes('youtube.com/watch')) {
        return;
      }
      
      // Ask content script for current loop settings
      chrome.runtime.sendMessage({
        from: 'popup',
        action: 'getLoopSettings'
      }, function(response) {
        if (!response || !response.success) {
          return;
        }
        
        if (response.isLooping && response.startTime !== null && response.endTime !== null) {
          // Fill in the input fields with current loop times
          startTimeInput.value = formatTime(response.startTime);
          endTimeInput.value = formatTime(response.endTime);
          
          // Update UI to show we're looping
          stopLoopBtn.disabled = false;
          updateStatus('Loop is active', 'success');
        } else {
          // No active loop
          stopLoopBtn.disabled = true;
          updateStatus('Ready to set loop points');
        }
      });
    });
  }
});