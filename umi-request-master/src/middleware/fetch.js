import 'isomorphic-fetch';
import { timeout2Throw, cancel2Throw, getEnv } from '../utils';

// 是否已经警告过
let warnedCoreType = false;

// 默认缓存判断，开放缓存判断给非 get 请求使用
function __defaultValidateCache(url, options) {
  const { method = 'get' } = options;
  return method.toLowerCase() === 'get';
}
/**
 * 
 * @param {*} ctx 参数
 * @param {*} next 下一个函数
 * @returns 
 */
export default function fetchMiddleware(ctx, next) {
  if (!ctx) return next();
  const { req: { options = {}, url = '' } = {}, cache, responseInterceptors } = ctx;
  const {
    timeout = 0, 
    timeoutMessage, // 超时提示
    __umiRequestCoreType__ = 'normal',
    useCache = false, // 使用缓存
    method = 'get', // 请求方法
    params, // 参数 
    ttl, // 时间
    validateCache = __defaultValidateCache, 
  } = options;

  if (__umiRequestCoreType__ !== 'normal') {
    if (process && process.env && process.env.NODE_ENV === 'development' && warnedCoreType === false) {
      warnedCoreType = true;
      console.warn(
        '__umiRequestCoreType__ is a internal property that use in umi-request, change its value would affect the behavior of request! It only use when you want to extend or use request core.'
      );
    }
    return next();
  }

  // 定义adapter为fetch
  const adapter = fetch;
  /**
   * fetch
   * es自带的获取资源的接口（包括跨域请求）
   * fetch() 返回的 Promise 不会被标记为 reject， 
   * 即使响应的 HTTP 状态码是 404 或 500。相反，它会将 Promise 状态标记为 resolve （但是会将 resolve 的返回值的 ok 属性设置为 false ），
   * 仅当网络故障时或请求被阻止时，才会标记为 reject
   * fetch 不会发送 cookies。除非你使用了credentials 的初始化选项
   * OPTIONS：
   * body: JSON.stringify(data), // must match 'Content-Type' header
   * cache: 'no-cache', // *default, no-cache, reload, force-cache, only-if-cached
   * credentials: 'same-origin', // include, same-origin, *omit
   * headers: {
   *    'user-agent': 'Mozilla/4.0 MDN Example',
   *    'content-type': 'application/json'
   * },
   * method: 'POST', // *GET, POST, PUT, DELETE, etc.
   * mode: 'cors', // no-cors, cors, *same-origin
   * redirect: 'follow', // manual, *follow, error
   * referrer: 'no-referrer', // *client, no-referrer
   * RESPONSE：
   * response.status —— response 的 HTTP 状态码，
   * response.ok —— HTTP 状态码为 200-299，则为 true。
   * response.headers —— 类似于 Map 的带有 HTTP header 的对象。
   * 获取body：
   * response.text() —— 读取 response，并以文本形式返回 response，
   * response.json() —— 将 response 解析为 JSON 对象形式，
   * response.formData() —— 以 FormData 对象（form/multipart 编码，参见下一章）的形式返回 response，
   * response.blob() —— 以 Blob（具有类型的二进制数据）形式返回 response，
   * response.arrayBuffer() —— 以 ArrayBuffer（低级别的二进制数据）形式返回 response。
   */

  // 判断是否支持fetch
  if (!adapter) {
    throw new Error('Global fetch not exist!');
  }

  // 从缓存池检查是否有缓存数据
  const isBrowser = getEnv() === 'BROWSER'; // 得到当前运行环境
  const needCache = validateCache(url, options) && useCache && isBrowser; // get请求、需要缓存、在溜浏览器环境 是否需要缓存
  // 使用缓存
  if (needCache) {
    // 获取缓存的url、params和method
    let responseCache = cache.get({
      url,
      params,
      method,
    });
    // 在缓存中获取到，将会将缓存数据当作res直接返回
    if (responseCache) {
      responseCache = responseCache.clone();
      responseCache.useCache = true;
      ctx.res = responseCache;
      return next();
    }
  }

  let response;
  // 超时处理、取消请求处理
  if (timeout > 0) {
    // 超时情况
    response = Promise.race([cancel2Throw(options, ctx), adapter(url, options), timeout2Throw(timeout, timeoutMessage, ctx.req)]);
  } else {
    // 正常请求
    response = Promise.race([cancel2Throw(options, ctx), adapter(url, options)]);
  }

  // 兼容老版本 response.interceptor
  // 响应拦截器
  responseInterceptors.forEach(handler => {
    response = response.then(res => {
      // Fix multiple clones not working, issue: https://github.com/github/fetch/issues/504
      let clonedRes = typeof res.clone === 'function' ? res.clone() : res;
      return handler(clonedRes, options);
    });
  });

  return response.then(res => {
    // 是否存入缓存池
    if (needCache) {
      if (res.status === 200) {
        const copy = res.clone();
        copy.useCache = true;
        cache.set({ url, params, method }, copy, ttl);
      }
    }
    // 返回res
    ctx.res = res;
    return next();
  });
}
