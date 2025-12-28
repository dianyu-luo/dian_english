"use client";
import React, { useState } from "react";
import { Tabs, Button, ConfigProvider, message } from "antd";
import zhCN from 'antd/locale/zh_CN';
import "antd/dist/reset.css";

const tabItems = [
  {
    key: "home",
    label: "首页",
    children: (
      <div>
        欢迎来到测试页面！
        <div style={{ marginTop: 16 }}>
          <Button
            type="primary"
            onClick={async () => {
              try {
                // @ts-ignore
                const res = await window.electronAPI?.createAndInsertTime?.();
                message.success(res?.msg || '操作成功');
              } catch (e) {
                message.error('操作失败');
              }
            }}
          >
            点击我
          </Button>
        </div>
      </div>
    ),
  },
  {
    key: "feature1",
    label: "功能一",
    children: <div>这里是功能一的内容。</div>,
  },
  {
    key: "feature2",
    label: "功能二",
    children: <div>这里是功能二的内容。</div>,
  },
];

export default function TestPage() {
  const [activeKey, setActiveKey] = useState("home");
  return (
    <ConfigProvider locale={zhCN}>
      <div
        style={{
          width: "100%",
          maxWidth: 1200,
          minWidth: 360,
          margin: "40px auto",
          background: "#fff",
          borderRadius: 16,
          boxShadow: "0 4px 24px #0001",
          padding: 32,
          minHeight: "60vh",
          boxSizing: "border-box",
        }}
      >
        <h2 style={{ textAlign: "center", marginBottom: 32, fontSize: 32, fontWeight: 800 }}>
          测试 Tab 页面
        </h2>
        <div style={{ width: '100%', minHeight: 200 }}>
          <Tabs
            activeKey={activeKey}
            onChange={setActiveKey}
            centered
            size="large"
            items={tabItems}
            style={{ width: '100%' }}
          />
        </div>
      </div>
    </ConfigProvider>
  );
}
