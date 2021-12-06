'use strict';

var isAbsoluteURL = require('../helpers/isAbsoluteURL');
var combineURLs = require('../helpers/combineURLs');

/**
 * Creates a new URL by combining the baseURL with the requestedURL,
 * only when the requestedURL is not already an absolute URL.
 * If the requestURL is absolute, this function returns the requestedURL untouched.
 *
 * @param {string} baseURL The base URL
 * @param {string} requestedURL Absolute or relative URL to combine
 * @returns {string} The combined full path
 */
module.exports = function buildFullPath(baseURL, requestedURL) {
  // 存在baseUrl且不是绝对路径
  if (baseURL && !isAbsoluteURL(requestedURL)) {
    // 返回拼接的完全路径
    return combineURLs(baseURL, requestedURL);
  }
  // 绝对路径或没有baseUrl配置，直接返回
  return requestedURL;
};
