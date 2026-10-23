# 公开发布范围

Token Lab 的公开仓库只包含可独立运行的浏览器端模拟器、测试、文档、设计源文件和必要的展示图片。

## 纳入公开仓库

- `src/`、`public/`、`index.html` 与 Vite 配置：应用源码和静态资源。
- `design/`、`design.html` 与 `docs/`：设计源文件、使用文档和必要的展示截图。
- `package.json`、`package-lock.json`、`.github/`、`LICENSE` 与项目说明：安装、授权和自动检查配置。

## 不纳入公开仓库

- `node_modules/`、`dist/`、`output/`：依赖目录和可再生构建产物。
- `.playwright-cli/`、测试日志、页面快照、请求记录和临时会话文件。
- 任何环境变量、凭据、内部服务地址或公司部署配置。

## 历史发布注意事项

当前工作区的旧 Git 历史包含内部依赖源和部署提交。公开 GitHub 仓库应从经过清理的公开提交开始，或在推送前使用历史清理工具移除内部配置；不要直接把完整内部历史推送到公开仓库。当前 GitHub 地址为 <https://github.com/zhangHongEn/token-lab>。
