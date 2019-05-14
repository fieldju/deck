const alias = require('rollup-plugin-alias');
// Cant use rollup-plugin-typescript until the following issue is resolved, rollup-plugin-typescript2 is slow, but works :(
// https://github.com/rollup/rollup-plugin-typescript/issues/109
// const typescript = require('rollup-plugin-typescript');
const typescript = require('rollup-plugin-typescript2');
const postcss = require('rollup-plugin-postcss');
const pify = require('pify');
const path = require('path');
const less = require('less');
const importCwd = require('import-cwd');
const { minify } = require('html-minifier');
const external = require('@yelo/rollup-node-external');

// Slurp in the webpack config so we don't have to duplicate aliases.
const webpackConfig = require('./webpack.config');

const aliases = webpackConfig.resolve.alias;

const humanlizePath = filepath => path.relative(process.cwd(), filepath);
const NODE_MODULE_PATH = path.resolve('../../../../node_modules');

const aliasRegex = alias => {
  return new RegExp(`(@import.*?)(["'])~${alias}(["'/])(.*?;)`, 'g');
};
const nodeModuleRegex = new RegExp(/(@import.*?)["']~(.*?)["'].*?/g);

/**
 * Replaces aliases in less code then replaces ~ to node_modules root
 * @param code
 * @return {*}
 */
const replaceAliases = code => {
  let parsedAliases = code;
  Object.keys(aliases).forEach(alias => {
    parsedAliases = parsedAliases.replace(aliasRegex(alias), `$1$2${aliases[alias]}$3$4`);
  });
  const finalParsed = parsedAliases.replace(nodeModuleRegex, `$1"${NODE_MODULE_PATH}/$2"`);
  return finalParsed;
};

/**
 * Custom file manager to support webpack style aliases via '~'
 * Inspired by https://github.com/webpack-contrib/less-loader/blob/99aad2171e9784cecef2e7820fb8300698fe7007/src/createWebpackLessPlugin.js#L36
 */
class RollupFileManager extends less.FileManager {
  supports() {
    return true;
  }

  supportsSync() {
    return false;
  }

  async loadFile(filename, currentDirectory, options, environment) {
    const file = await super.loadFile(filename, currentDirectory, options, environment);
    file.contents = replaceAliases(file.contents);
    return file;
  }
}

const rollupFileManager = new RollupFileManager();

// Copy pasted from https://github.com/egoist/rollup-plugin-postcss/blob/5596ca978bee3d5c4da64c8ddd130ca3d8e77244/src/less-loader.js
// But modified to use the above RollupFileManager
const lessLoader = {
  name: 'less',
  test: /\.less$/,
  async process({ code }) {
    code = replaceAliases(code);
    let { css, map, imports } = await pify(less.render.bind(importCwd('less')))(code, {
      ...this.options,
      sourceMap: this.sourceMap && {},
      filename: this.id,
      plugins: [
        {
          install(lessInstance, pluginManager) {
            pluginManager.addFileManager(rollupFileManager);
          },
          minVersion: [2, 1, 1],
        },
      ],
    });

    for (const dep of imports) {
      this.dependencies.add(dep);
    }

    if (map) {
      map = JSON.parse(map);
      map.sources = map.sources.map(source => humanlizePath(source));
    }

    return {
      code: css,
      map,
    };
  },
};

const CONFIG = {
  external: external({
    modulesDir: NODE_MODULE_PATH,
  }),
  input: [webpackConfig.entry.lib],
  output: { name: 'core', file: 'lib/lib.es.js', format: 'es', sourcemap: true },
  treeshake: true,
  plugins: [
    {
      // LOGGING PLUGIN
      transform(code, id) {
        console.log(`Processing: '${id}'`);
      },
    },
    alias({
      resolve: ['.ts', '.tsx', '/index.ts', '/index.tsx'],
      ...aliases,
    }),
    typescript({
      check: false,
    }),
    postcss({
      loaders: [lessLoader],
    }),
    {
      // HTML TEMPLATE PLUGIN
      transform(code, id) {
        if (id.endsWith('.html')) {
          return {
            code: `export default ${JSON.stringify(minify(code, {}))}`,
            map: { mappings: '' },
          };
        }
      },
    },
  ],
};

module.exports = {
  default: CONFIG,
};
