const babelCore = require('@babel/core');
const loader = require('./loader');

const EXT_SOURCE = "Ext.define('Test.My.Class', { requires: ['Test.Other.Class'] });";

/**
 * Runs the loader the way webpack does: through `this.async()`, resolving with the
 * arguments webpack's callback receives.
 */
function runLoader(source, inputMap, options) {
    return new Promise((resolve) => {
        const context = {
            query: options,
            resourcePath: '/project/Test/My/Class.js',
            cacheable() {},
            async: () => (error, content, map) => resolve({ error, content, map }),
        };
        loader.call(context, source, inputMap);
    });
}

const validOptions = { paths: { Ext: {}, Test: 'Test' } };

describe('loader', () => {
    it('returns the transformed source through the webpack callback', async () => {
        const { error, content } = await runLoader(EXT_SOURCE, null, validOptions);

        expect(error).toBeNull();
        expect(content).toContain('require("Test/Other/Class.js")');
    });

    it('passes a transform error to the webpack callback instead of swallowing it', async () => {
        const { error, content } = await runLoader('Ext.define(', null, validOptions);

        expect(error).toBeInstanceOf(Error);
        expect(content).toBeUndefined();
    });

    it('passes a failure while resolving the Ext path mapping to the webpack callback', async () => {
        const { error } = await runLoader(EXT_SOURCE, null, { paths: {} });

        expect(error).toBeInstanceOf(Error);
    });

    it('accepts the source map object produced by a previous loader', async () => {
        const upstream = babelCore.transformSync(EXT_SOURCE, { sourceMaps: true, filename: 'Class.js' });

        const { error, content, map } = await runLoader(upstream.code, upstream.map, validOptions);

        expect(error).toBeNull();
        expect(content).toContain('require("Test/Other/Class.js")');
        expect(map.sources).toEqual(['Class.js']);
    });
});
