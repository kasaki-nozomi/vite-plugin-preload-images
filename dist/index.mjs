// src/index.ts
import fg from "fast-glob";
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
    globCache.set(key, fg.sync(pattern, options));
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
                            link.fetchPriority = '${attrs.fetchPriority || "low"}'
                            ${Object.entries(attrs).filter(([key]) => !["as", "href", "rel", "fetchPriority"].includes(key)).map(([key, value]) => `link.${key} = '${value}'`).join(`
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
export {
  VitePluginPreloadImages as default
};
