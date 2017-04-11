/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Zoltan Magyar
 */
const loaderUtils = require("loader-utils");
const strip = require('strip-comments');
const esprima = require('esprima');
const esUtils = require('esprima-ast-utils');
const esCodeGen = require('escodegen');
const esQuery = require('esquery');
const _ = require('underscore')
const chalk = require('chalk');

module.exports.raw = true;

module.exports = function (content, map) {

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

        for (var prefix in pathMap) {
            if (pathMap.hasOwnProperty(prefix)) {
                let re = new RegExp('^' + prefix);
                if (className.match(re)) {
                    if (pathMap[prefix] === false) {
                        retVal = false;
                    } else {
                        retVal = prefix.replace(prefix, pathMap[prefix]) + className.replace(prefix, '').replace(/\./g, '/') + '.js';
                    }
                    break;
                }
            }
        }
        return retVal;

    }


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
            extend: true,
            stores: {
                prefix: nameSpace + '.store.'
            },
            controllers: {
                prefix: nameSpace + '.controller.'
            },
            // /sViewCache\(['"](.*)['"],\s{/img,
            controller: true
        }


        let updates = [];
        let properties = Object.keys(configMap);


        function addRequire(className, prefix) {
            if (className.indexOf('.') > 0 || prefix != '') {
                var fileToRequire = resolveClassFile(((className.indexOf('.') > 0) ? '' : prefix) + className);
                if (fileToRequire) {
                    if (debug) console.log(chalk.green('Converting require: ') + className + ' => ' + fileToRequire);
                    return 'require(\'' + fileToRequire + '\');\r\n';
                }
            }
            return '';
        }

        function findParentExpression(node) {
            if (!node) return null;
            if (node.type === 'ExpressionStatement') return node;
            return findParentExpression(node.$parent);
        }

        let tree = esprima.parse(content, {
            range: true
        });

        esUtils.parentize(tree);
        esUtils.traverse(tree, function (node) {
            let requireStr = '';
            if (node && node.type === 'Property' && node.key && properties.includes(node.key.name)) {
                const nodeName = node.key.name;
                if (node && node.value && node.value.type === 'Literal') {
                    debugger;
                    requireStr += addRequire(node.value.value, configMap[nodeName].prefix || '');
                } else if (node && node.value && node.value.type === 'ArrayExpression') {
                    node.value.elements.forEach(function (element) {
                        requireStr += addRequire(element.value, configMap[nodeName].prefix || '');
                    })
                }
                let parent = findParentExpression(node);
                if (configMap[nodeName].remove === true) {
                    updates.push({type: 'remove', start: node.range[0], end: node.range[1]});
                }
                updates.push({type: 'add', start: parent.range[0], end: parent.range[0], data: requireStr});
            }
        })

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
        content = content.replace(/Ext.safeCreate\(['"](.*)['"]/img, function (match, offset, string) {
            return 'require(\'' + resolveClassFile(offset) + '\');\r\n' + match;
        });

        callback(null, content, map);

    } catch (e) {
        console.error(chalk.red('error parsing: ') + e);
    }

};
