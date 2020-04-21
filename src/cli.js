#!/usr/bin/env node
'use strict'
const { promises: fs } = require('fs');
const glob = require('glob');
const _ = require('lodash');
const { resolve: resolvePath } = require('path');
const { promisify } = require('util');
const { compileFiles, writeCompilationOutput } = require('./compile');

const args = require('yargs')
    .command(
        'compile <files..>',
        'compile solidity source files',
        yargs => yargs
            .option('outputDir', {
                alias: 'O',
                type: 'string',
                default: '.',
            })
            .option('configFile', {
                alias: 'C',
                type: 'string',
                default: 'soluble.json',
            }),
        async argv => {
            const config = await loadBuildConfig(argv.configFile);
            const inputFiles = await resolveInputFiles(argv.files || ['*.sol']);
            await writeCompilationOutput(
                await compileFiles(inputFiles, config),
                resolvePath(argv.outputDir),
            );
        },
    )
    .demandCommand(1)
    .argv;

async function loadBuildConfig(configFile) {
    try {
        return JSON.parse(
            await fs.readFile(resolvePath(configFile), { encoding: 'utf-8' }),
        );
    } catch (err) {
        if (err.code !== 'ENOENT') {
            throw err;
        }
    }
}

async function resolveInputFiles(files) {
    return (await Promise.all(
            files.map(f => promisify(glob)(f)),
        ))
        .reduce((acc, v) => acc.concat(v), [])
        .map(p => resolvePath(p));
}
