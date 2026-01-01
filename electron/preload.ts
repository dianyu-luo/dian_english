import { contextBridge, ipcRenderer } from 'electron';

// 在这里可以暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electronAPI', {
  createAndInsertTime111: () => ipcRenderer.invoke('create-and-insert-time'),
});
