"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => VitePluginPreloadImages
});
module.exports = __toCommonJS(index_exports);
var import_fast_glob = __toESM(require("fast-glob"));
function IsDirOptions(item) {
  return typeof item === "object" && "dir" in item && "publicDir" in item;
}
function validateOptions(options) {
  const errors = [];
  if (!("dirs" in options)) {
    errors.push("Param dirs is required!");
  }
  if ("batchSize" in options && options.batchSize < 1) {
    errors.push("BatchSize must be greater than 0!");
  }
  if ("timeout" in options && options.timeout < 1e3) {
    errors.push("Timeout must be greater than 1000ms!");
  }
  if (errors.length) {
    throw new Error(`[vite-plugin-preload-images]: ${errors.join(" ")}`);
  }
}
var globCache = /* @__PURE__ */ new Map();
function getCachedGlobSync(pattern, options = {}) {
  const key = `${pattern}-${JSON.stringify(options)}`;
  if (!globCache.has(key)) {
    globCache.set(key, import_fast_glob.default.sync(pattern, options));
  }
  return globCache.get(key);
}
function VitePluginPreloadImages(options) {
  validateOptions(options);
  const { dirs, attrs = {}, batchSize = 2, publicDir = false, timeout = 5e3 } = options;
  let assets = [];
  let config;
  return {
    name: "vite-plugin-preload-images",
    configResolved(resolvedConfig) {
      config = resolvedConfig;
    },
    // 生产环境下收集打包后的图片路径
    generateBundle(_, bundle) {
      const bundles = Object.values(bundle);
      if (typeof dirs === "string") {
        if (!publicDir) {
          const files = getCachedGlobSync(dirs);
          bundles.forEach((item) => {
            if (files?.includes(Reflect.get(item, "originalFileName"))) {
              assets.push(item.fileName);
            }
          });
        }
      } else if (Array.isArray(dirs)) {
        dirs.forEach((item) => {
          if (typeof item === "string" && !publicDir) {
            const files = getCachedGlobSync(item);
            bundles.forEach((bundle2) => {
              if (files?.includes(Reflect.get(bundle2, "originalFileName"))) {
                assets.push(bundle2.fileName);
              }
            });
          } else if (IsDirOptions(item) && !item.publicDir) {
            const files = getCachedGlobSync(item.dir);
            bundles.forEach((bundle2) => {
              if (files?.includes(Reflect.get(bundle2, "originalFileName"))) {
                assets.push(bundle2.fileName);
              }
            });
          }
        });
      }
    },
    // 转换 HTML 注入预加载脚本
    transformIndexHtml(_, ctx) {
      let images = [];
      if (ctx.server) {
        if (typeof dirs === "string") {
          const globResult = getCachedGlobSync(dirs, publicDir ? { cwd: config.publicDir } : {});
          if (globResult) {
            images = globResult;
          }
        } else if (Array.isArray(dirs)) {
          dirs.forEach((item) => {
            if (typeof item === "string") {
              if (publicDir && !config.publicDir) return;
              const files = getCachedGlobSync(item, publicDir ? { cwd: config.publicDir } : {});
              if (files) {
                images.push(...files);
              }
            } else if (IsDirOptions(item)) {
              if (item.publicDir && !config.publicDir) return;
              const files = getCachedGlobSync(item.dir, item.publicDir ? { cwd: config.publicDir } : {});
              if (files) {
                images.push(...files);
              }
            }
          });
        }
      } else {
        if (typeof dirs === "string") {
          if (publicDir && config.publicDir) {
            const files = getCachedGlobSync(dirs, { cwd: config.publicDir });
            if (files) {
              images.push(...files);
            }
          }
        } else if (Array.isArray(dirs)) {
          dirs.forEach((item) => {
            if (typeof item === "string" && publicDir && config.publicDir) {
              const files = getCachedGlobSync(item, { cwd: config.publicDir });
              if (files) {
                images.push(...files);
              }
            }
            if (IsDirOptions(item) && item.publicDir && config.publicDir) {
              const files = getCachedGlobSync(item.dir, { cwd: config.publicDir });
              if (files) {
                images.push(...files);
              }
            }
          });
        }
        images.push(...assets);
      }
      images = Array.from(new Set(images));
      const script = `
                (function() {
                    const images = ${JSON.stringify(images)}
                    const loadImage = (src) => {
                        if (!src) return Promise.resolve()
                        return new Promise((resolve, reject) => {
                            const link = document.createElement('link')
                            link.as = 'image'
                            link.href = src
                            link.rel = '${attrs.rel || "prefetch"}'
                            link.fetchpriority = '${attrs.fetchpriority || "low"}'
                            ${Object.entries(attrs).filter(([key]) => !["as", "href", "rel", "fetchpriority"].includes(key)).map(([key, value]) => `link.${key} = '${value}'`).join(`
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
            `;
      return [
        {
          tag: "script",
          injectTo: "head",
          children: script
        }
      ];
    }
  };
}
