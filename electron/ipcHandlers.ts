import { openDb, ensureLogsTable, insertLog, findWordByText, insertWord, insertStudyLog, getWordLogs, getWordNotes } from './db';
import { getBeijingTimeString } from './utils';
import { ipcMain } from 'electron';

export function registerIpcHandlers() {
        // 新增：自定义IPC接口，接收单词参数
        ipcMain.handle('custom-word-ipc', async (event, word: string) => {
            console.log('收到 custom-word-ipc 请求:', word);
            // 这里可以自定义逻辑，比如查库、写库等
            return { status: 'ok', word, msg: `收到单词: ${word}` };
        });
    ipcMain.handle('word-query-record', async (event, word: string) => {
        console.log('收到前端单词查询请求:', word);
        const db = openDb();
        let wordRow = await findWordByText(db, word);
        let word_id: number;
        if (!wordRow) {
            // 单词不存在，插入
            word_id = await insertWord(db, word);
            await insertStudyLog(db, word_id, 'query');
        } else {
            word_id = wordRow.id;
            await insertStudyLog(db, word_id, 'query');
        }
        // 查询所有日志和笔记
        const logs = await getWordLogs(db, word_id);
        const notes = await getWordNotes(db, word_id);
        return { status: 'ok', word_id, logs, notes };
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
