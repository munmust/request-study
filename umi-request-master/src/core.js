import Onion from './onion';
import { MapCache, mergeRequestOptions } from './utils';
import addfixInterceptor from './interceptor/addfix';
import fetchMiddleware from './middleware/fetch';
import parseResponseMiddleware from './middleware/parseResponse';
import simplePost from './middleware/simplePost';
import simpleGet from './middleware/simpleGet';

// 初始化全局和内核中间件
const globalMiddlewares = [simplePost, simpleGet, parseResponseMiddleware]; //全局中间件
const coreMiddlewares = [fetchMiddleware]; // 内核中间件

// 洋葱中设置中间件
Onion.globalMiddlewares = globalMiddlewares;
Onion.defaultGlobalMiddlewaresLength = globalMiddlewares.length;
Onion.coreMiddlewares = coreMiddlewares;
Onion.defaultCoreMiddlewaresLength = coreMiddlewares.length;

class Core {
  constructor(initOptions) {
    this.onion = new Onion([]); // 洋葱
    this.fetchIndex = 0; // 【即将废弃】请求中间件位置
    this.mapCache = new MapCache(initOptions); // 对初始配置进行缓存
    this.initOptions = initOptions; // 初始化配置参数
    this.instanceRequestInterceptors = []; // 请求实例拦截器
    this.instanceResponseInterceptors = []; // 响应实例拦截器
  }
  // 旧版拦截器为共享
  static requestInterceptors = [addfixInterceptor]; // 旧请求实例拦截器
  static responseInterceptors = [];// 旧响应实例拦截器

  /**
   * 请求拦截器 默认 { global: true } 兼容旧版本拦截器
   * @param {*} handler 方法函数
   * @param {*} opt option配置项
   */
  static requestUse(handler, opt = { global: true }) {
    // 判断传入的是不是函数
    if (typeof handler !== 'function') throw new TypeError('Interceptor must be function!');
    // 判断global使用旧版的共享拦截器还是新的
    if (opt.global) {
      Core.requestInterceptors.push(handler);
    } else {
      this.instanceRequestInterceptors.push(handler);
    }
  }

  /**
   * 响应拦截器 默认 { global: true } 兼容旧版本拦截器
   * @param {*} handler 方法函数
   * @param {*} opt option配置项
   */
  static responseUse(handler, opt = { global: true }) {
     // 判断传入的是不是函数
    if (typeof handler !== 'function') throw new TypeError('Interceptor must be function!');
    // 判断global使用旧版的共享拦截器还是新的
    if (opt.global) {
      Core.responseInterceptors.push(handler);
    } else {
      this.instanceResponseInterceptors.push(handler);
    }
  }

  /**
   * 注册中间件       
   * @param {*} newMiddleware 新的中间件
   * @param {*} opt 中间件配置
   * @returns 
   */
  use(newMiddleware, opt = { global: false, core: false }) {
    this.onion.use(newMiddleware, opt);
    return this;
  }

  /**
   * 配置项结合 
   * @param {} options 而外的配置项
   */
  extendOptions(options) {
    this.initOptions = mergeRequestOptions(this.initOptions, options);
    // 放入缓存中保存
    this.mapCache.extendOptions(options);
  }

  /**
   * 执行请求前拦截器
   * @param {object:{req,res,cache,responseInterceptors}} ctx 请求的配置
   * @returns 
   */
  dealRequestInterceptors(ctx) {
    const reducer = (p1, p2) =>
      p1.then((ret = {}) => {
        ctx.req.url = ret.url || ctx.req.url;
        ctx.req.options = ret.options || ctx.req.options;
        return p2(ctx.req.url, ctx.req.options);
      });
      // 执行所有请求拦截器
    const allInterceptors = [...Core.requestInterceptors, ...this.instanceRequestInterceptors];
    // 循环执行请求拦截器对url和options处理，请求拦截器基本功能就是对请求的url和options进行处理，拦截器返回的内容基本上就是 {url，options}
    return allInterceptors.reduce(reducer, Promise.resolve()).then((ret = {}) => {
      ctx.req.url = ret.url || ctx.req.url;
      ctx.req.options = ret.options || ctx.req.options;
      return Promise.resolve();
    });
  }

  request(url, options) {
    const { onion } = this;
    const obj = {
      req: { url, options: { ...options, url } },
      res: null,
      cache: this.mapCache,
      responseInterceptors: [...Core.responseInterceptors, ...this.instanceResponseInterceptors],
    };
    if (typeof url !== 'string') {
      throw new Error('url MUST be a string');
    }

    return new Promise((resolve, reject) => {
      // 请求拦截器会比任何中间件早执行
      // 之后执行所有中间件
      // 最后成功返回 object的res
      // 捕获整个流程的错误
      this.dealRequestInterceptors(obj)
        .then(() => onion.execute(obj))
        .then(() => {
          resolve(obj.res);
        })
        .catch(error => {
          // 得到错误处理方法
          const { errorHandler } = obj.req.options;
          // 存在错误处理方法，尝试执行错误处理函数之后将执行之后的值作为成功返回
          if (errorHandler) {
            try {
              const data = errorHandler(error);
              resolve(data);
            } catch (e) {
              reject(e);
            }
          } else {
            reject(error);
          }
        });
    });
  }
}

export default Core;
