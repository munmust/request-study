'use strict';

var utils = require('./../utils');
var transformData = require('./transformData');
var isCancel = require('../cancel/isCancel');
var defaults = require('../defaults');
var Cancel = require('../cancel/Cancel');

/**
 * Throws a `Cancel` if cancellation has been requested.
 */
function throwIfCancellationRequested(config) {
  if (config.cancelToken) {
    config.cancelToken.throwIfRequested();
  }

  if (config.signal && config.signal.aborted) {
    throw new Cancel('canceled');
  }
}

/**
 * Dispatch a request to the server using the configured adapter.
 *
 * @param {object} config The config that is to be used for the request
 * @returns {Promise} The Promise to be fulfilled
 */
/**
 * 调用请求方法发送请求
 * @param {object} config 请求的config
 * @returns 请求结果
 */
module.exports = function dispatchRequest(config) {
  throwIfCancellationRequested(config);

  // Ensure headers exist
  config.headers = config.headers || {};

  // Transform request data
  config.data = transformData.call(config, config.data, config.headers, config.transformRequest);

  // Flatten headers
  config.headers = utils.merge(config.headers.common || {}, config.headers[config.method] || {}, config.headers);

  utils.forEach(
    ['delete', 'get', 'head', 'post', 'put', 'patch', 'common'],
    // 去除headers
    function cleanHeaderConfig(method) {
      delete config.headers[method];
    }
  );

  // 请求方法，用户有定义用用户自定义否之用默认
  var adapter = config.adapter || defaults.adapter;

  return adapter(config).then(
    function onAdapterResolution(response) {
      throwIfCancellationRequested(config);

      // Transform response data
      // 格式化结果
      response.data = transformData.call(config, response.data, response.headers, config.transformResponse);
      // 返回结果
      return response;
    },
    function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);

        // Transform response data
        // 格式化结果
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            reason.response.data,
            reason.response.headers,
            config.transformResponse
          );
        }
      }
      // 返回拒绝及拒绝结果
      return Promise.reject(reason);
    }
  );
};
