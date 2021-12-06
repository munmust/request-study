'use strict';

var utils = require('./../utils');
var settle = require('./../core/settle');
var cookies = require('./../helpers/cookies');
var buildURL = require('./../helpers/buildURL');
var buildFullPath = require('../core/buildFullPath');
var parseHeaders = require('./../helpers/parseHeaders');
var isURLSameOrigin = require('./../helpers/isURLSameOrigin');
var createError = require('../core/createError');
var defaults = require('../defaults');
var Cancel = require('../cancel/Cancel');

// 浏览器请求
module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data; // 请求参数
    var requestHeaders = config.headers; // 请求headers
    var responseType = config.responseType; // 响应类型
    var onCanceled;
    // 请求接收方法
    // TODO 未理解
    function done() {
      if (config.cancelToken) {
        config.cancelToken.unsubscribe(onCanceled);
      }

      if (config.signal) {
        config.signal.removeEventListener('abort', onCanceled);
      }
    }

    // 是 data 是formData类型，去除设置的Content-Type，让浏览器帮助我们去设置
    if (utils.isFormData(requestData)) {
      delete requestHeaders['Content-Type']; // Let the browser set it
    }

    // 创建XMLHttpRequest实例
    var request = new XMLHttpRequest();

    // HTTP basic authentication
    // Http认证 Authorization
    if (config.auth) {
      var username = config.auth.username || '';
      var password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : '';
      requestHeaders.Authorization = 'Basic ' + btoa(username + ':' + password);
    }

    // 完整url
    var fullPath = buildFullPath(config.baseURL, config.url);
    // 发送请求method，完整的url，异步
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);

    // Set the request timeout in MS
    // 超时时间
    request.timeout = config.timeout;

    // 请求结束之后触发
    function onloadend() {
      // 没有请求
      if (!request) {
        return;
      }
      // Prepare the response
      // 得到响应头
      /*
       * Date: Wed, 27 Aug 2014 08:58:49 GMT
       * Content-Type: application/json
       * Connection: keep-alive
       * Transfer-Encoding: chunked
       * ...
       */
      var responseHeaders = 'getAllResponseHeaders' in request ? parseHeaders(request.getAllResponseHeaders()) : null;
      // 得到响应数据
      var responseData =
        !responseType || responseType === 'text' || responseType === 'json' ? request.responseText : request.response;
      // 自定义响应提结构
      var response = {
        // 数据
        data: responseData,
        // 状态
        status: request.status,
        // 完整的响应状态文本 ·200 OK·
        statusText: request.statusText,
        // 响应头
        headers: responseHeaders,
        // config
        config: config,
        // 请求
        request: request,
      };

      // 成功错误请求的判断和处理，返回response或抛出Error
      settle(
        function _resolve(value) {
          resolve(value);
          done();
        },
        function _reject(err) {
          reject(err);
          done();
        },
        response
      );

      // Clean up request
      request = null;
    }

    // 如果有onloadend方法
    if ('onloadend' in request) {
      // Use onloadend if available
      request.onloadend = onloadend;
      // 没有
    } else {
      // Listen for ready state to emulate onloadend
      // 监听readyState的变化
      request.onreadystatechange = function handleLoad() {
        if (!request || request.readyState !== 4) {
          return;
        }

        // The request errored out and we didn't get a response, this will be
        // handled by onerror instead
        // With one exception: request that using file: protocol, most browsers
        // will return status as 0 even though it's a successful request
        if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf('file:') === 0)) {
          return;
        }
        // readystate handler is calling before onerror or ontimeout handlers,
        // so we should call onloadend on the next 'tick'
        setTimeout(onloadend);
      };
    }

    // Handle browser request cancellation (as opposed to a manual cancellation)
    //request 被停止时触发
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      // 拒绝，返回错误信息
      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };

    // Handle low level network errors
    // 请求发生错误
    request.onerror = function handleError() {
      // Real errors are hidden from us by the browser
      // onerror should only fire if it's a network error
      reject(createError('Network Error', config, null, request));

      // Clean up request
      request = null;
    };

    // Handle timeout
    // 在预设时间内没有接收到响应，请求超时
    request.ontimeout = function handleTimeout() {
      // 配置了超时时间
      var timeoutErrorMessage = config.timeout ? 'timeout of ' + config.timeout + 'ms exceeded' : 'timeout exceeded';
      var transitional = config.transitional || defaults.transitional;
      // 超时错误
      if (config.timeoutErrorMessage) {
        timeoutErrorMessage = config.timeoutErrorMessage;
      }
      // 拒绝，返回Error对象
      reject(
        createError(
          timeoutErrorMessage,
          config,
          transitional.clarifyTimeoutError ? 'ETIMEDOUT' : 'ECONNABORTED',
          request
        )
      );

      // Clean up request
      request = null;
    };

    // Add xsrf header
    // This is only done if running in a standard browser environment.
    // Specifically not if we're in a web worker, or react-native.
    // 添加 xsrf 头
    if (utils.isStandardBrowserEnv()) {
      // Add xsrf header
      var xsrfValue =
        //用来指定跨域 Access-Control 请求是否应当带有授权信息，如 cookie 或授权 header 头
        (config.withCredentials || isURLSameOrigin(fullPath)) && config.xsrfCookieName
          ? cookies.read(config.xsrfCookieName)
          : undefined;

      if (xsrfValue) {
        requestHeaders[config.xsrfHeaderName] = xsrfValue;
      }
    }

    // Add headers to the request
    // 使用serRequestHeaders添加请求头
    if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }

    // Add withCredentials to request if needed
    // 用来指定跨域 Access-Control 请求是否应当带有授权信息
    if (!utils.isUndefined(config.withCredentials)) {
      request.withCredentials = !!config.withCredentials;
    }

    // Add responseType to request if needed
    // 定义响应类型的枚举值
    if (responseType && responseType !== 'json') {
      request.responseType = config.responseType;
    }

    // Handle progress if needed
    // 进度
    if (typeof config.onDownloadProgress === 'function') {
      request.addEventListener('progress', config.onDownloadProgress);
    }

    // Not all browsers support upload events
    //上传进度
    if (typeof config.onUploadProgress === 'function' && request.upload) {
      request.upload.addEventListener('progress', config.onUploadProgress);
    }

    // 是否含有取消
    if (config.cancelToken || config.signal) {
      // Handle cancellation
      // eslint-disable-next-line func-names
      onCanceled = function (cancel) {
        if (!request) {
          return;
        }
        // 拒绝promise，返回取消对象
        reject(!cancel || (cancel && cancel.type) ? new Cancel('canceled') : cancel);
        // abort如果请求已被发出，则立刻中止请求。
        request.abort();
        request = null;
      };
      // 监听取消
      config.cancelToken && config.cancelToken.subscribe(onCanceled);
      if (config.signal) {
        config.signal.aborted ? onCanceled() : config.signal.addEventListener('abort', onCanceled);
      }
    }

    if (!requestData) {
      requestData = null;
    }

    // Send the request
    // 发送请求数据
    request.send(requestData);
  });
};
