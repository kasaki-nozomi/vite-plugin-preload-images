// src/index.ts
import fg from "fast-glob";
function IsDirOptions(item) {
  return typeof item === "object" && "dir" in item && "publicDir" in item;
}
function validateOptions(options) {
  const errors = [];
  if (!options.dirs) {
    errors.push("Param dirs is required!");
  } else if (typeof options.dirs !== "string" && !Array.isArray(options.dirs)) {
    errors.push("Param dirs must be string or array!");
  } else if (Array.isArray(options.dirs)) {
    options.dirs.forEach((item, index) => {
      if (typeof item === "string") {
        if (!item.trim()) errors.push(`Param dirs[${index}] cannot be empty string!`);
      } else if (IsDirOptions(item)) {
        if (!item.dir.trim()) {
          errors.push(`Param dirs[${index}] must be have dir property!`);
        }
        if (typeof item.publicDir !== "boolean") {
          errors.push(`Param dirs[${index}].publicDir must be boolean!`);
        }
      } else {
        errors.push(`Param dirs[${index}] must be string or object!`);
      }
    });
  }
  if ("batchSize" in options && (typeof options.batchSize !== "number" || options.batchSize < 1)) {
    errors.push("BatchSize must be number and greater than 0!");
  }
  if ("publicDir" in options && typeof options.publicDir !== "boolean") {
    errors.push("PublicDir must be boolean!");
  }
  if ("timeout" in options && (typeof options.timeout !== "number" || options.timeout < 1e3)) {
    errors.push("Timeout must be number and greater than 1000!");
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
function matchBundleWithFiles(bundle, files) {
  if (!files) return false;
  if (Reflect.get(bundle, "originalFileName")) {
    return files.includes(Reflect.get(bundle, "originalFileName"));
  } else {
    return files.some((file) => file.includes(bundle.name));
  }
}
function collectMatchedFiles(pattern, bundles, options = {}) {
  const matchedFiles = [];
  const files = getCachedGlobSync(pattern, options);
  bundles.forEach((bundle) => {
    if (matchBundleWithFiles(bundle, files)) {
      matchedFiles.push(bundle.fileName);
    }
  });
  return matchedFiles;
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
          assets.push(...collectMatchedFiles(dirs, bundles));
        }
      } else if (Array.isArray(dirs)) {
        dirs.forEach((item) => {
          if (typeof item === "string" && !publicDir) {
            assets.push(...collectMatchedFiles(item, bundles));
          } else if (IsDirOptions(item) && !item.publicDir) {
            assets.push(...collectMatchedFiles(item.dir, bundles));
          }
        });
      }
    },
    // 转换 HTML 注入预加载脚本
    transformIndexHtml(_, ctx) {
      let images = [];
      if (ctx.server) {
        if (typeof dirs === "string") {
          const files = getCachedGlobSync(dirs, publicDir ? { cwd: config.publicDir } : {});
          if (files) images.push(...files);
        } else if (Array.isArray(dirs)) {
          dirs.forEach((item) => {
            if (typeof item === "string") {
              if (publicDir && !config.publicDir) return;
              const files = getCachedGlobSync(item, publicDir ? { cwd: config.publicDir } : {});
              if (files) images.push(...files);
            } else if (IsDirOptions(item)) {
              if (item.publicDir && !config.publicDir) return;
              const files = getCachedGlobSync(item.dir, item.publicDir ? { cwd: config.publicDir } : {});
              if (files) images.push(...files);
            }
          });
        }
      } else {
        if (typeof dirs === "string") {
          if (publicDir && config.publicDir) {
            const files = getCachedGlobSync(dirs, { cwd: config.publicDir });
            if (files) images.push(...files);
          }
        } else if (Array.isArray(dirs)) {
          dirs.forEach((item) => {
            if (typeof item === "string" && publicDir && config.publicDir) {
              const files = getCachedGlobSync(item, { cwd: config.publicDir });
              if (files) images.push(...files);
            }
            if (IsDirOptions(item) && item.publicDir && config.publicDir) {
              const files = getCachedGlobSync(item.dir, { cwd: config.publicDir });
              if (files) images.push(...files);
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
