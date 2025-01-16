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
        fetchPriority?: 'high' | 'low' | 'auto'
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
    if (!options.dirs) {
        errors.push('Param dirs is required!')
    } else if (typeof options.dirs !== 'string' && !Array.isArray(options.dirs)) {
        errors.push('Param dirs must be string or array!')
    } else if (Array.isArray(options.dirs)) {
        options.dirs.forEach((item, index) => {
            if (typeof item === 'string') {
                if (!item.trim()) errors.push(`Param dirs[${index}] cannot be empty string!`)
            } else if (!IsDirOptions(item)) {
                errors.push(`Param dirs[${index}] must be have dir and publicDir property!`)
            }
        })
    }
    if ('batchSize' in options && (typeof options.batchSize !== 'number' || options.batchSize! < 1)) {
        errors.push('BatchSize must be number and greater than 0!')
    }
    if ('timeout' in options && (typeof options.timeout !== 'number' || options.timeout! < 1000)) {
        errors.push('Timeout must be number and greater than 1000!')
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

// 匹配文件
function matchBundleWithFiles(bundle: any, files: string[] | undefined) {
    if (!files) return false
    // rollup 版本 4.20.0（vite 版本 5.4.2）及以上有 originalFileName 属性
    if (Reflect.get(bundle, 'originalFileName')) {
        return files.includes(Reflect.get(bundle, 'originalFileName'))
    } else {
        return files.some((file) => file.includes(bundle.name!))
    }
}

// 收集匹配的文件名
function collectMatchedFiles(pattern: string, bundles: any[], options = {}) {
    const matchedFiles: string[] = []
    const files = getCachedGlobSync(pattern, options)
    bundles.forEach((bundle) => {
        if (matchBundleWithFiles(bundle, files)) {
            matchedFiles.push(bundle.fileName)
        }
    })
    return matchedFiles
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
 * 开发环境下会处理文件夹下所有匹配到的资源
 * 生产环境仅处理被打包处理的资源
 *
 * 非 public 目录下 rollup 版本 4.20.0（vite 版本 5.4.2）及以上为精准匹配（originalFileName）预加载图片
 * 否则，指定文件夹外的其他被打包处理的同名的资源也会被预加载
 *
 * @param {Options} options - 插件配置项
 * @param {string | (string | DirOptions)[]} options.dirs - 图片文件匹配模式
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
 *         fetchPriority: 'low'
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
                    assets.push(...collectMatchedFiles(dirs, bundles))
                }
            } else if (Array.isArray(dirs)) {
                dirs.forEach((item) => {
                    if (typeof item === 'string' && !publicDir) {
                        assets.push(...collectMatchedFiles(item, bundles))
                    } else if (IsDirOptions(item) && !item.publicDir) {
                        assets.push(...collectMatchedFiles(item.dir, bundles))
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
                    const files = getCachedGlobSync(dirs, publicDir ? { cwd: config.publicDir } : {})
                    if (files) images.push(...files)
                } else if (Array.isArray(dirs)) {
                    dirs.forEach((item) => {
                        if (typeof item === 'string') {
                            if (publicDir && !config.publicDir) return
                            const files = getCachedGlobSync(item, publicDir ? { cwd: config.publicDir } : {})
                            if (files) images.push(...files)
                        } else if (IsDirOptions(item)) {
                            if (item.publicDir && !config.publicDir) return
                            const files = getCachedGlobSync(item.dir, item.publicDir ? { cwd: config.publicDir } : {})
                            if (files) images.push(...files)
                        }
                    })
                }
            } else {
                if (typeof dirs === 'string') {
                    if (publicDir && config.publicDir) {
                        const files = getCachedGlobSync(dirs, { cwd: config.publicDir })
                        if (files) images.push(...files)
                    }
                } else if (Array.isArray(dirs)) {
                    dirs.forEach((item) => {
                        if (typeof item === 'string' && publicDir && config.publicDir) {
                            const files = getCachedGlobSync(item, { cwd: config.publicDir })
                            if (files) images.push(...files)
                        }
                        if (IsDirOptions(item) && item.publicDir && config.publicDir) {
                            const files = getCachedGlobSync(item.dir, { cwd: config.publicDir })
                            if (files) images.push(...files)
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
                            link.fetchPriority = '${attrs.fetchPriority || 'low'}'
                            ${Object.entries(attrs)
                                .filter(([key]) => !['as', 'href', 'rel', 'fetchPriority'].includes(key))
                                .map(([key, value]) => `link.${key} = '${value}'`)
                                .join(`
                            `)}
                            document.head.appendChild(link)
                            
                            const timeoutId = setTimeout(() => {
                                console.warn('[vite-plugin-preload-images] Timeout preloading:', src)
                                reject()
                            }, ${timeout})

                            link.onload = () => {
                                clearTimeout(timeoutId)
                                resolve()
                            }
                            
                            link.onerror = () => {
                                clearTimeout(timeoutId)
                                console.warn('[vite-plugin-preload-images] Failed to preload:', src)
                                reject()
                            } 
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
