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
  
  // 應用音量到播放器（檢查播放器是否已準備好）
  try {
    if (players[id].type === 'twitch') {
      if (typeof players[id].player.setVolume === 'function') {
        players[id].player.setVolume(actualVol / 100);
      }
    } else if (players[id].type === 'youtube') {
      // YouTube 播放器需要檢查是否已就緒
      if (players[id].player && typeof players[id].player.setVolume === 'function') {
        // 檢查播放器狀態
        try {
          const playerState = players[id].player.getPlayerState();
          // 如果播放器已就緒（狀態不是 -1），可以設置音量
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
    volValue.textContent = vol + '%';
    streamData[id].volume = vol;
    
    // 計算實際音量（考慮總音量）
    const masterVolSlider = document.getElementById('master-volume');
    const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
    const actualVol = Math.round((vol / 100) * masterVol);
    
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

function updateMasterVolume() {
  // 自動保存設置
  if (typeof autoSaveSettings === 'function') {
    autoSaveSettings();
  }
  const masterVolSlider = document.getElementById('master-volume');
  const masterVolValue = document.getElementById('master-volume-value');
  
  if (masterVolSlider) {
    masterVolume = parseInt(masterVolSlider.value);
    if (masterVolValue) {
      masterVolValue.textContent = masterVolume + '%';
    }
    
    // 更新所有串流的音量（使用統一的函數）
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
      masterVolSlider.value = 0;
      updateMasterVolume();
    } else {
      masterVolSlider.value = 100;
      updateMasterVolume();
    }
  }
}

