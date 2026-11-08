/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Zoltan Magyar
 */
const loaderUtils = require("loader-utils");
const chalk = require('chalk');
const Promise = require('bluebird');
const crypto = require("crypto");
const fs = require('fs');
const transform = require('./transform');
const cacheDir = './.cache';
try {
    fs.statSync(cacheDir);
} catch (e) {
    fs.mkdirSync(cacheDir);
}
module.exports.raw = true;

module.exports = function (content, map) {
    var self = this;
    if (this.cacheable) this.cacheable();
    var callback = this.async();
    var query = loaderUtils.getOptions(this) || {};
    var debug = query.debug;
    var nameSpace = query.nameSpace;
    var pathMap = query.paths || {};
    var babelConfig = query.babelConfig || {};
    // Babel takes the input source map as an object, but a previous loader may pass it serialised.
    if (typeof map === "string") {
        map = JSON.parse(map);
    }

    /**
     * Resolve the given className as a path using the options->paths mapping defined in the config
     *
     * @param className
     * @returns {*}
     */



    try {
        /**
         * Process each possible ways how required files can be referenced in Ext.js
         * The regexp's below are dealing with the following cases:
         * - requires: [...]
         * - controllers: [...]
         * - stores: [...]
         * - controller: '...' (ViewController definition in the View class)
         * - sViewCache - specific to our codebase - sorry :-)
         *
         * In case of stores and controllers the full namespace is automatically added
         * to the require if not full reference is found
         */
        const configMap = {
            requires: {
                remove: true
            },
            mixins: {
                allowObject: true
            },
            override: true,
            extend: true,
            uses: {
                end: true
            },
            stores: {
                prefix: nameSpace + '.store.'
            },
            controllers: {
                prefix: nameSpace + '.controller.'
            },
            // /sViewCache\(['"](.*)['"],\s{/img,
            controller: true
        };


        let updates = [];
        let properties = Object.keys(configMap);



        function sha1(data) {
            return crypto.createHash("sha1").update(data, "binary").digest("hex");
        }

        function findParentExpression(node) {
            if (!node) return null;
            if (node.type === 'ExpressionStatement' || node.type === 'Program') return node;
            return findParentExpression(node.$parent);
        }

        const contentDigest = sha1(content);
        const cacheFile = cacheDir + '/content_' + contentDigest;
        let tree;

       /* if (fs.existsSync(cacheFile)) {
            const cachedContent = fs.readFileSync(cacheFile, { encoding: 'utf-8' });
            callback(null, cachedContent, map);
            return;
        }
*/
        Promise.each(Object.keys(pathMap), function (map) {
            var objVal = pathMap[map];
            if (objVal.use === undefined) {
                return Promise.resolve();
            } else {

                if (objVal.use.ready) {
                    return objVal.use.ready();
                }
                var use = require(objVal.use);

                var ctor = new use(objVal.options);
                pathMap[map].use = ctor;
                return ctor.ready().then(function (list) {
                    let config = pathMap[map];
                    pathMap[map] = ctor;
                    if (Array.isArray(config.options.aliasForNs)) {
                        config.options.aliasForNs.forEach(ns => {
                            pathMap[ns] = ctor;
                        });
                    }
                    return Promise.resolve();
                });
            }
        }).then(() => {
            let ExtParser = pathMap['Ext'];
            let noParse = false;
            const topRequires = [];
            const bottomRequires = [];
            if (ExtParser.query) {
                let fileProps = ExtParser.fileMapCache[self.resourcePath];
                if (fileProps && fileProps.requires && fileProps.requires.length > 0) {
                    let requireStr = '';
                    fileProps.requires.forEach((require) => {
                        let result = ExtParser.query(require);
                        if (result instanceof Array) {
                            result.forEach((require) => {
                                topRequires.push(require.src);
                            });
                        } else {
                            topRequires.push(ExtParser.query(require).src);
                        }

                    });
                }
                if (fileProps && fileProps.overrides && fileProps.overrides.length > 0) {
                    let requireStr = '';
                    fileProps.overrides.forEach((require) => {
                        let result = ExtParser.query(require);
                        if (result instanceof Array) {
                            result.forEach((require) => {
                                bottomRequires.push(require.src);
                            });
                        } else {
                            const requireSource = ExtParser.query(require).src || require;
                            if (requireSource) {
                                bottomRequires.push(requireSource);
                            }
                        }

                    });
                }
            }
            return transform(content, map, pathMap, babelConfig, topRequires, bottomRequires);
        }).asCallback(callback, { spread: true });

    } catch (e) {
        console.error(chalk.red(`Error parsing ${self.resourcePath}`) + e);
        callback(e);
    }

};
