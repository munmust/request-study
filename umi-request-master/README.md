# umi-request源码解读

## 支持的功能

- url 参数自动序列化
- post 数据提交方式简化
- response 返回处理简化
- api 超时支持
- api 请求缓存支持
- 支持处理 gbk
- 类 axios 的 request 和 response 拦截器(interceptors)支持
- 统一的错误处理方式
- 类 koa 洋葱机制的 use 中间件机制支持
- 类 axios 的取消请求
- 支持 node 环境发送 http 请求

## 与其他请求库的对比

| 特性       | umi-request    | fetch          | axios          |
| :--------- | :------------- | :------------- | :------------- |
| 实现       | 浏览器原生支持 | 浏览器原生支持 | XMLHttpRequest |
| 大小       | 9k             | 4k (polyfill)  | 14k            |
| query 简化 | ✅              | ❌              | ✅              |
| post 简化  | ✅              | ❌              | ❌              |
| 超时       | ✅              | ❌              | ✅              |
| 缓存       | ✅              | ❌              | ❌              |
| 错误检查   | ✅              | ❌              | ❌              |
| 错误处理   | ✅              | ❌              | ✅              |
| 拦截器     | ✅              | ❌              | ✅              |
| 前缀       | ✅              | ❌              | ❌              |
| 后缀       | ✅              | ❌              | ❌              |
| 处理 gbk   | ✅              | ❌              | ❌              |
| 中间件     | ✅              | ❌              | ❌              |
| 取消请求   | ✅              | ❌              | ✅              |

## 拦截器

### 使用

``` javascript
// request拦截器, 改变url 或 options.
request.interceptors.request.use((url, options) => {
  return {
    url: `${url}&interceptors=yes`,
    options: { ...options, interceptors: true },
  };
});
request.interceptors.request.use(addType);
// 提前对响应做异常处理
request.interceptors.response.use((response) => {
  const codeMaps = {
    502: "网关错误。",
    503: "服务不可用，服务器暂时过载或维护。",
    504: "网关超时。",
  };
  message.error(codeMaps[response.status]);
  return response;
});
```

### 实现

#### 请求拦截器

在request中将拦截器进行挂载,使用use增加注册功能

```javascript
// 挂载拦截器
umiInstance.interceptors = {
  request: {
    use: Core.requestUse.bind(coreInstance),
  },
  response: {
    use: Core.responseUse.bind(coreInstance),
  },
};
```

在核心中定义了请求和响应的拦截器数组,并且判断传入的拦截器是否符合规则，符合推入相应的拦截器数组

``` javascript

class Core {
  constructor(initOptions) {
    this.instanceRequestInterceptors = []; // 请求实例拦截器
    this.instanceResponseInterceptors = []; // 响应实例拦截器
  }
  // 旧版拦截器为共享
  static requestInterceptors = [addfixInterceptor]; // 旧请求实例拦截器
  static responseInterceptors = [];// 旧响应实例拦截器
}

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
```

request方法时将会将响应拦截器包装，并传给请求拦截器当作参数，并且传入url和options以供请求拦截器进行使用

```javascript
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
// ...
 }
}  
```

dealRequestInterceptors方法中将循环执行请求拦截器对url和options进行循环处理，得到最终的请求url和options

```javascript
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
```

#### 响应拦截器

响应拦截器将会在fetch中间件中fetch只想完成得到响应数据的时候，循环执行，得到处理之后得到的响应数据

```javascript
export default function fetchMiddleware(ctx, next) {
// ...
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
// ...
}
```

## 中间件

> 类 koa 的洋葱机制
![onion](https://raw.githubusercontent.com/munmust/markdownImage/main/umi/umi-interview.png)
>> 其实机制就是 compose(fn1, fn2, fn3) (...args) = > fn1(fn2(fn3(...args)))

```javascript
/**
 [
   middleware
   defaultMiddleware
   globalMiddleware:simplePost, simpleGet, parseResponseMiddleware
   coreMiddleware:fetchMiddleware
  ]
 */
  return function wrapMiddlewares(params, next) {
    let index = -1;
    function dispatch(i) {
      // 判断i是否合法 ，next不应在一个中间件中多次调用
      if (i <= index) {
        return Promise.reject(new Error('next() should not be called multiple times in one middleware!'));
      }
      // index为当前中间件的位置
      index = i;
      // 查看当前位置是否有中间件
      const fn = middlewares[i] || next;
      // 没有的话直接返回
      if (!fn) return Promise.resolve();
      try {
        // 执行当前位置的中间件并且 递归执行下一个中间件
        return Promise.resolve(fn(params, () => dispatch(i + 1)));
      } catch (err) {
        // 执行出现错误时抛出异常并且中断
        return Promise.reject(err);
      }
    }
    return dispatch(0);
  };
```

中间件及拦截器执行顺序：请求拦截器->middleware->defaultMiddleware->globalMiddleWare(simplePost->simpleGet->parseRequestMiddleware)->coreMiddleware(fetch)->响应拦截器->defaultMiddle(parseRequestMiddle->simpleGet->simplePost)->defaultMiddleware->middleware

- 实例中间件（默认） ：request.use(fn) 不同实例创建的中间件相互独立不影响;
- 全局中间件 : request.use(fn, { global: true }) 全局中间件，不同实例共享全局中间件；
- 内核中间件 ：request.use(fn, { core: true }) 内核中间件， 方便开发者拓展请求内核；

## 取消请求

### 核心

```javascript
function CancelToken(executor) {
  // 成功的resolve()
  var resolvePromise;
  this.promise = new Promise(function promiseExecutor(resolve) {
    resolvePromise = resolve;
  });

  var token = this;
  executor(function cancel(message) {
    if (token.reason) {
      // 取消操作已被调用过
      return;
    }
    //取消对象
    token.reason = new Cancel(message);
    // 完成返回取消对象
    resolvePromise(token.reason);
  });
}
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
// 得到拒绝的将会失败，完成取消操作
response = Promise.race([cancel2Throw(options, ctx), adapter(url, options),...]);

```