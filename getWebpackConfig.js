const fs = require('fs')
const path = require('path')
const webpack = require('webpack')
const ringUiConfig = require('@jetbrains/ring-ui/webpack.config')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin

const processPath = process.cwd()
const tsConfigExists = fs.existsSync(path.join(processPath, './tsconfig.json'))
const postcssConfigExists = fs.existsSync(path.join(processPath, './postcss.config.js'))
const babelConfigExists = fs.existsSync(path.join(processPath, './babel.config.js'))

/**
 * This function returns ready-to-use webpack configuration for creating frontend plugins for TeamCity
 * @param {Object} options - options for generating webpack.config.js
 * @param {boolean | undefined} options.useTypeScript - set to true if you want to write code in TypeScript
 * @param {string} options.srcPath - Path to the source directory. For example: path.join(__dirname, 'src')
 * @param {string} options.outputPath - Path to write the compiled files to disk. For example: path.resolve(__dirname, '../demoPlugin-server/src/main/resources/buildServerResources')
 * @param {string} options.entry - The point or points where to start the application bundling process. For example: './src/index.ts'.
 * @returns {Function} webpack configuration
 */
module.exports = function getWebpackConfig(options) {
  const {useTypeScript, useFlow, srcPath, outputPath, entry} = options

  if (useFlow) {
    console.warn("Flow support is deprecated and will be removed soon. Use the TypeScript instead.")
  }

  ringUiConfig.loaders.cssLoader.include = [...ringUiConfig.loaders.cssLoader.include, srcPath]
  if (!postcssConfigExists) {
    ringUiConfig.loaders.cssLoader.use.forEach(item => {
      if (item.loader != null && item.loader.includes('postcss-loader')) {
        item.options = {
          ...item.options,
          postcssOptions: {
            config: path.join(__dirname, './postcss.config.js'),
          },
        }
      }
    })
  }

  const babelLoader = {
    loader: 'babel-loader',
    options: {
      cacheDirectory: true,
      babelrc: false,
      extends: babelConfigExists
          ? './babel.config.js'
          : path.join(__dirname, './babel.config.js'),
    },
  }
  Object.assign(ringUiConfig.loaders.babelLoader, babelLoader)

  const globalObj = 'window.TeamCityAPI'
  const externals = {
    react: `${globalObj}.React`,
    'react-dom': `${globalObj}.ReactDOM`,
  }

  return (env = {}) => ({
    mode: env.production ? 'production' : 'development',
    bail: !env.devserver,
    entry,
    output: {
      path: outputPath,
      filename: 'bundle.js',
    },
    resolve: useTypeScript
        ? {
          extensions: ['.ts', '.tsx', '.js', '.css'],
        }
        : undefined,
    module: {
      rules: [
        ...ringUiConfig.config.module.rules,
        useTypeScript && {
          test: /\.ts(x?)$/,
          exclude: /node_modules/,
          use: [
            {
              loader: 'babel-loader',
              options: !tsConfigExists  ? {
                configFile: path.join(__dirname, './plugin.tsconfig.json')
              } : undefined,
            },
          ],
        },
        {
          test: /\.js$/,
          include: [srcPath],
          exclude: [/node_modules/],
          use: [babelLoader],
        },
        {
          test: /\.svg$/,
          include: [
            require('@jetbrains/icons'),
            require('@jetbrains/logos'),
            srcPath
          ],
          use: [
            babelLoader,
            {
              loader: '@svgr/webpack',
              options: {
                babel: false,
                svgoConfig: {
                  plugins: [
                    {
                      name: 'preset-default',
                      params: {
                        overrides: {removeViewBox: false},
                      },
                    },
                    {name: 'prefixIds', params: {prefixClassNames: false}},
                  ],
                },
                template: ({imports, componentName, props, jsx}, {tpl}) =>
                  tpl`${imports}
export default React.memo(function ${componentName}(${props}) {
  return ${jsx}
})
`,
              },
            },
          ],
        }
      ].filter(Boolean),
    },
    devServer: {
      hot: true,
      port: env.port,
      host: env.host,
    },
    externals,
    plugins: [
      new webpack.IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/
      }),
      env.analyze &&
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'bundle-report.html',
        openAnalyzer: false,
      }),
    ].filter(Boolean),
  })
}
