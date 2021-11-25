/**
 * 实现一个简单的Map cache, 稍后可以挪到 utils中, 提供session local map三种前端cache方式.
 * 1. 可直接存储对象   2. 内存无5M限制   3.缺点是刷新就没了, 看反馈后期完善.
 */
import { parse, stringify } from 'qs';

export class MapCache {
  constructor(options) {
    this.cache = new Map(); // 初始化缓存Map
    this.timer = {}; // 计时器
    this.extendOptions(options);
  }

  // 最大缓存数量 默认为0
  extendOptions(options) {
    this.maxCache = options.maxCache || 0;
  }

  // 获取对应key的缓存值
  get(key) {
    return this.cache.get(JSON.stringify(key));
  }

  set(key, value, ttl = 60000) {
    // 如果超过最大缓存数, 删除头部的第一个缓存.
    if (this.maxCache > 0 && this.cache.size >= this.maxCache) {
      // 得到第一个缓存的key
      const deleteKey = [...this.cache.keys()][0];
      // 删除
      this.cache.delete(deleteKey);
      // 清除计时器
      if (this.timer[deleteKey]) {
        clearTimeout(this.timer[deleteKey]);
      }
    }
    // 得到缓存key
    const cacheKey = JSON.stringify(key);
    // 保存缓存key及值
    this.cache.set(cacheKey, value);
    // 缓存保留时间（新鲜度）不为0时，设置定时器进行新鲜度保证及清除  默认60000 60秒
    if (ttl > 0) {
      this.timer[cacheKey] = setTimeout(() => {
        this.cache.delete(cacheKey);
        delete this.timer[cacheKey];
      }, ttl);
    }
  }

  delete(key) {
    const cacheKey = JSON.stringify(key);
    // 先删除计时器中的key的定时器
    delete this.timer[cacheKey];
    // 返回删除的map项
    return this.cache.delete(cacheKey);
  }

  // 清空Map 清空定时器、清空map
  clear() {
    this.timer = {};
    return this.cache.clear();
  }
}

/**
 * 请求异常
 */
export class RequestError extends Error {
  constructor(text, request, type = 'RequestError') {
    super(text);
    this.name = 'RequestError';
    this.request = request;
    this.type = type;
  }
}

/**
 * 响应异常
 */
export class ResponseError extends Error {
  constructor(response, text, data, request, type = 'ResponseError') {
    super(text || response.statusText);
    this.name = 'ResponseError';
    this.data = data;
    this.response = response;
    this.request = request;
    this.type = type;
  }
}

/**
 * http://gitlab.alipay-inc.com/KBSJ/gxt/blob/release_gxt_S8928905_20180531/src/util/request.js#L63
 * 支持gbk
 */
export function readerGBK(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve(reader.result);
    };
    reader.onerror = reject;
    reader.readAsText(file, 'GBK'); // setup GBK decoding
  });
}

/**
 * 安全的JSON.parse
 */
export function safeJsonParse(data, throwErrIfParseFail = false, response = null, request = null) {
  try {
    return JSON.parse(data);
  } catch (e) {
    if (throwErrIfParseFail) {
      throw new ResponseError(response, 'JSON.parse fail', data, request, 'ParseError');
    }
  } // eslint-disable-line no-empty
  return data;
}

export function timeout2Throw(msec, timeoutMessage, request) {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new RequestError(timeoutMessage || `timeout of ${msec}ms exceeded`, request, 'Timeout'));
    }, msec);
  });
}

// If request options contain 'cancelToken', reject request when token has been canceled
// 如果请求选项包含“cancelToken”，则在取消令牌时拒绝请求
export function cancel2Throw(opt) {
  return new Promise((_, reject) => {
    // 带有取消的token对象
    if (opt.cancelToken) {
      // 拒绝请求
      opt.cancelToken.promise.then((cancel) => {
        reject(cancel);
      });
    }
  });
}

const toString = Object.prototype.toString;

// Check env is browser or node
export function getEnv() {
  let env;
  // Only Node.JS has a process variable that is of [[Class]] process
  if (typeof process !== 'undefined' && toString.call(process) === '[object process]') {
    // For node use HTTP adapter
    env = 'NODE';
  }
  if (typeof XMLHttpRequest !== 'undefined') {
    env = 'BROWSER';
  }
  return env;
}

export function isArray(val) {
  return typeof val === 'object' && Object.prototype.toString.call(val) === '[object Array]';
}

export function isURLSearchParams(val) {
  return typeof URLSearchParams !== 'undefined' && val instanceof URLSearchParams;
}

export function isDate(val) {
  return typeof val === 'object' && Object.prototype.toString.call(val) === '[object Date]';
}

export function isObject(val) {
  return val !== null && typeof val === 'object';
}

export function forEach2ObjArr(target, callback) {
  if (!target) return;

  if (typeof target !== 'object') {
    target = [target];
  }

  if (isArray(target)) {
    for (let i = 0; i < target.length; i++) {
      callback.call(null, target[i], i, target);
    }
  } else {
    for (let key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        callback.call(null, target[key], key, target);
      }
    }
  }
}

export function getParamObject(val) {
  if (isURLSearchParams(val)) {
    return parse(val.toString(), { strictNullHandling: true });
  }
  if (typeof val === 'string') {
    return [val];
  }
  return val;
}

export function reqStringify(val) {
  return stringify(val, { arrayFormat: 'repeat', strictNullHandling: true });
}

/**
 * 配置项进行整合 以options2Merge为主，options为辅，options2Merge优先级最高
 * @param {*} options 配置项1
 * @param {*} options2Merge 配置项2
 * @returns 配置项1和配置项2结合的配置项对象
 */
export function mergeRequestOptions(options, options2Merge) {
  return {
    ...options,
    ...options2Merge,
    headers: {
      ...options.headers,
      ...options2Merge.headers,
    },
    params: {
      ...getParamObject(options.params),
      ...getParamObject(options2Merge.params),
    },
    method: (options2Merge.method || options.method || 'get').toLowerCase(),
  };
}
