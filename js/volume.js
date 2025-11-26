// 音量控制功能

// 設定音量控制
function setupVolumeControl(box, id) {
  const volSlider = box.querySelector('.volume');
  const volValue = box.querySelector('.vol-value');
  
  volSlider.addEventListener('input', () => {
    const vol = parseInt(volSlider.value);
    volValue.textContent = vol + '%';
    streamData[id].volume = vol;
    
    // 計算實際音量（考慮總音量）
    const masterVolSlider = document.getElementById('master-volume');
    const masterVol = masterVolSlider ? parseInt(masterVolSlider.value) : 100;
    const actualVol = Math.round((vol / 100) * masterVol);
    
    // 控制實際音量
    if (players[id]) {
      if (players[id].type === 'twitch') {
        players[id].player.setVolume(actualVol / 100);
      } else if (players[id].type === 'youtube') {
        players[id].player.setVolume(actualVol);
      }
    }
  });
}

// 總音量控制
let masterVolume = 100;

function updateMasterVolume() {
  const masterVolSlider = document.getElementById('master-volume');
  const masterVolValue = document.getElementById('master-volume-value');
  
  if (masterVolSlider) {
    masterVolume = parseInt(masterVolSlider.value);
    if (masterVolValue) {
      masterVolValue.textContent = masterVolume + '%';
    }
    
    // 更新所有串流的音量
    document.querySelectorAll('.stream-box').forEach(box => {
      const id = parseInt(box.dataset.streamId);
      if (streamData[id]) {
        const volSlider = box.querySelector('.volume');
        if (volSlider) {
          // 計算相對音量（基於總音量）
          const relativeVol = Math.round((parseInt(volSlider.value) / 100) * masterVolume);
          const actualVol = Math.min(100, relativeVol);
          
          // 更新播放器音量
          if (players[id]) {
            if (players[id].type === 'twitch') {
              players[id].player.setVolume(actualVol / 100);
            } else if (players[id].type === 'youtube') {
              players[id].player.setVolume(actualVol);
            }
          }
        }
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

