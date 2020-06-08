Lean solc compiler wrapper. Because sometimes you just want to compile some damn solidity.

## Usage
This package requires `solc` but will not install it as a dependency. This is to
ensure it always uses the `solc` version provided by your package.

```bash
yarn add solc
yarn add soluble
yarn soluble --help
yarn soluble compile -O path/to/output/dir -C path/to/config/file.json path/to/source/files/*.sol
```
