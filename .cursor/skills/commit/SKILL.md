---
name: commit
description: Creates git commits with Chinese commit messages. Use when the user runs /commit or asks to commit with a Chinese log.
disable-model-invocation: true
---

# Commit

提交commit ，提交日志写中文，

## 步骤

1. 只暂存本次相关文件，不要加入密钥、`.env`、数据库文件
2. 用中文写 1 句提交说明，说明为什么改，并沿用该仓库已有风格
3. 提交后执行 `git status` 确认成功
4. 不要 push

本工作区常见仓库：`xhj-py`、`xhj-front`。有改动的都要提交。
