import * as angular from 'angular';

// Improve errors/stack traces related to:
// `Error: [ng:areq] Argument 'module' is not a function, got undefined`
const realModule = angular.module;
// https://stackoverflow.com/questions/41057604/error-illegal-reassignment-to-import
// @ts-ignore
this.assign(angular, 'module', function(name: string, requires?: string[], configFn?: Function): angular.IModule {
  if (requires && requires.some(dep => !dep)) {
    const deps = requires.map(r => (typeof r === 'string' ? `'${r}'` : `${r}`)).join(', ');
    throw new Error(`Got falsey dependency whilst registering angular module '${name}': [${deps}]`);
  }
  return realModule(name, requires, configFn);
});
