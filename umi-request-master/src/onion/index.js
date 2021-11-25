// 参考自 puck-core 请求库的插件机制
import compose from './compose';
// 一个洋葱，实际是进行中间件处理的
class Onion {
  // 默认中间件
  constructor(defaultMiddlewares) {
    if (!Array.isArray(defaultMiddlewares)) throw new TypeError('Default middlewares must be an array!');
    // 默认中间件
    this.defaultMiddlewares = [...defaultMiddlewares];
    // 自定义中间件
    this.middlewares = [];
  }

  static globalMiddlewares = []; // 全局中间件
  static defaultGlobalMiddlewaresLength = 0; // 内置全局中间件长度
  static coreMiddlewares = []; // 内核中间件
  static defaultCoreMiddlewaresLength = 0; // 内置内核中间件长度

  /**
   * 使用中间件
   * @param {*} newMiddleware 新的中间件
   * @param {*} opts 中间见类型配置（global：全局，core：内核，defaultInstance：默认）
   * @returns 
   */
  use(newMiddleware, opts = { global: false, core: false, defaultInstance: false }) {
    let core = false;
    let global = false;
    let defaultInstance = false;

    // 中间件类型的验证 默认是实例中间件
    // 为number时认为是内核中间件
    // 为对象时，从对象中获取对应的中间件类型
    if (typeof opts === 'number') {
      if (process && process.env && process.env.NODE_ENV === 'development') {
        console.warn(
          'use() options should be object, number property would be deprecated in future，please update use() options to "{ core: true }".'
        );
      }
      core = true;
      global = false;
    } else if (typeof opts === 'object' && opts) {
      global = opts.global || false;
      core = opts.core || false;
      defaultInstance = opts.defaultInstance || false;
    }

    // 全局中间件 ，放入全局中间件的最前面
    if (global) {
      Onion.globalMiddlewares.splice(
        Onion.globalMiddlewares.length - Onion.defaultGlobalMiddlewaresLength,
        0,
        newMiddleware
      );
      return;
    }
    // 内核中间件 ，放入内核中间件的最前面
    if (core) {
      Onion.coreMiddlewares.splice(Onion.coreMiddlewares.length - Onion.defaultCoreMiddlewaresLength, 0, newMiddleware);
      return;
    }

    // 默认实例中间件，供开发者使用，放入
    if (defaultInstance) {
      this.defaultMiddlewares.push(newMiddleware);
      return;
    }

    // 实例中间件，推入
    this.middlewares.push(newMiddleware);
  }
  // 执行所有中间件
  execute(params = null) {
    const fn = compose([
      ...this.middlewares,
      ...this.defaultMiddlewares,
      ...Onion.globalMiddlewares,
      ...Onion.coreMiddlewares,
    ]);
    return fn(params);
  }
}

export default Onion;
