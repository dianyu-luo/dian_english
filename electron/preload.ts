import { contextBridge } from 'electron';

// 在这里可以暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // 添加你需要的 API
});
