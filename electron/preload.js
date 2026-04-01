const { contextBridge, ipcRenderer } = require('electron')

// 렌더러(웹페이지)에서 안전하게 쓸 수 있는 Electron API 노출
contextBridge.exposeInMainWorld('electron', {
  closeWindow: () => ipcRenderer.send('window-close'),
  minimizeWindow: () => ipcRenderer.send('window-minimize'),
  dragWindow: (deltaX, deltaY) => ipcRenderer.send('window-drag', { deltaX, deltaY }),
})
