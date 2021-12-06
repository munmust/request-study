# axios源码解读

> Axios 是一个基于 promise 网络请求库，作用于node.js 和浏览器中。 它是 isomorphic 的(即同一套代码可以运行在浏览器和node.js中)。在服务端它使用原生 node.js http 模块, 而在客户端 (浏览端) 则使用 XMLHttpRequests

## 支持的功能

- 从浏览器创建 XMLHttpRequests
- 从 node.js 创建 http 请求
- 支持 Promise API
- 拦截请求和响应
- 转换请求和响应数据
- 取消请求
- 自动转换JSON数据
- 客户端支持防御XSRF



## 核心请求方法 Adapter

> 组要讲讲浏览器的xhr,本质就是一个XMLHttpRequest实例发起请求，内置方法去设置请求的headers，利用onloadend监听请求的完成去处理响应数据，利用abort去取消请求，onabort监听请求的取消，用ontimeout监听请求的超时情况

一个基本的xhr请求方法，利用XMLHttpRequest得到实例，open发起请求，send发送data

``` javascript
module.exports = function xhrAdapter(config) {
  return new Promise(function dispatchXhrRequest(resolve, reject) {
    var requestData = config.data; // 请求参数
    var requestHeaders = config.headers; // 请求headers
    var responseType = config.responseType; // 响应类型
    var onCanceled;
    // 创建XMLHttpRequest实例
    var request = new XMLHttpRequest();
    // 完整url
    var fullPath = buildFullPath(config.baseURL, config.url);
    // 发送请求method，完整的url，异步
    request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);
    // ....
    request.send(requestData);
  }
}
```

使用onloadend监听请求结束之后的事件,处理响应数据，响应头、响应data...

```javascript
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
```

利用onabort监听请求取消

```javascript
    request.onabort = function handleAbort() {
      if (!request) {
        return;
      }
      // 拒绝，返回错误信息
      reject(createError('Request aborted', config, 'ECONNABORTED', request));

      // Clean up request
      request = null;
    };
```

利用ontimeout监听请求超时

```javascript
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
```

设置请求request的headers

```javascript
// 使用serRequestHeaders添加请求头
 if ('setRequestHeader' in request) {
      utils.forEach(requestHeaders, function setRequestHeader(val, key) {
        // 对于content-type不是规范写法的容错
        if (typeof requestData === 'undefined' && key.toLowerCase() === 'content-type') {
          // Remove Content-Type if data is undefined
          delete requestHeaders[key];
        } else {
          // Otherwise add header to the request
          request.setRequestHeader(key, val);
        }
      });
    }
```

取消

```javascript
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
```

## 拦截器

初始化请求和响应拦截器

```javascript
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
```

发起请求前线执行请求拦截器，之后发起请求，最后将响应数据传入响应拦截器中进行处理

```javascript
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
```

## 取消

主要依靠Cancel对象进行监听，是否是取消，之后再请求中调用abort去终止请求
与其他库的实现基本类似