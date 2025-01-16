import type { Plugin, ResolvedConfig } from 'vite'
import fg from 'fast-glob'

export interface DirOptions {
    /** 图片文件匹配模式 如: 'src/assets/images/*.{jpg,jpeg,png,svg}' */
    dir: string
    /** 从 public 目录读取 */
    publicDir: boolean
}

export interface Options {
    /** 图片文件匹配模式 如 'src/assets/images/*.{jpg,jpeg,png,svg}' */
    dirs: string | (string | DirOptions)[]
    /** link 标签的属性配置 rel 默认 prefetch */
    attrs?: {
        rel?: 'preload' | 'prefetch'
        fetchpriority?: 'high' | 'low' | 'auto'
    } & Record<string, string>
    /** 同时预加载的图片数量 默认 2 */
    batchSize?: number
    /** 从 public 目录读取 默认 false */
    publicDir?: boolean
    /** 加载超时时间(ms) 默认 5000 */
    timeout?: number
}

// 类型守卫
function IsDirOptions(item: string | DirOptions): item is DirOptions {
    return typeof item === 'object' && 'dir' in item && 'publicDir' in item
}

// 配置校验
function validateOptions(options: Options) {
    const errors: string[] = []
    if (!('dirs' in options)) {
        errors.push('Param dirs is required!')
    }
    if ('batchSize' in options && options.batchSize! < 1) {
        errors.push('BatchSize must be greater than 0!')
    }
    if ('timeout' in options && options.timeout! < 1000) {
        errors.push('Timeout must be greater than 1000ms!')
    }
    if (errors.length) {
        throw new Error(`[vite-plugin-preload-images]: ${errors.join(' ')}`)
    }
}

// 缓存 glob 结果
const globCache = new Map<string, string[]>()
function getCachedGlobSync(pattern: string, options = {}) {
    const key = `${pattern}-${JSON.stringify(options)}`
    if (!globCache.has(key)) {
        globCache.set(key, fg.sync(pattern, options))
    }
    return globCache.get(key)
}

/**
 * Vite 图片预加载插件
 *
 * 预加载指定目录下的图片资源
 * 可配置预加载并发数，避免占用过多浏览器请求
 * 支持开发环境和生产环境
 * 支持 public 目录和 assets 目录的图片
 * 可自定义 link 标签属性
 *
 * @param {Options} options - 插件配置项
 * @param {string} options.dirs - 图片文件匹配模式
 * @param {Object} [options.attrs] - link 标签属性配置
 * @param {number} [options.batchSize=2] - 同时预加载的图片数量
 * @param {boolean} [options.publicDir=false] - 是否从 public 目录读取图片
 * @param {number} [options.timeout=5000] - 加载图片超时时间(ms)
 *
 * @example
 * ```ts
 * VitePluginPreloadImages({
 *     dirs: 'src/assets/images/*.{jpg,png,svg}',
 *     attrs: {
 *         rel: 'prefetch'
 *     }
 * })
 *
 * VitePluginPreloadImages({
 *     dirs: [
 *         'preload/images/*.{jpg,png,svg}',
 *         'preload/icons/*.{jpg,png,svg}',
 *     ],
 *     attrs: {
 *         rel: 'prefetch'
 *     },
 *     publicDir: true
 * })
 *
 * VitePluginPreloadImages({
 *     dirs: [
 *         {
 *             dir: 'preload/images/*.{jpg,png,svg}',
 *             publicDir: true
 *         },
 *         {
 *             dir: 'src/assets/images/*.{jpg,png,svg}',
 *             publicDir: false
 *         },
 *         'src/assets/icons/*.{jpg,png,svg}'
 *     ],
 *     attrs: {
 *         rel: 'prefetch',
 *         crossorigin: 'anonymous',
 *         fetchpriority: 'low'
 *     },
 *     batchSize: 2,
 *     publicDir: false,
 *     timeout: 5000
 * })
 * ```
 *
 * @returns {Plugin} Vite 插件实例
 */
export default function VitePluginPreloadImages(options: Options): Plugin {
    // 校验配置
    validateOptions(options)

    const { dirs, attrs = {}, batchSize = 2, publicDir = false, timeout = 5000 } = options

    // 存储生产环境下的资源路径
    let assets: string[] = []
    // 最终解析的配置
    let config: ResolvedConfig

    return {
        name: 'vite-plugin-preload-images',

        configResolved(resolvedConfig) {
            config = resolvedConfig
        },

        // 生产环境下收集打包后的图片路径
        generateBundle(_, bundle) {
            const bundles = Object.values(bundle)

            if (typeof dirs === 'string') {
                if (!publicDir) {
                    const files = getCachedGlobSync(dirs)
                    bundles.forEach((item) => {
                        if (files?.includes(Reflect.get(item, 'originalFileName'))) {
                            assets.push(item.fileName)
                        }
                    })
                }
            } else if (Array.isArray(dirs)) {
                dirs.forEach((item) => {
                    if (typeof item === 'string' && !publicDir) {
                        const files = getCachedGlobSync(item)
                        bundles.forEach((bundle) => {
                            if (files?.includes(Reflect.get(bundle, 'originalFileName'))) {
                                assets.push(bundle.fileName)
                            }
                        })
                    } else if (IsDirOptions(item) && !item.publicDir) {
                        const files = getCachedGlobSync(item.dir)
                        bundles.forEach((bundle) => {
                            if (files?.includes(Reflect.get(bundle, 'originalFileName'))) {
                                assets.push(bundle.fileName)
                            }
                        })
                    }
                })
            }
        },

        // 转换 HTML 注入预加载脚本
        transformIndexHtml(_, ctx) {
            let images: string[] = []

            // 开发环境 | 生产环境
            if (ctx.server) {
                if (typeof dirs === 'string') {
                    const globResult = getCachedGlobSync(dirs, publicDir ? { cwd: config.publicDir } : {})
                    if (globResult) {
                        images = globResult
                    }
                } else if (Array.isArray(dirs)) {
                    dirs.forEach((item) => {
                        if (typeof item === 'string') {
                            if (publicDir && !config.publicDir) return
                            const files = getCachedGlobSync(item, publicDir ? { cwd: config.publicDir } : {})
                            if (files) {
                                images.push(...files)
                            }
                        } else if (IsDirOptions(item)) {
                            if (item.publicDir && !config.publicDir) return
                            const files = getCachedGlobSync(item.dir, item.publicDir ? { cwd: config.publicDir } : {})
                            if (files) {
                                images.push(...files)
                            }
                        }
                    })
                }
            } else {
                if (typeof dirs === 'string') {
                    if (publicDir && config.publicDir) {
                        const files = getCachedGlobSync(dirs, { cwd: config.publicDir })
                        if (files) {
                            images.push(...files)
                        }
                    }
                } else if (Array.isArray(dirs)) {
                    dirs.forEach((item) => {
                        if (typeof item === 'string' && publicDir && config.publicDir) {
                            const files = getCachedGlobSync(item, { cwd: config.publicDir })
                            if (files) {
                                images.push(...files)
                            }
                        }
                        if (IsDirOptions(item) && item.publicDir && config.publicDir) {
                            const files = getCachedGlobSync(item.dir, { cwd: config.publicDir })
                            if (files) {
                                images.push(...files)
                            }
                        }
                    })
                }
                images.push(...assets)
            }
            images = Array.from(new Set(images))

            // 预加载脚本
            const script = `
                (function() {
                    const images = ${JSON.stringify(images)}
                    const loadImage = (src) => {
                        if (!src) return Promise.resolve()
                        return new Promise((resolve, reject) => {
                            const link = document.createElement('link')
                            link.as = 'image'
                            link.href = src
                            link.rel = '${attrs.rel || 'prefetch'}'
                            link.fetchpriority = '${attrs.fetchpriority || 'low'}'
                            ${Object.entries(attrs)
                                .filter(([key]) => !['as', 'href', 'rel', 'fetchpriority'].includes(key))
                                .map(([key, value]) => `link.${key} = '${value}'`)
                                .join(`
                            `)}
                            link.onload = resolve
                            link.onerror = () => {
                                console.warn('[vite-plugin-preload-images] Failed to preload:', src)
                                resolve()
                            }
                            
                            setTimeout(() => {
                                console.warn('[vite-plugin-preload-images] Timeout preloading:', src)
                                resolve()
                            }, ${timeout})
                            
                            document.head.appendChild(link)
                        })
                    }

                    const loadImages = async () => {
                        while (images.length) {
                            try {
                                await loadImage(images.shift())
                            } catch (error) {
                                console.error('[vite-plugin-preload-images] Error:', error)
                            }
                        }
                    }

                    Promise.all(Array.from({ length: ${batchSize} }, loadImages))
                })()
            `

            return [
                {
                    tag: 'script',
                    injectTo: 'head',
                    children: script
                }
            ]
        }
    }
} 