<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/logo-dark.svg">
    <img src="public/logo.svg" width="72" height="72" alt="M8541">
  </picture>
</p>

# M8541

一个致敬初代 iPod 的 React 播放器组件，复刻了 Apple Music 官网为 iPod 25 周年添加的 404 页面彩蛋。演示页面使用 Astro 构建，并部署在 GitHub Pages 上。

## 使用

构建组件包：

```sh
npm ci
npm run build
```

构建完成后，可以在其他本地 React 项目中通过目录依赖使用组件：

```sh
npm install ../m8541 react react-dom
```

然后导入组件和样式：

```jsx
import { M8541 } from "m8541";
import "m8541/style.css";

<M8541 catalogUrl="/catalog.json" />
```

曲库数据由使用方提供，`catalogUrl` 指向包含 `songs`、`artists` 和 `playlists` 的 JSON 文件。仓库中的 [`public/catalog.json`](public/catalog.json) 可作为格式参考。

## 开发

```sh
npm ci
npm run dev
```

常用检查命令：

```sh
npm test
npm run check
npm run build
npm run build:demo
```

`npm run build` 构建 React 组件包，`npm run build:demo` 构建 Astro 演示页面。GitHub Actions 会在推送后运行检查并部署演示页面。

## 许可

项目源码采用 [MIT License](LICENSE)，ChicagoKare 字体遵循其附带的 [MIT License](src/assets/fonts/LICENSE)。Apple、Apple Music、iPod 等商标及相关素材归各自权利人所有；本项目是非官方复刻，与 Apple Inc. 无关联，也未获其授权或认可。
