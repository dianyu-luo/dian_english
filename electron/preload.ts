import { contextBridge, ipcRenderer } from 'electron';

// 在这里可以暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  createAndInsertTime: () => ipcRenderer.invoke('create-and-insert-time'),
  wordQueryRecord: (word: string) => ipcRenderer.invoke('word-query-record', word),
  createNote: (wordId: number, content: string) => ipcRenderer.invoke('create-note', wordId, content),
  updateNote: (wordId: number, noteId: number, content: string) => ipcRenderer.invoke('update-note', wordId, noteId, content),
  deleteNote: (wordId: number, noteId: number) => ipcRenderer.invoke('delete-note', wordId, noteId),
});
