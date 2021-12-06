'use strict';

var utils = require('./../utils');
var buildURL = require('../helpers/buildURL');
var InterceptorManager = require('./InterceptorManager');
var dispatchRequest = require('./dispatchRequest');
var mergeConfig = require('./mergeConfig');
var validator = require('../helpers/validator');

var validators = validator.validators;
/**
 * Create a new instance of Axios
 *
 * @param {Object} instanceConfig The default config for the instance
 */
// 构造函数
function Axios(instanceConfig) {
  this.defaults = instanceConfig;
  // 拦截器实例
  this.interceptors = {
    request: new InterceptorManager(),
    response: new InterceptorManager(),
  };
}

/**
 * Dispatch a request
 *
 * @param {Object} config The config specific for this request (merged with this.defaults)
 */
/**
 * 发送请求
 * @param {Object} config 该config将会和default进行结合，得到需要的config
 * @returns
 */
Axios.prototype.request = function request(config) {
  /*eslint no-param-reassign:0*/
  // Allow for axios('example/url'[, config]) a la fetch API
  // 取得参数config
  if (typeof config === 'string') {
    config = arguments[1] || {};
    config.url = arguments[0];
  } else {
    config = config || {};
  }
  // config参数和default结合得到新的config
  config = mergeConfig(this.defaults, config);

  // Set config.method
  // 设置请求的方法  custom -> default -> get
  if (config.method) {
    config.method = config.method.toLowerCase();
  } else if (this.defaults.method) {
    config.method = this.defaults.method.toLowerCase();
  } else {
    config.method = 'get';
  }
  // 在较新版本中删除的向后兼容性
  var transitional = config.transitional;
  // TODO 未理解
  if (transitional !== undefined) {
    validator.assertOptions(
      transitional,
      {
        silentJSONParsing: validators.transitional(validators.boolean),
        forcedJSONParsing: validators.transitional(validators.boolean),
        clarifyTimeoutError: validators.transitional(validators.boolean),
      },
      false
    );
  }

  // filter out skipped interceptors
  // 获取请求拦截器里面所有的数据
  var requestInterceptorChain = [];
  var synchronousRequestInterceptors = true;
  this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
    if (typeof interceptor.runWhen === 'function' && interceptor.runWhen(config) === false) {
      return;
    }

    synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;

    requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
  });
  // 获取响应拦截器里面所有的数据
  var responseInterceptorChain = [];
  this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
    responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
  });

  var promise;
  // 同步请求接收器
  if (!synchronousRequestInterceptors) {
    var chain = [dispatchRequest, undefined];
    // 拼接请求和响应拦截器
    Array.prototype.unshift.apply(chain, requestInterceptorChain);
    chain = chain.concat(responseInterceptorChain);
    // [...requestInterceptorChain(请求拦截器), dispatchRequest(请求), undefined, ...responseInterceptorChain(响应拦截器)]
    promise = Promise.resolve(config);
    // 逐一执行
    while (chain.length) {
      promise = promise.then(chain.shift(), chain.shift());
    }

    return promise;
  }

  var newConfig = config;
  // 存在请求拦截器
  while (requestInterceptorChain.length) {
    var onFulfilled = requestInterceptorChain.shift();
    var onRejected = requestInterceptorChain.shift();
    // 得到经过请求拦截器的config
    try {
      newConfig = onFulfilled(newConfig);
    } catch (error) {
      onRejected(error);
      break;
    }
  }

  // 执行请求，得到结果promise
  try {
    promise = dispatchRequest(newConfig);
  } catch (error) {
    return Promise.reject(error);
  }

  // 存在响应拦截器，结果promise进入逐一执行
  while (responseInterceptorChain.length) {
    promise = promise.then(responseInterceptorChain.shift(), responseInterceptorChain.shift());
  }
  // 返回结果
  return promise;
};

// 获取请求url
Axios.prototype.getUri = function getUri(config) {
  // 得到结合的config
  config = mergeConfig(this.defaults, config);
  // 生成请求地址 url= url+？+paramsString
  return buildURL(config.url, config.params, config.paramsSerializer).replace(/^\?/, '');
};

// Provide aliases for supported request methods
// 支持别名请求
utils.forEach(['delete', 'get', 'head', 'options'], function forEachMethodNoData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function (url, config) {
    return this.request(
      mergeConfig(config || {}, {
        method: method,
        url: url,
        // 'delete', 'get', 'head', 'options' 请求没有真正的data传输
        data: (config || {}).data,
      })
    );
  };
});
// 支持别名请求
utils.forEach(['post', 'put', 'patch'], function forEachMethodWithData(method) {
  /*eslint func-names:0*/
  Axios.prototype[method] = function (url, data, config) {
    return this.request(
      mergeConfig(config || {}, {
        method: method,
        url: url,
        data: data,
      })
    );
  };
});

module.exports = Axios;
