/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Zoltan Magyar
 */
const loaderUtils = require("loader-utils");
const strip = require('strip-comments');
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

    var pwd = this.context;

    /**
     * Regexp helper
     *
     * @param string
     * @param regex
     * @param index
     * @returns {Array}
     * @private
     */
    function _getMatches(string, regex, index) {
        index || (index = 1); // default to the first capturing group
        var matches = [];
        var match;
        while (match = regex.exec(string)) {
            matches.push(match[index]);
        }
        return matches;
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
                        retVal = prefix.replace(prefix, pathMap[prefix])+className.replace(prefix,'').replace(/\./g, '/') + '.js';
                    }
                    break;
                }
            }
        }
        return retVal;

    }

    /**
     * Process the given content and parse for fragments required to be turned into require() statements
     *
     * @param content
     * @param regexp
     * @param prefix
     * @returns {string}
     */
    function getRequires(content, regexp, prefix) {
        let matches = _getMatches(content, regexp);
        let requireStr = '';

        if (matches && matches.length > 0) {
            matches.forEach(function (item) {
                item.replace(/\s/g, '').replace(/['\"]/g, '').split(',').forEach(function (className) {
                    if (className.indexOf('.') > 0 || prefix != '') {
                        var fileToRequire = resolveClassFile(((className.indexOf('.') > 0) ? '' : prefix) + className);
                        if (fileToRequire) {
                            if (debug) console.log(chalk.green('Converting require: ') + className + ' => ' + fileToRequire);
                            requireStr += 'require(\'' + fileToRequire + '\');\r\n';
                        }
                    }
                });
            });
        }
        return requireStr;
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
        let requireStr = [
            /override:\s*['"](.*)['"]/img,
            /requires:\s*\[([^\[\]]*|\s*)\]\s*/img,
            /extend:\s*['"](.*)['"]/img,
            {
                regex: /stores:\s*\[([^\[\]]*|\s*)\]\s*/img,
                prefix: nameSpace + '.store.'
            },
            {
                regex: /controllers:\s*\[([^\[\]]*|\s*)\]\s*/img,
                prefix: nameSpace + '.controller.'
            },
            /sViewCache\(['"](.*)['"],\s{/img,
            /controller:\s*['"](.*)['"]/img,
        ].reduce(function (acc, item) {
            let prefix = item.prefix || '';
            let regex = item.regex || item;
            //
            // Remove comments before collecting requires to avoid adding
            // requires appearing in comments
            //
            return acc + getRequires(strip(content), regex, prefix);
        }, '');

        /**
         * Some
         */
        content = content.replace(/Ext.safeCreate\(['"](.*)['"]/img, function (match, offset, string) {
            return 'require(\'' + resolveClassFile(offset) + '\');\r\n' + match;
        });

        callback(null, requireStr + content, map);

    } catch (e) {
        console.error(chalk.red('error parsing: ') + e);
    }

};
