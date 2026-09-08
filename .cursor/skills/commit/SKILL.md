---
name: commit
description: 用中文提交说明创建 git commit。用户执行 /commit 或要求用中文日志提交时使用。
disable-model-invocation: true
---

# Commit

提交 commit，提交日志写中文。

## 步骤

1. 只暂存本次相关文件，不要加入密钥、`.env`、数据库文件（如 `data/`、`*.db`）
2. 用中文写 1 句提交说明，说明为什么改，并沿用该仓库已有风格
3. 提交后执行 `git status` 确认成功
4. 不要 push
