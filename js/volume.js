// 音量控制功能

// 應用總音量到指定串流
function applyMasterVolumeToStream(id) {
  if (!streamData[id] || !players[id] || !players[id].player) return;
  
  const volSlider = document.querySelector(`#box${id} .volume`);
  if (!volSlider) return;
  
  const masterVolSlider = document.getElementById('master-volume');
  const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
  const streamVol = parseInt(volSlider.value) || streamData[id].volume || 100;
  
  // 計算實際音量（考慮總音量）
  const actualVol = Math.round((streamVol / 100) * masterVol);
  
  // 更新音量條的視覺顯示（顯示實際音量）
  const volValue = document.querySelector(`#box${id} .vol-value`);
  if (volValue) {
    volValue.textContent = actualVol + '%';
  }
  
  // 應用音量到播放器（檢查播放器是否已準備好）
  try {
    if (players[id].type === 'twitch') {
      if (typeof players[id].player.setVolume === 'function') {
        players[id].player.setVolume(actualVol / 100);
      }
    } else if (players[id].type === 'youtube') {
      // YouTube 播放器需要檢查是否已就緒
      if (players[id].player) {
        // 檢查播放器狀態
        try {
          const playerState = players[id].player.getPlayerState();
          // 如果播放器已就緒（狀態不是 -1），可以設置音量
          if (playerState !== undefined) {
            // 如果音量為 0，使用 mute() 方法確保靜音
            if (actualVol === 0) {
              if (typeof players[id].player.mute === 'function') {
                players[id].player.mute();
              } else if (typeof players[id].player.setVolume === 'function') {
                players[id].player.setVolume(0);
              }
            } else {
              // 如果音量不為 0，先取消靜音，再設置音量
              if (typeof players[id].player.unMute === 'function') {
                players[id].player.unMute();
              }
              if (typeof players[id].player.setVolume === 'function') {
                players[id].player.setVolume(actualVol);
              }
            }
          }
        } catch (e) {
          // 播放器尚未就緒，稍後再試
          setTimeout(() => {
            if (players[id] && players[id].player) {
              try {
                if (actualVol === 0) {
                  if (typeof players[id].player.mute === 'function') {
                    players[id].player.mute();
                  } else if (typeof players[id].player.setVolume === 'function') {
                    players[id].player.setVolume(0);
                  }
                } else {
                  if (typeof players[id].player.unMute === 'function') {
                    players[id].player.unMute();
                  }
                  if (typeof players[id].player.setVolume === 'function') {
                    players[id].player.setVolume(actualVol);
                  }
                }
              } catch (err) {
                // 靜默處理錯誤
              }
            }
          }, 500);
        }
      }
    }
  } catch (e) {
    // 播放器尚未就緒，靜默處理
  }
}

// 設定音量控制
function setupVolumeControl(box, id) {
  const volSlider = box.querySelector('.volume');
  const volValue = box.querySelector('.vol-value');
  
  if (!volSlider) return;
  
  // 立即應用總音量（如果播放器已就緒）
  setTimeout(() => {
    applyMasterVolumeToStream(id);
  }, 500);
  
  volSlider.addEventListener('input', () => {
    const vol = parseInt(volSlider.value);
    streamData[id].volume = vol;
    
    // 計算實際音量（考慮總音量）
    const masterVolSlider = document.getElementById('master-volume');
    const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
    const actualVol = Math.round((vol / 100) * masterVol);
    
    // 更新顯示（顯示實際音量）
    volValue.textContent = actualVol + '%';
    
    // 控制實際音量（檢查播放器是否已準備好）
    if (players[id] && players[id].player) {
      try {
        if (players[id].type === 'twitch') {
          if (typeof players[id].player.setVolume === 'function') {
            players[id].player.setVolume(actualVol / 100);
          }
        } else if (players[id].type === 'youtube') {
          if (typeof players[id].player.setVolume === 'function') {
            try {
              // 檢查播放器狀態
              const playerState = players[id].player.getPlayerState();
              if (playerState !== undefined) {
                players[id].player.setVolume(actualVol);
              }
            } catch (e) {
              // 播放器尚未就緒，稍後再試
              setTimeout(() => {
                if (players[id] && players[id].player && typeof players[id].player.setVolume === 'function') {
                  try {
                    players[id].player.setVolume(actualVol);
                  } catch (err) {
                    // 靜默處理錯誤
                  }
                }
              }, 500);
            }
          }
        }
      } catch (e) {
        // 播放器尚未就緒，靜默處理
      }
    }
  });
}

// 總音量控制
let masterVolume = 100;
let previousMasterVolume = 100; // 保存之前的總音量值，用於取消靜音時恢復

function updateMasterVolume() {
  // 自動保存設置
  if (typeof autoSaveSettings === 'function') {
    autoSaveSettings();
  }
  const masterVolSlider = document.getElementById('master-volume');
  const masterVolValue = document.getElementById('master-volume-value');
  
  if (masterVolSlider) {
    const newVolume = parseInt(masterVolSlider.value);
    
    // 只有在音量不是 0 時才更新 previousMasterVolume（避免靜音時覆蓋之前的值）
    if (newVolume > 0) {
      previousMasterVolume = newVolume;
    }
    
    masterVolume = newVolume;
    if (masterVolValue) {
      masterVolValue.textContent = masterVolume + '%';
    }
    
    // 更新所有串流的音量（使用統一的函數，這會同時更新音量條的視覺顯示）
    // 這會更新每個串流畫面上方的音量條顯示
    document.querySelectorAll('.stream-box').forEach(box => {
      const id = parseInt(box.dataset.streamId);
      if (streamData[id] && players[id]) {
        applyMasterVolumeToStream(id);
      }
    });
  }
}

function muteAll() {
  const masterVolSlider = document.getElementById('master-volume');
  if (masterVolSlider) {
    if (masterVolume > 0) {
      // 靜音：保存當前值並設為 0
      previousMasterVolume = masterVolume;
      masterVolSlider.value = 0;
      masterVolume = 0;
      
      // 直接對所有播放器應用靜音，確保立即生效
      document.querySelectorAll('.stream-box').forEach(box => {
        const id = parseInt(box.dataset.streamId);
        if (streamData[id] && players[id] && players[id].player) {
          try {
            if (players[id].type === 'twitch') {
              // Twitch 播放器：設置音量為 0
              if (typeof players[id].player.setVolume === 'function') {
                players[id].player.setVolume(0);
              }
            } else if (players[id].type === 'youtube') {
              // YouTube 播放器：使用 mute() 方法或設置音量為 0
              if (typeof players[id].player.mute === 'function') {
                players[id].player.mute();
              } else if (typeof players[id].player.setVolume === 'function') {
                try {
                  const playerState = players[id].player.getPlayerState();
                  if (playerState !== undefined) {
                    players[id].player.setVolume(0);
                  }
                } catch (e) {
                  // 播放器尚未就緒，稍後再試
                  setTimeout(() => {
                    if (players[id] && players[id].player) {
                      if (typeof players[id].player.mute === 'function') {
                        players[id].player.mute();
                      } else if (typeof players[id].player.setVolume === 'function') {
                        try {
                          players[id].player.setVolume(0);
                        } catch (err) {
                          // 靜默處理錯誤
                        }
                      }
                    }
                  }, 500);
                }
              }
            }
          } catch (e) {
            // 靜默處理錯誤
          }
        }
      });
      
      // 更新總音量顯示和所有串流的音量顯示
      updateMasterVolume();
    } else {
      // 取消靜音：恢復到之前保存的值（如果之前的值為 0 或未設定，則使用 100）
      const restoreVolume = previousMasterVolume > 0 ? previousMasterVolume : 100;
      masterVolSlider.value = restoreVolume;
      masterVolume = restoreVolume;
      
      // 直接對所有播放器取消靜音，確保立即生效
      document.querySelectorAll('.stream-box').forEach(box => {
        const id = parseInt(box.dataset.streamId);
        if (streamData[id] && players[id] && players[id].player) {
          try {
            if (players[id].type === 'twitch') {
              // Twitch 播放器：通過設置音量來取消靜音
              // 音量會通過 updateMasterVolume 中的 applyMasterVolumeToStream 來設置
            } else if (players[id].type === 'youtube') {
              // YouTube 播放器：使用 unMute() 方法
              if (typeof players[id].player.unMute === 'function') {
                players[id].player.unMute();
              }
            }
          } catch (e) {
            // 靜默處理錯誤
          }
        }
      });
      
      // 更新總音量顯示和所有串流的音量顯示
      updateMasterVolume();
    }
  }
}

