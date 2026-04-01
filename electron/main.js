const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('path')

const isDev = process.env.NODE_ENV === 'development'

function createWindow() {
  const win = new BrowserWindow({
    width: 400,
    height: 480,
    alwaysOnTop: true,      // 항상 다른 창 위에 떠있음
    resizable: false,
    frame: false,           // 기본 타이틀바 제거 (깔끔하게)
    transparent: true,      // 창 배경 투명 (찐빵만 보임)
    hasShadow: false,       // macOS: 사각형 그림자 제거
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:3000')
  } else {
    win.loadFile(path.join(__dirname, '../out/index.html'))
  }

  // 드래그로 창 이동 (frame: false이면 기본 드래그 없어서 직접 처리)
  ipcMain.on('window-drag', (_, { deltaX, deltaY }) => {
    const [x, y] = win.getPosition()
    win.setPosition(x + deltaX, y + deltaY)
  })

  ipcMain.on('window-close', () => win.close())
  ipcMain.on('window-minimize', () => win.minimize())
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => app.quit())
