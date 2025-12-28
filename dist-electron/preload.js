"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
// 在这里可以暴露安全的 API 给渲染进程
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    createAndInsertTime: () => electron_1.ipcRenderer.invoke('create-and-insert-time'),
});
