import commonjs from "@rollup/plugin-commonjs";
import nodeResolve from "@rollup/plugin-node-resolve";
import terser from "@rollup/plugin-terser";
import typescript from "@rollup/plugin-typescript";


/**
 * @type {import('rollup').RollupOptions}
 */
const config = {
  input: "src/index.ts",
  output: {
    esModule: true,
    file: "dist/index.js",
    format: "es",
  },
  plugins: [
    commonjs(),
    nodeResolve({ preferBuiltins: true }),
    typescript(),
    terser(),
  ]
};

// noinspection JSUnusedGlobalSymbols
export default config;
