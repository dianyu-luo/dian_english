import { app, BrowserWindow, ipcMain } from 'electron';
// 新增：单词查询记录接口（仅定义，暂不实现具体逻辑）
ipcMain.handle('word-query-record', async (event, word: string) => {
  console.log('收到前端单词查询请求:', word);
  // ...其他逻辑...
  return { status: 'ok', msg: `已收到单词: ${word}` };
});
import { openDb, closeDb, ensureLogsTable, insertLog } from './db';
import { getBeijingTimeString } from './utils';
// 监听渲染进程请求，创建数据库并插入当前时间
ipcMain.handle('create-and-insert-time', async () => {
  try {
    const db = openDb();
    await ensureLogsTable(db);
    // 获取北京时间（东八区）字符串
    const now = getBeijingTimeString();
    await insertLog(db, now);
    // 不主动关闭数据库，保持单例连接
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
