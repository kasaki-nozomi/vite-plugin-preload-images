import { Plugin } from 'vite';

interface DirOptions {
    /** 图片文件匹配模式 如: 'src/assets/images/*.{jpg,jpeg,png,svg}' */
    dir: string;
    /** 从 public 目录读取 */
    publicDir: boolean;
}
interface Options {
    /** 图片文件匹配模式 如 'src/assets/images/*.{jpg,jpeg,png,svg}' */
    dirs: string | (string | DirOptions)[];
    /** link 标签的属性配置 rel 默认 prefetch */
    attrs?: {
        rel?: 'preload' | 'prefetch';
        fetchPriority?: 'high' | 'low' | 'auto';
    } & Record<string, string>;
    /** 同时预加载的图片数量 默认 2 */
    batchSize?: number;
    /** 从 public 目录读取 默认 false */
    publicDir?: boolean;
    /** 加载超时时间(ms) 默认 5000 */
    timeout?: number;
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
declare function VitePluginPreloadImages(options: Options): Plugin;

export { type DirOptions, type Options, VitePluginPreloadImages as default };
