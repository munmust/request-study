'use strict';

var utils = require('./../utils');

// 字符转义
function encode(val) {
  return encodeURIComponent(val)
    .replace(/%3A/gi, ':')
    .replace(/%24/g, '$')
    .replace(/%2C/gi, ',')
    .replace(/%20/g, '+')
    .replace(/%5B/gi, '[')
    .replace(/%5D/gi, ']');
}

/**
 * Build a URL by appending params to the end
 *
 * @param {string} url The base of the url (e.g., http://www.google.com)
 * @param {object} [params] The params to be appended
 * @returns {string} The formatted url
 */
module.exports = function buildURL(url, params, paramsSerializer) {
  /*eslint no-param-reassign:0*/
  // 没有params直接返回url
  if (!params) {
    return url;
  }

  var serializedParams;
  // 配置了paramsSerializer 执行paramsSerializer进行params的处理
  if (paramsSerializer) {
    serializedParams = paramsSerializer(params);
    // 是url中search的格式，直接返回params的string格式
  } else if (utils.isURLSearchParams(params)) {
    serializedParams = params.toString();
  } else {
    var parts = [];

    utils.forEach(params, function serialize(val, key) {
      if (val === null || typeof val === 'undefined') {
        return;
      }

      // 如果是数组，则key添加[],值不变还是[...]
      if (utils.isArray(val)) {
        key = key + '[]';
        // 值不是数组，则把值都存到新建数组
      } else {
        val = [val];
      }
      // 这时的params为 key|key[]=val|[val]

      utils.forEach(val, function parseValue(v) {
        // 遍历val ，查看数组中的值是否为时间类型，是的化转化为时间字段
        if (utils.isDate(v)) {
          v = v.toISOString();
          // 是对象的化直接转为json字符串
        } else if (utils.isObject(v)) {
          v = JSON.stringify(v);
        }
        // 将当前params转为key=val 放到params的结果数组中
        parts.push(encode(key) + '=' + encode(v));
      });
    });
    // 得到params的字符串
    serializedParams = parts.join('&');
  }

  // 如果存在params
  if (serializedParams) {
    // 判断url中是否有#号
    var hashmarkIndex = url.indexOf('#');
    if (hashmarkIndex !== -1) {
      // 得到hash字符前的url地址
      url = url.slice(0, hashmarkIndex);
    }

    // 判断url中是否已经存在？号，存在则使用 & 将params添加到原有参数后，否的话直接使用？全部添加
    url += (url.indexOf('?') === -1 ? '?' : '&') + serializedParams;
  }

  return url;
};
