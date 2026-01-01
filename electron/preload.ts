import { contextBridge, ipcRenderer } from 'electron';

// 在这里可以暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  createAndInsertTime: () => ipcRenderer.invoke('create-and-insert-time'),
  wordQueryRecord: (word: string) => ipcRenderer.invoke('word-query-record', word),
});
