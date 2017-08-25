# Ext.js Loader for Webpack


## Install
```bash
npm install --save-dev extjs-loader
```
## Sample
You can find a sample project demonstrating the usage of the loader at https://github.com/zmagyar/extjs-loader-sample

## Usage

The `extjs-loader` interprets `Ext.require()` and `requires`, `stores`, `controllers` and `controller` configs like `requires`.

Use the loader either via your webpack config, CLI or inline.

### Via webpack config (recommended)

**webpack.config.js**
```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.js/,
        use: [
            {
                loader: 'extjs-loader',
                debug: true,
                nameSpace: 'MyApp',
                paths: {
                    'Deft': false,
                    'Ext.ux': 'utils/ux',
                    'Ext': false,
                    'Override': 'app/overrides',
                    'MyApp': 'app'
                }
            } ]
      }
    ]
  }
}
```

## Options

|Name|Default|Description|
|:--:|:-----:|:----------|
|**`debug`**|`false`|Print status messages for debugging purpose|
|**`nameSpace`**|``|Your application namespace. This value is used to prefix store and controller references not provided with full name. E.g. `stores:['User']` is turned into `stores:['MyApp.store.User']`.|
|**`paths`** |`{}`| Define your loader config here. I.e. define how the namespaces in your app should be resolved. If `false` value is used then the given namespace is ignored. It is useful when you include that namespace on other way. E.g. if you include Ext-debug-all.js in your HTML then you do not want to include individual components.|

## Advanced usage

From v0.0.2 [extjs-parser](https://www.npmjs.com/package/extjs-parser) is added as peer dependency to allow processing of the sdk as well.
It allows you to include only those Ext.js classes which are required by your project. I.e. you do not need to create a custom Ext.js build by using Sencha CMD.
It is enough if you use this loader and it will add only the required Ext.js classes to your bundle.

**webpack.config.js example**
```js
module.exports = {
  module: {
    rules: [
      {
        test: /\.js/,
        use: [
            {
                loader: 'extjs-loader',
                debug: true,
                nameSpace: 'MyApp',
                paths: {
                    'Deft': false,
                    'Ext.ux': 'utils/ux',
                    'Ext': new extjsParser({
                        toolkit: 'modern',
                        path:'~/ext/sdk/'
                        }),
                    'Override': 'app/overrides',
                    'MyApp': 'app'
                }
            } ]
      }
    ]
  }
}
```
For more detailed description see [extjs-parser](https://www.npmjs.com/package/extjs-parser) documentation.

<h2 align="center">Maintainers</h2>

<table>
  <tbody>
    <tr>
      <td align="center">
        <img width="150" height="150"
        src="https://avatars1.githubusercontent.com/u/1021537?v=3&s=460">
        </br>
        <a href="https://github.com/zmagyar">Zoltan Magyar</a>
      </td>
      <td align="center">
        <img width="150" height="150"
        src="https://avatars1.githubusercontent.com/u/11589541?v=3&s=460">
        </br>
        <a href="https://github.com/steveetm">Steveetm</a>
      </td>
    </tr>
  <tbody>
</table>

## History

### v0.0.1
Initial release to process project files

### v0.0.2
Support for [extjs-parser](https://www.npmjs.com/package/extjs-parser) to allow processing of Ext.js sdk dependencies
