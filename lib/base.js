'use strict';
const webpack = require('webpack');
const merge = require('webpack-merge');
const ProgressBarPlugin = require('progress-bar-webpack-plugin');
const StatsPlugin = require('stats-webpack-plugin');
const chalk = require('chalk');
const Utils = require('../utils/utils');
const Loader = require('../utils/loader');

class WebpackBaseBuilder {
  constructor(config) {
    this.config = require('./config.js')(config);
    this.initConfig();
    this.initOption();
    this.initLoader();
    this.initPlugin();
  }

  initConfig() {
    this.prod = process.env.NODE_ENV === 'production';
    this.options = {};
    this.loaders = [];
    this.plugins = [];
    this.setUglifyJs(this.prod);
    this.setFileNameHash(this.prod);
    this.setImageHash(this.prod);
    this.setCssHash(this.prod);
    this.setCssExtract(false);
  }

  initOption() {
    this.options = {
      entry: Utils.getEntry(this.config.build.entry),
      resolve: {
        extensions: ['.js']
      },
      output: {
        publicPath: this.config.build.publicPath
      },
      plugins: [
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'development')
        })
      ]
    };
  }

  initLoader() {
    this.addLoader(/\.js$/, 'babel-loader', { exclude: /node_modules/ });
    this.addLoader(/\.json$/, 'json-loader');
    this.addLoader(/\.(png|jpe?g|gif|svg)(\?.*)?$/, 'url-loader', () => ({
        query: {
          limit: 1024,
          name: this.imageName
        }
      })
    );
  }

  initPlugin() {
    this.addPlugin(webpack.NoEmitOnErrorsPlugin);
    this.addPlugin(ProgressBarPlugin, {
        width: 100,
        format: `webpack build [:bar] ${chalk.green.bold(':percent')} (:elapsed seconds)`,
        clear: false
      }
    );
    this.addPlugin(webpack.optimize.UglifyJsPlugin, {
      compress: {
        warnings: false,
        dead_code: true,
        drop_console: true,
        drop_debugger: true
      }
    }, () => {
      return this.isUglifyJS;
    });

    this.addPlugin(new StatsPlugin('stats.json', {
      chunkModules: true,
      chunks: true,
      assets: true,
      modules: true,
      children: true,
      chunksSort: true,
      assetsSort: true
    }), null, () => {
      return this.isStatToJson
    });
  }

  addLoader(test, loader, option) {
    option = typeof option === 'function' ? { fn: option } : option;
    if (typeof test === 'object' && test.loader) {
      loader = merge(test, option);
    } else {
      loader = typeof loader === 'string' && /-loader$/.test(loader) ? require.resolve(loader) : loader;
      loader = merge({ test, loader }, option);
    }
    this.loaders = this.loaders.concat(loader);
  }

  findLoaderIndex(name) {
    return this.loaders.findIndex(item => {
      return item.loader.indexOf(name) > -1;
    });
  }

  updateLoader(loader) {
    const loaderIndex = this.findLoaderIndex(loader.loader);
    if (loaderIndex > -1) {
      this.loaders[loaderIndex] = merge(this.loaders[loaderIndex], loader);
    }
  }

  deleteLoader(loader) {
    const loaderIndex = this.findLoaderIndex(loader.loader);
    if (loaderIndex > -1) {
      return this.loaders.splice(loaderIndex, 1);
    }
  }

  addPlugin(clazz, args, enable) {
    const plugin = { clazz, args, enable };
    this.plugins = this.plugins.concat(plugin);
  }

  findPluginIndex(plugin) {
    const pluginName = typeof plugin === 'object' ? plugin.constructor && plugin.constructor.name : plugin.name;
    return this.plugins.findIndex(item => {
      const configPlugin = item.clazz || item;
      const itemPluginName = typeof configPlugin === 'object' ? configPlugin.constructor && configPlugin.constructor.name : configPlugin.name;
      return itemPluginName === pluginName;
    });
  }

  updatePlugin(plugin, args) {
    const pluginIndex = this.findPluginIndex(plugin);
    this.plugins[pluginIndex] = merge(this.plugins[pluginIndex], { clazz: plugin, args });
  }

  deletePlugin(plugin) {
    const pluginIndex = this.findPluginIndex(plugin);
    if (pluginIndex > -1) {
      return this.plugins.splice(pluginIndex, 1);
    }
  }

  setOption(option) {
    this.options = merge(this.options, option);
  }

  setPublicPath(publicPath) {
    this.options = merge(this.options, { output: { publicPath } });
  }

  setEggWebpackPublicPath() {
    if (!this.prod) {
      this.setPublicPath(Utils.getDevPublicPath(this.config, 2));
    }
  }

  setDevTool(devtool, force) {
    if (!this.prod || force) {
      this.options = merge(this.options, { devtool });
    }
  }

  createWebpackLoader() {
    const webpackLoaders = [];
    const styleConfig = this.getStyleConfig();
    Loader.styleLoaders(styleConfig).forEach(loader => {
      this.loaders.push(loader);
    });
    this.loaders.forEach(loader => {
      if (loader.fn && typeof loader.fn === 'function') {
        const tempLoader = Object.assign({}, loader);
        const loaderConfig = tempLoader.fn();
        delete tempLoader.fn;
        webpackLoaders.push(merge(tempLoader, loaderConfig));
      } else {
        webpackLoaders.push(loader);
      }
    });
    return webpackLoaders;
  }

  createWebpackPlugin() {
    const webpackPlugins = [];
    this.plugins.forEach(plugin => {
      if (plugin.enable === undefined || plugin.enable === true || (typeof plugin.enable === 'function' && plugin.enable())) {
        if (typeof plugin.clazz === 'object') {
          webpackPlugins.push(plugin.clazz);
        } else if (plugin.args) {
          const args = typeof plugin.args === 'function' ? plugin.args() : plugin.args;
          webpackPlugins.push(new (Function.prototype.bind.apply(plugin.clazz, [null].concat(args)))());
        } else if (!plugin.args) {
          const Clazz = plugin.clazz;
          webpackPlugins.push(new Clazz());
        }
      }
    });
    return webpackPlugins;
  }

  create() {
    const webpackLoaders = this.createWebpackLoader();
    const webpackPlugins = this.createWebpackPlugin();
    return merge(this.options, {
      module: {
        rules: webpackLoaders
      },
      plugins: webpackPlugins
    });
  }

  setEntry(name, value) {
    const entry = {};
    entry[name] = value;
    this.options = merge(this.options, { entry });
  }

  setExtensions(extendsion) {
    this.options = merge(this.options, {
      resolve: {
        extensions: Array.isArray(extendsion) ? extendsion : [extendsion]
      }
    });
  }

  setAlias(name, value) {
    const alias = {};
    alias[name] = value;
    this.options = merge(this.options, {
      resolve: { alias }
    });
  }

  setMiniCss(isMiniCss) {
    this.isMiniCss = isMiniCss;
  }

  setUglifyJs(isUglifyJS) {
    this.isUglifyJS = isUglifyJS;
  }

  setFileNameHash(isHash, len = 7) {
    if (isHash) {
      this.filename = Utils.assetsPath(this.config, `js/[name].[hash:${len}].js`);
      this.chunkFilename = Utils.assetsPath(this.config, `js/[id].[chunkhash:${len}].js`);
    } else {
      this.filename = Utils.assetsPath(this.config, 'js/[name].js');
      this.chunkFilename = Utils.assetsPath(this.config, 'js/[id].js');
    }
  }

  setImageHash(isHash, len = 7) {
    if (isHash) {
      this.imageName = Utils.assetsPath(this.config, `img/[name].[hash:${len}].[ext]`);
    } else {
      this.imageName = Utils.assetsPath(this.config, 'img/[name].[ext]');
    }
  }

  setCssHash(isHash, len = 7) {
    if (isHash) {
      this.cssName = Utils.assetsPath(this.config, `css/[name].[contenthash:${len}].css`);
    } else {
      this.cssName = Utils.assetsPath(this.config, 'img/[name].css');
    }
  }

  setCssExtract(isExtract) {
    this.extractCss = isExtract;
  }

  setManifest(isCreateManifest) {
    this.isCreateManifest = isCreateManifest;
  }

  setStatToJson(isStatToJson) {
    this.isStatToJson = isStatToJson;
  }

  setStyleLoaderName(name) {
    this.styleLoaderName = name;
  }

  setStyleLoaderOption(option) {
    this.styleLoaderOption = option;
  }

  getStyleLoaderOption() {
    const styleConfig = this.getStyleConfig();
    return Loader.getStyleLoaderOption(styleConfig);
  }

  getStyleConfig() {
    return {
      extractCss: this.extractCss,
      styleLoaderName: this.styleLoaderName,
      styleLoaderOption: this.styleLoaderOption
    };
  }

  ignoreCSS() {
    this.plugins.unshift({
      clazz: webpack.NormalModuleReplacementPlugin,
      args: [/\.css$/, require.resolve('node-noop')]
    }, {
      clazz: webpack.IgnorePlugin,
      args: /\.(css|less|scss|sass)$/
    });
  }
}

module.exports = WebpackBaseBuilder;