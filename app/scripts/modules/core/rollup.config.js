const alias = require('rollup-plugin-alias');
// Cant use rollup-plugin-typescript until the following issue is resolved, rollup-plugin-typescript2 is slow, but works :(
// https://github.com/rollup/rollup-plugin-typescript/issues/109
// const typescript = require('rollup-plugin-typescript');
const typescript = require('rollup-plugin-typescript2');
const postcss = require('rollup-plugin-postcss');
const path = require('path');
const { minify } = require('html-minifier');
const external = require('@yelo/rollup-node-external');
const rollupPostcssLessLoader = require('rollup-plugin-postcss-webpack-alias-less-loader');
const fs = require('fs');

// Slurp in the webpack config so we don't have to duplicate aliases.
const webpackConfig = require('./webpack.config');

const aliases = webpackConfig.resolve.alias;

const NODE_MODULE_PATH = path.resolve('../../../../node_modules');

const resolveAliases = name => {
  return name.replace(/(.*)/, requested => {
    const aliasKeys = Object.keys(aliases);
    for (let i = 0; i < aliasKeys.length; i++) {
      if (requested.startsWith(aliasKeys[i])) {
        return requested.replace(aliasKeys[i], aliases[aliasKeys[i]]);
      }
    }
    return requested;
  });
};

const resolvePath = (aliasResolvedName, id) => {
  const fileInfo = path.parse(aliasResolvedName);
  return !fileInfo.dir || fileInfo.dir.startsWith('.')
    ? path.resolve(path.parse(id).dir, fileInfo.dir, fileInfo.base)
    : path.resolve(aliasResolvedName);
};

// total hack for poc, must be ran after cjs bundle is created
const icons = fs.readdirSync('./lib/').filter(it => it.endsWith('.svg'));
const iconMap = Object.assign({}, ...icons.map(fileName => ({ [fileName.split('.')[0]]: fileName })));

const replaceInlineHtmlRequireStatements = (code, id) => {
  return String.prototype.replace.call(code, /require\(["'](.*?\.html)["']\)/g, (match, htmlTemplate) => {
    const aliasResolvedTemplate = resolveAliases(htmlTemplate);
    const resolvedTemplatePath = resolvePath(aliasResolvedTemplate, id);

    if (!fs.existsSync(resolvedTemplatePath)) {
      throw new Error(
        `The required html template '${htmlTemplate}' alias resolved: ${aliasResolvedTemplate} resolved to path: '${resolvedTemplatePath}' required in ${id} doesn't exit, and therefore an inline substitution can't be performed!`,
      );
    }

    const rawHtmlContent = fs.readFileSync(resolvedTemplatePath).toString();

    return `${JSON.stringify(minify(rawHtmlContent, {}))}`;
  });
};

const replaceInlineRequireNameStatements = (code, id) => {
  return String.prototype.replace.call(code, /require\(["'](.*?)["']\)\.name/g, (match, unresolvedImportName) => {
    const resolvedImportName = resolveAliases(unresolvedImportName);
    const resolvedTemplatePath = resolvePath(resolvedImportName, id);
    const name = /module.exports.*?=.*?angular.*?module\(['"](.*?)['"]/s.exec(
      fs.readFileSync(resolvedTemplatePath + '.js').toString(),
    )[1];
    return `'${name}'`;
  });
};

const replaceRequireIconsStatements = (code, id) => {
  return String.prototype.replace.call(code, /require\('\.\/icons\/(.*?)\.svg'\)/g, (match, iconName) => {
    return `require('./${iconMap[iconName]}')`;
  });
};

const replaceRequireVersonJsonStatement = (code, id) => {
  return String.prototype.replace.call(
    code,
    "require('root/version.json')",
    '{"version": "n/a","created": 1461949989729}',
  );
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
      loaders: [
        rollupPostcssLessLoader({
          nodeModulePath: NODE_MODULE_PATH,
          aliases: aliases,
        }),
      ],
    }),
    {
      // IMPORT HTML TEMPLATE PLUGIN
      transform(code, id) {
        if (id.endsWith('.html')) {
          return {
            code: `export default ${JSON.stringify(minify(code, {}))}`,
            map: { mappings: '' },
          };
        }
      },
    },
    {
      // internal inline require statement transformer
      transform(code, id, it, that, foo) {
        let transformedCode = code;
        transformedCode = replaceInlineHtmlRequireStatements(transformedCode, id);
        transformedCode = replaceInlineRequireNameStatements(transformedCode, id);
        transformedCode = replaceRequireIconsStatements(transformedCode, id);
        transformedCode = replaceRequireVersonJsonStatement(transformedCode, id);

        return {
          code: transformedCode,
          map: { mappings: '' },
        };
      },
    },
  ],
};

module.exports = {
  default: CONFIG,
};
