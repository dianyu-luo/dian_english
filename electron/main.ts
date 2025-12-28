import { app, BrowserWindow, ipcMain } from 'electron';
import * as sqlite3 from 'sqlite3';
// 监听渲染进程请求，创建数据库并插入当前时间
ipcMain.handle('create-and-insert-time', async () => {
  try {
    const dbPath = path.join(app.getPath('userData'), 'testdb.sqlite');
    const db = new sqlite3.Database(dbPath);
    await new Promise((resolve, reject) => {
      db.run(
        'CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, time TEXT)',
        err => (err ? reject(err) : resolve(null))
      );
    });
    const now = new Date().toISOString();
    await new Promise((resolve, reject) => {
      db.run('INSERT INTO logs (time) VALUES (?)', [now], err => (err ? reject(err) : resolve(null)));
    });
    db.close();
    return { msg: '写入成功: ' + now };
  } catch (e) {
    return { msg: '写入失败: ' + (e instanceof Error ? e.message : String(e)) };
  }
});
import * as path from 'path';
import * as isDev from 'electron-is-dev';

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  const startUrl = isDev
    ? 'http://localhost:3000'
    : `file://${path.join(__dirname, '../out/index.html')}`;

  mainWindow.loadURL(startUrl);

  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.on('ready', createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});
