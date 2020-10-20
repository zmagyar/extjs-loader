/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Zoltan Magyar
 */
const loaderUtils = require("loader-utils");
const esprima = require('esprima');
const escodegen = require('escodegen');
const esUtils = require('esprima-ast-utils');
const chalk = require('chalk');
const Promise = require('bluebird');
const crypto = require("crypto");
const fs = require('fs');

const cacheDir = './.cache';

module.exports.raw = true;

module.exports = function (content, map) {
    var self = this;
    if (this.cacheable) this.cacheable();
    var callback = this.async();
    var query = loaderUtils.getOptions(this) || {};
    var debug = query.debug;
    var nameSpace = query.nameSpace;
    var pathMap = query.paths || {};

    if (map !== null && typeof map !== "string") {
        map = JSON.stringify(map);
    }

    /**
     * Resolve the given className as a path using the options->paths mapping defined in the config
     *
     * @param className
     * @returns {*}
     */
    function resolveClassFile(className) {
        let fileToLoad = className;
        let retVal = className;
        retVal = [];
        for (var prefix in pathMap) {
            if (pathMap.hasOwnProperty(prefix)) {
                let re = new RegExp('^' + prefix);
                if (className.match(re)) {
                    if (pathMap[prefix] === false) {
                        retVal = [];
                    } else {
                        if (typeof pathMap[prefix].query === 'function') {

                            classes = pathMap[prefix].query(className);
                            if (classes instanceof Array) {
                                retVal = classes.map((className) => {
                                    return className.src
                                });
                            } else {
                                try {
                                    retVal = [classes.src, ...classes.overrides];
                                } catch (e) {
                                    console.log(prefix, className);
                                }
                            }
                        } else {
                            retVal = [prefix.replace(prefix, pathMap[prefix]) + className.replace(prefix, '').replace(/\./g, '/') + '.js'];
                        }
                    }
                    break;
                }
            }
        }
        return [...retVal];

    }


    try {

        try {
            fs.statSync(cacheDir);
        } catch (e) {
            fs.mkdirSync(cacheDir);
        }
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

        function addRequire(className, prefix) {
            if (className.indexOf('.') > 0 || prefix != '' || className === 'Ext') {
                var fileToRequire = resolveClassFile(((className.indexOf('.') > 0) ? '' : prefix) + className);
                if (fileToRequire.length > 0) {
                    let reqStr = '';
                    fileToRequire.forEach((req) => {
                        if (debug) console.log(chalk.green('Converting require: ') + className + ' => ' + req);

                        if (typeof req === 'undefined') {
                            console.log(chalk.red('Converting require: ') + className + ' => ' + req);
                        }
                        reqStr += `require(${escodegen.generate({ type: 'Literal', value: req })});\r\n`;
                    });
                    return reqStr;
                }
            }
            return '';
        }

        function sha1(data) {
            return crypto.createHash("sha1").update(data, "binary").digest("hex");
        }

        function findParentExpression(node) {
            if (!node) return null;
            if (node.type === 'ExpressionStatement' || node.type === 'Program') return node;
            return findParentExpression(node.$parent);
        }

        const contentDigest = sha1(content);
        const cacheFile = cacheDir + '/' + contentDigest;
        let tree;

        if (fs.existsSync(cacheFile)) {
            tree = JSON.parse(fs.readFileSync(cacheFile, { encoding: 'utf-8' }));
        } else {
            tree = esprima.parse(content, {
                range: true
            });
            fs.writeFileSync(cacheFile, JSON.stringify(tree));
        }


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
                        })
                    }
                    return Promise.resolve();
                })
            }
        }).then(() => {
            let ExtParser = pathMap['Ext'];
            if (ExtParser.query) {
                let fileProps = ExtParser.fileMapCache[self.resourcePath];
                if (fileProps && fileProps.requires && fileProps.requires.length > 0) {
                    let requireStr = '';
                    fileProps.requires.forEach((require) => {
                        let result = ExtParser.query(require);
                        if (result instanceof Array) {
                            result.forEach((require) => {
                                requireStr += `require('${require.src}');`
                            });
                        } else {
                            requireStr += `require('${ExtParser.query(require).src}');`
                        }

                    });
                    updates.push({ type: 'add', start: 0, end: 0, data: requireStr });
                }
            }
            esUtils.parentize(tree);
            esUtils.traverse(tree, function (node) {
                let requireStr = '';
                if (node && node.type === 'Property' && node.key && properties.includes(node.key.name)) {
                    const nodeName = node.key.name;

                    if (node && node.value && node.value.type === 'Literal') {
                        if (node.value.value !== null) {
                            requireStr += addRequire(node.value.value, configMap[nodeName].prefix || '');
                        }
                    } else if (node && node.value && node.value.type === 'ArrayExpression') {
                        node.value.elements.forEach(function (element) {
                            requireStr += addRequire(element.value, configMap[nodeName].prefix || '');
                        })
                    } else if (node && node.value && node.value.type === 'ObjectExpression' && node.value.properties && node.value.properties.length > 0 && configMap[node.key.name].allowObject) {
                        node.value.properties.forEach(function (objectNode) {
                            if (objectNode && objectNode.value && objectNode.value.type === 'Literal') {
                                if (objectNode.value !== null) {
                                    requireStr += addRequire(objectNode.value.value, configMap[nodeName].prefix || '');
                                }
                            }
                        })
                    }
                    if (requireStr !== '') {
                        let parent = findParentExpression(node);
                        if (configMap[nodeName].remove === true) {
                            updates.push({ type: 'remove', start: node.range[0], end: node.range[1] });
                        }
                        updates.push({
                            type: 'add',
                            start: parent.range[configMap[nodeName].end ? 1 : 0],
                            end: parent.range[configMap[nodeName].end ? 1 : 0],
                            data: requireStr
                        });
                    }
                }
            });

            updates.sort((a, b) => {
                return b.end - a.end
            }).forEach(updateItem => {
                if (updateItem.type === 'remove') {
                    content = content.slice(0, updateItem.start) + content.slice(updateItem.end).replace(/^\s*,/im, '');
                } else if (updateItem.type === 'add') {
                    content = [content.slice(0, updateItem.start), updateItem.data, content.slice(updateItem.start)].join('');
                }
            });

            /**
             * Some
             */
            try {
                content = content.replace(/Ext.safeCreate\(['"](.*)['"]/img, function (match, offset, string) {
                    const resolvedClasses = resolveClassFile(offset);
                    let className;
                    if (resolvedClasses.length === 0) {
                        throw new Error(`Couldn't resolve class: ${offset}`)
                    } else {
                        className = resolvedClasses[0];
                    }
                    return 'require(' + escodegen.generate({
                        type: 'Literal',
                        value: className
                    }) + ');\r\n' + match;
                });
                callback(null, content, map);
            } catch (e) {
                callback(e)
            }
        });

    } catch (e) {
        console.error(chalk.red('error parsing: ') + e);
        callback(e);
    }

};
