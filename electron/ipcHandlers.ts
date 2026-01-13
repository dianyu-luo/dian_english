import { openDb, ensureLogsTable, ensureTables, insertLog, findWordByText, insertWord, insertStudyLog, getWordLogs, getWordNotes, createNote, updateNote, deleteNote } from './db';
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
        try {
            const db = openDb();
            // 确保表存在
            await ensureTables(db);
            
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
            
            // 查询笔记（包含编辑历史）
            const notes = await getWordNotes(db, word_id);
            
            // 如果没有笔记，创建一个空笔记
            if (notes.length === 0) {
                await createNote(db, word_id, '');
                // 重新查询
                const newNotes = await getWordNotes(db, word_id);
                return { word_id, notes: newNotes };
            }
            
            // 按照接口文档格式返回（同时返回 word_id 供前端使用）
            return { word_id, notes };
        } catch (error) {
            console.error('word-query-record 错误:', error);
            return { notes: [] };
        }
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

    // 创建笔记接口
    ipcMain.handle('create-note', async (event, wordId: number, content: string) => {
        try {
            const db = openDb();
            await ensureTables(db);
            const noteId = await createNote(db, wordId, content);
            // 重新查询返回更新后的笔记列表
            const notes = await getWordNotes(db, wordId);
            return { notes };
        } catch (error) {
            console.error('create-note 错误:', error);
            return { notes: [] };
        }
    });

    // 更新笔记接口
    ipcMain.handle('update-note', async (event, wordId: number, noteId: number, content: string) => {
        try {
            const db = openDb();
            await ensureTables(db);
            await updateNote(db, noteId, content);
            // 重新查询返回更新后的笔记列表
            const notes = await getWordNotes(db, wordId);
            return { notes };
        } catch (error) {
            console.error('update-note 错误:', error);
            return { notes: [] };
        }
    });

    // 删除笔记接口
    ipcMain.handle('delete-note', async (event, wordId: number, noteId: number) => {
        try {
            const db = openDb();
            await ensureTables(db);
            await deleteNote(db, noteId);
            // 重新查询返回更新后的笔记列表
            const notes = await getWordNotes(db, wordId);
            return { notes };
        } catch (error) {
            console.error('delete-note 错误:', error);
            return { notes: [] };
        }
    });

    // 其他 IPC 逻辑可以继续在这里添加
}
