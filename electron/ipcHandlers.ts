import { openDb, ensureLogsTable, insertLog } from './db';
import { getBeijingTimeString } from './utils';
import { ipcMain } from 'electron';

export function registerIpcHandlers() {
    ipcMain.handle('word-query-record', async (event, word: string) => {
        console.log('收到前端单词查询请求:', word);
        // ...其他逻辑...
        return { status: 'ok', msg: `已收到单词: ${word}` };
    });
    ipcMain.handle('create-and-insert-time', async () => {
        try {
            const db = openDb();
            await ensureLogsTable(db);
            const now = getBeijingTimeString();
            await insertLog(db, now);
            return { msg: '写入成功: ' + now };
        } catch (e) {
            return { msg: '写入失败: ' + (e instanceof Error ? e.message : String(e)) };
        }
    });

    // 其他 IPC 逻辑可以继续在这里添加
}
