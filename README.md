# vite-plugin-preload-images

Vite Plugin: Preload Images

## Installation

```bash
npm install vite-plugin-preload-images -D
pnpm add vite-plugin-preload-images -D
```

## Usage

```typescript
import { defineConfig } from 'vite'
import VitePluginPreloadImages from 'vite-plugin-preload-images'

export default defineConfig({
    plugins: [
        VitePluginPreloadImages({
            dirs: 'src/assets/images/*.{jpg,png,svg}',
            attrs: {
                rel: 'prefetch'
            }
        })
    ]
})
```

## Options

| 选项 | 类型 | 默认值 | 描述 |
|------|------|--------|------|
| dirs | string \| (string \| DirOptions)[] | - | 图片文件匹配模式 |
| attrs | Object | - | link 标签属性配置 |
| batchSize | number | 2 | 同时预加载的图片数量 |
| publicDir | boolean | false | 是否从 public 目录读取 |
| timeout | number | 5000 | 加载超时时间(ms) |

## Examples

```typescript
VitePluginImagePreload({
    dirs: 'src/assets/images/*.{jpg,png,svg}',
    attrs: {
        rel: 'prefetch'
    }
})
```

```typescript
VitePluginImagePreload({
    dirs: [
        'preload/images/*.{jpg,png,svg}',
        'preload/icons/*.{jpg,png,svg}',
    ],
    attrs: {
        rel: 'prefetch'
    },
    publicDir: true
})
```

```typescript
VitePluginImagePreload({
    dirs: [
        {
            dir: 'preload/images/*.{jpg,png,svg}',
            publicDir: true
        },
        {
            dir: 'src/assets/images/*.{jpg,png,svg}',
            publicDir: false
        },
        'src/assets/icons/*.{jpg,png,svg}'
    ],
    attrs: {
        rel: 'prefetch',
        crossorigin: 'anonymous',
        fetchpriority: 'low'
    },
    batchSize: 2,
    publicDir: false,
    timeout: 5000
})
```
