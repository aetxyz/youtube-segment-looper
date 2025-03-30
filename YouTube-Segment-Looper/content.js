// This script runs on YouTube pages and controls video playback
(function() {
  // State variables
  let loopInterval = null;
  let startTime = 0;
  let endTime = 0;
  let player = null;
  
  // Initialize when the content script loads
  function initialize() {
    console.log('YouTube Segment Looper: Content script initialized');
    // Try to find the YouTube player
    findPlayer();
  }
  
  // Try to find the player element using different methods
  function findPlayer() {
    player = null;
    console.log('YouTube Segment Looper: Attempting to find player');
    
    // Method 1: Direct DOM access
    const findPlayerInterval = setInterval(() => {
      // Try multiple methods to get player
      
      // Method 1: Standard player
      if (!player && document.querySelector('#movie_player')) {
        const moviePlayer = document.querySelector('#movie_player');
        try {
          if (typeof moviePlayer.getCurrentTime === 'function') {
            player = moviePlayer;
            console.log('YouTube Segment Looper: Found player via #movie_player');
          }
        } catch (e) {
          console.log('YouTube Segment Looper: #movie_player not ready yet');
        }
      }
      
      // Method 2: HTML5 video element directly
      if (!player && document.querySelector('video.html5-main-video')) {
        const videoElement = document.querySelector('video.html5-main-video');
        if (videoElement) {
          console.log('YouTube Segment Looper: Found HTML5 video element');
          // Create a wrapper with similar API to YouTube player
          player = {
            videoElement: videoElement,
            getCurrentTime: function() {
              return this.videoElement.currentTime;
            },
            seekTo: function(time) {
              this.videoElement.currentTime = time;
              return true;
            }
          };
        }
      }
      
      // Method 3: Try to access via YouTube API
      if (!player && window.yt && window.yt.player && window.yt.player.getPlayerByElement) {
        try {
          const moviePlayerElement = document.querySelector('#movie_player');
          if (moviePlayerElement) {
            const ytPlayer = window.yt.player.getPlayerByElement(moviePlayerElement);
            if (ytPlayer && typeof ytPlayer.getCurrentTime === 'function') {
              player = ytPlayer;
              console.log('YouTube Segment Looper: Found player via YouTube API');
            }
          }
        } catch (e) {
          console.log('YouTube Segment Looper: Error accessing yt.player API', e);
        }
      }
      
      if (player) {
        clearInterval(findPlayerInterval);
        console.log('YouTube Segment Looper: Player found and ready!');
        
        // Test the player
        try {
          const currentTime = player.getCurrentTime();
          console.log('YouTube Segment Looper: Current time:', currentTime);
        } catch (e) {
          console.error('YouTube Segment Looper: Error testing player', e);
          player = null; // Reset if error
          // Will try again
        }
      }
    }, 1000);
    
    // Stop trying after 30 seconds
    setTimeout(() => {
      if (!player) {
        clearInterval(findPlayerInterval);
        console.log('YouTube Segment Looper: Failed to find player after timeout');
        
        // Try injecting a script to the page context to get direct access
        injectHelperScript();
      }
    }, 30000);
  }
  
  // Inject a helper script into the page context to get direct access to YouTube API
  function injectHelperScript() {
    console.log('YouTube Segment Looper: Injecting helper script');
    
    const script = document.createElement('script');
    script.textContent = `
      // Helper script to access YouTube player
      (function() {
        window.YouTubeSegmentLooperHelper = {
          player: null,
          
          initialize: function() {
            if (document.querySelector('#movie_player')) {
              this.player = document.querySelector('#movie_player');
              console.log('YouTubeSegmentLooperHelper: Player found');
              
              // Notify content script that player is ready
              window.dispatchEvent(new CustomEvent('youtube-segment-looper-player-ready', {
                detail: { success: true }
              }));
            } else {
              console.log('YouTubeSegmentLooperHelper: Player not found');
              window.dispatchEvent(new CustomEvent('youtube-segment-looper-player-ready', {
                detail: { success: false }
              }));
            }
          },
          
          getCurrentTime: function() {
            if (this.player && typeof this.player.getCurrentTime === 'function') {
              return this.player.getCurrentTime();
            }
            return 0;
          },
          
          seekTo: function(time) {
            if (this.player && typeof this.player.seekTo === 'function') {
              this.player.seekTo(time, true);
              return true;
            }
            return false;
          }
        };
        
        // Initialize helper on page load
        if (document.readyState === 'complete' || document.readyState === 'interactive') {
          setTimeout(function() {
            window.YouTubeSegmentLooperHelper.initialize();
          }, 1000);
        } else {
          window.addEventListener('DOMContentLoaded', function() {
            setTimeout(function() {
              window.YouTubeSegmentLooperHelper.initialize();
            }, 1000);
          });
        }
        
        // Command handler
        window.addEventListener('youtube-segment-looper-command', function(event) {
          const command = event.detail.command;
          const params = event.detail.params || {};
          
          if (command === 'getCurrentTime') {
            const time = window.YouTubeSegmentLooperHelper.getCurrentTime();
            window.dispatchEvent(new CustomEvent('youtube-segment-looper-response', {
              detail: { success: true, time: time }
            }));
          }
          else if (command === 'seekTo') {
            const success = window.YouTubeSegmentLooperHelper.seekTo(params.time);
            window.dispatchEvent(new CustomEvent('youtube-segment-looper-response', {
              detail: { success: success }
            }));
          }
        });
      })();
    `;
    
    document.head.appendChild(script);
    
    // Listen for player ready event
    window.addEventListener('youtube-segment-looper-player-ready', function(event) {
      if (event.detail.success) {
        // Use the injected helper as our player interface
        player = {
          getCurrentTime: function() {
            return sendCommandToPage('getCurrentTime');
          },
          seekTo: function(time) {
            return sendCommandToPage('seekTo', { time: time });
          }
        };
        console.log('YouTube Segment Looper: Using injected helper script for player control');
      } else {
        console.log('YouTube Segment Looper: Helper script also failed to find player');
      }
    });
  }
  
  // Send command to the page context and wait for response
  function sendCommandToPage(command, params) {
    return new Promise((resolve, reject) => {
      // Set up response listener
      const responseHandler = function(event) {
        window.removeEventListener('youtube-segment-looper-response', responseHandler);
        resolve(event.detail);
      };
      window.addEventListener('youtube-segment-looper-response', responseHandler);
      
      // Send command
      window.dispatchEvent(new CustomEvent('youtube-segment-looper-command', {
        detail: { 
          command: command,
          params: params
        }
      }));
      
      // Timeout after 2 seconds
      setTimeout(() => {
        window.removeEventListener('youtube-segment-looper-response', responseHandler);
        reject(new Error('Command timeout'));
      }, 2000);
    });
  }
  
  // Set up the loop between start and end times
  function setLoop(start, end) {
    // Clear any existing interval
    stopLoop();
    
    // Set new times
    startTime = start;
    endTime = end;
    
    if (!player) {
      // Try to find the player again
      findPlayer();
      return { success: false, error: 'YouTube player not found or not ready' };
    }
    
    try {
      // Jump to start time
      player.seekTo(startTime, true);
      
      // Set interval to check current time
      loopInterval = setInterval(() => {
        if (!player) {
          stopLoop();
          return;
        }
        
        try {
          const currentTime = player.getCurrentTime();
          
          // If getCurrentTime returns a Promise, handle it
          if (currentTime instanceof Promise) {
            currentTime.then(time => {
              if (time >= endTime) {
                // If seekTo returns a Promise, handle it
                const seekResult = player.seekTo(startTime, true);
                if (seekResult instanceof Promise) {
                  seekResult.catch(e => {
                    console.error('YouTube Segment Looper: Error seeking in loop', e);
                  });
                }
              }
            }).catch(e => {
              console.error('YouTube Segment Looper: Error getting time in loop', e);
            });
          } else {
            // Handle normal value
            if (currentTime >= endTime) {
              player.seekTo(startTime, true);
            }
          }
        } catch (e) {
          console.error('YouTube Segment Looper: Error during loop', e);
          stopLoop();
        }
      }, 50); // Check frequently for smoother looping
      
      return { success: true };
    } catch (e) {
      console.error('YouTube Segment Looper: Error setting loop', e);
      return { success: false, error: 'Error setting loop: ' + e.message };
    }
  }
  
  // Stop the current loop
  function stopLoop() {
    if (loopInterval) {
      clearInterval(loopInterval);
      loopInterval = null;
    }
    return { success: true };
  }
  
  // Get current video time
  function getCurrentTime() {
    if (!player) {
      // Try to find the player again
      findPlayer();
      return { success: false, error: 'YouTube player not found or not ready' };
    }
    
    try {
      const currentTime = player.getCurrentTime();
      
      // If getCurrentTime returns a Promise, handle it
      if (currentTime instanceof Promise) {
        return currentTime.then(time => {
          return { success: true, currentTime: time };
        });
      }
      
      return { success: true, currentTime };
    } catch (e) {
      console.error('YouTube Segment Looper: Error getting time', e);
      return { success: false, error: 'Error getting video time: ' + e.message };
    }
  }
  
  // Listen for messages from the popup or background script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('YouTube Segment Looper: Message received', message);
    
    // Respond to ping from background script
    if (message.action === 'ping') {
      sendResponse({ action: 'ping_response', alive: true });
      return true;
    }
    
    // Get current loop settings for popup
    if (message.action === 'getLoopSettings') {
      const isLooping = loopInterval !== null;
      const settings = {
        success: true,
        isLooping: isLooping,
        startTime: isLooping ? startTime : null,
        endTime: isLooping ? endTime : null
      };
      sendResponse(settings);
      return true;
    }
    
    // Handle different actions
    if (message.action === 'setLoop') {
      const result = setLoop(message.startTime, message.endTime);
      
      // If result is a Promise, handle it accordingly
      if (result instanceof Promise) {
        result.then(sendResponse).catch(error => {
          console.error('YouTube Segment Looper: Error in setLoop', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse(result);
      }
    } else if (message.action === 'stopLoop') {
      sendResponse(stopLoop());
    } else if (message.action === 'getCurrentTime') {
      const result = getCurrentTime();
      
      // If result is a Promise, handle it accordingly
      if (result instanceof Promise) {
        result.then(sendResponse).catch(error => {
          console.error('YouTube Segment Looper: Error in getCurrentTime', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse(result);
      }
    }
    
    return true; // Required for asynchronous sendResponse
  });
  
  // Send a ready message when the content script loads
  chrome.runtime.sendMessage({ from: 'content', status: 'ready' });
  
  // Initialize on page load
  initialize();
})();