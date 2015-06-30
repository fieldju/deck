'use strict';

let angular = require('angular');

module.exports = angular.module('spinnaker.pipelines', [
  require('../caches/viewStateCache.js'),
  require('./config/config.module.js'),
  require('restangular'),
  require('../authentication/authentication.module.js'),
  require('utils/lodash.js'),
  require('../caches/deckCacheFactory.js'),
  require('angular-ui-sortable'),
]);
