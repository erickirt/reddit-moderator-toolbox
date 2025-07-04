/* eslint-env node */

import path from 'node:path';

import commonjs from '@rollup/plugin-commonjs';
import {nodeResolve} from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';
import postcss from 'rollup-plugin-postcss';

// we have three build types: dev, beta, and stable. dev is the default and the
// other two types are mostly handled by CI, but we include some basic checks to
// make sure things stay sane
let buildType = process.env.BUILD_TYPE;
if (!buildType) {
    buildType = 'dev';
} else if (!['stable', 'beta', 'dev'].includes(buildType)) {
    console.warn('warning: unrecognized BUILD_TYPE', buildType, '- using dev instead');
    buildType = 'dev';
}

// beta and stable builds are both distributable; warn if we make a build of
// this type without providing a commit SHA
const buildSha = process.env.BUILD_SHA;
if (buildType !== 'dev' && !buildSha) {
    console.warn(
        'warning: no BUILD_SHA provided but this is not a dev build; do not distribute builds without BUILD_SHA',
    );
}

// TODO: Pull entry point info and copied files from manifest itself
export default ['chrome', 'firefox'].flatMap(platform => [
    {
        input: 'extension/data/init.ts',
        output: {
            file: `build/${platform}/data/init.js`,
            // Sourcemaps without extra `web_accessible_resources` entries
            sourcemap: buildType === 'dev' ? 'inline' : false,
        },
        plugins: [
            replace({
                preventAssignment: true,
                values: {
                    // the jsx runtime wants this to be defined
                    'process.env.NODE_ENV': JSON.stringify(process.env.BUILD_TYPE === 'dev' ? undefined : 'production'),
                    // used at runtime to control beta settings, prerelease
                    // version display in the modbar, etc
                    'BUILD_TYPE': JSON.stringify(buildType),
                    // the commit we're building from, mostly helpful in betas
                    'BUILD_SHA': JSON.stringify(buildSha ?? null),
                },
            }),
            postcss({
                extract: path.resolve(`build/${platform}/data/bundled.css`),
            }),
            nodeResolve(),
            commonjs(),
            // HACK: see https://github.com/rollup/plugins/issues/1629
            typescript({
                include: 'extension/**/*.(ts|tsx|js|jsx)',
                compilerOptions: {
                    outDir: `build/${platform}/data`,
                },
            }),
            // Copy files not processed by Rollup over to the build directory
            copy({
                targets: [
                    // The manifest
                    {
                        src: `extension/${platform}_manifest.json`,
                        dest: `build/${platform}`,
                        rename: 'manifest.json',
                    },
                    // Non-script assets
                    {src: 'extension/data/images', dest: `build/${platform}/data`},
                    {src: 'extension/data/styles', dest: `build/${platform}/data`},
                    // tbmigrate is weird
                    {src: 'extension/data/tbmigrate.js', dest: `build/${platform}/data`},
                ],
            }),
        ],
        // When bundling a bunch of modules together, directives in each module
        // end up not really working because the output is just one module and
        // the build doesn't know what to do. Some React libraries have started
        // including "use client" directives to indicate to certain build
        // systems that the code in those modules isn't meant to be run as part
        // of server-side rendering. We don't care about any of that (we're a
        // browser extension, we *only* have client-side code) and the directive
        // has no meaning at runtime so we just ignore Rollup's warnings there
        onwarn (warning, defaultHandler) {
            if (
                warning.code === 'MODULE_LEVEL_DIRECTIVE'
                && warning.message.includes('use client')
            ) {
                return;
            }
            defaultHandler(warning);
        },
    },
    {
        input: 'extension/data/background/index.ts',
        output: {
            file: `build/${platform}/data/background/index.js`,
            sourcemap: process.env.NODE_ENV === 'production' ? false : 'inline',
        },
        plugins: [
            nodeResolve(),
            commonjs(),
            typescript({
                compilerOptions: {
                    outDir: `build/${platform}/data/background`,
                },
            }),
        ],
    },
]);
