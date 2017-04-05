/*
 MIT License http://www.opensource.org/licenses/mit-license.php
 Author Zoltan Magyar
 */
var loaderUtils = require("loader-utils");

const chalk = require('chalk');

module.exports.raw = true;

module.exports = function (content, map) {

    if (this.cacheable) this.cacheable();
    var callback = this.async();
    var query = loaderUtils.getOptions(this) || {};
    var debug = query.debug;
    var pathMap = query.paths || {};

    if (map !== null && typeof map !== "string") {
        map = JSON.stringify(map);
    }

    var pwd = this.context;


    function getMatches(string, regex, index) {
        index || (index = 1); // default to the first capturing group
        var matches = [];
        var match;
        while (match = regex.exec(string)) {
            matches.push(match[index]);
        }
        return matches;
    }


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
                        retVal = className.replace(prefix, pathMap[prefix]).replace(/\./g, '/') + '.js';
                    }
                    break;
                }
            }
        }
        return retVal;

    }

    function getRequires(content, regexp, prefix) {
        let matches = getMatches(content, regexp);
        let requireStr = '';

        if (matches && matches.length > 0) {
            matches.forEach(function (item) {
                item.replace(/\s/g, '').replace(/['\"]/g, '').split(',').forEach(function (className) {
                    if (className.indexOf('.') > 0 || prefix != '') {
                        var fileToRequire = resolveClassFile(prefix + className);
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

        let requireStr = [/extend:\s*['"](.*)['"]/img,
            {
                regex: /stores:\s*\[([^\[\]]*|\s*)\]\s*/img,
                prefix: 'FieldServices.store.'
            },
            /controllers:\s*\[([^\[\]]*|\s*)\]\s*/img,
            /sViewCache\(['"](.*)['"],\s{/img,
            /controller:\s*['"](.*)['"]/img,
            /requires:\s*\[([^\[\]]*|\s*)\]\s*/img
        ].reduce(function (acc, item) {
            let prefix = item.prefix || '';
            let regex = item.regex || item;
            return acc + getRequires(content, regex, prefix);
        }, '');

        content = content.replace(/Ext.safeCreate\(['"](.*)['"]/img, function (match, offset, string) {
            return 'require(\'' + resolveClassFile(offset) + '\');\r\n' + match;
        });

        callback(null, requireStr + content, map);

    } catch (e) {
        console.error(chalk.red('error parsing: ') + e);
    }

};
