// 返回一个组合了所有插件的“插件”

export default function compose(middlewares) {
  // 不是数组报错
  if (!Array.isArray(middlewares)) throw new TypeError('Middlewares must be an array!');

  // 中间件数量
  const middlewaresLen = middlewares.length;
  // 判断中间件类型是否为函数
  for (let i = 0; i < middlewaresLen; i += 1) {
    if (typeof middlewares[i] !== 'function') {
      throw new TypeError('Middleware must be componsed of function');
    }
  }
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
      if (i <= index) {
        return Promise.reject(new Error('next() should not be called multiple times in one middleware!'));
      }
      index = i;
      const fn = middlewares[i] || next;
      if (!fn) return Promise.resolve();
      try {
        // 递归执行插件
        return Promise.resolve(fn(params, () => dispatch(i + 1)));
      } catch (err) {
        return Promise.reject(err);
      }
    }

    return dispatch(0);
  };
}
