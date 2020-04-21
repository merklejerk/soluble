'use strict'
require('colors');
const { promises: fs } = require('fs');
const fsSync = require('fs');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const { resolve: resolvePath } = require('path');
const solc = require('solc');

const DEFAULT_CONFIG = {
    compilerSettings: {
        evmVersion: 'istanbul',
        optimizer: {
            enabled: true,
            runs: 200,
        }
    },
};

async function compileFiles(inputFiles, config) {
    config = {
        ...DEFAULT_CONFIG,
        ...config,
    };
    if (inputFiles.length === 0) {
        return {};
    }
    const contents = await Promise.all(
        inputFiles.map(f => fs.readFile(f, { encoding: 'utf-8' })),
    );
    const inputContentByPath = inputFiles.length > 0
        ? Object.fromEntries(inputFiles.map((p, i) => [p, contents[i]]))
        : {};
    const compilerOutput = JSON.parse(solc.compile(
        JSON.stringify(createStandardInput(inputContentByPath, config)),
        { import: resolveImportContent },
    ));
    if (compilerOutput.errors) {
        let hasErrors = false;
        for (const err of compilerOutput.errors) {
            if (err.severity === 'error') {
                hasErrors = true;
                console.error(`${'ERROR'.bold.red}: ${err.formattedMessage}`);
            } else if (err.severity === 'warning') {
                console.warn(`${'Warning'.bold.yellow}: ${err.formattedMessage}`);
            }
        }
        if (hasErrors) {
            throw new Error('Compilation errors encountered.');
        }
    }
    return _.omitBy(
        compilerOutput.contracts,
        (contracts, path) => !inputFiles.includes(path)
    );
}

function resolveImportContent(path) {
    path = require.resolve(path);
    return { contents: fsSync.readFileSync(path, { encoding: 'utf-8' }) };
}

async function writeCompilationOutput(compilationOutput, outputDir) {
    await mkdirp(outputDir);
    const writePromises = [];
    for (const [path, contracts] of Object.entries(compilationOutput)) {
        for (const [contractName, contract] of Object.entries(contracts)) {
            writePromises.push(fs.writeFile(
                resolvePath(outputDir, `${contractName}.output.json`),
                JSON.stringify(
                    {
                        abi: contract.abi,
                        bytecode: contract.evm.bytecode.object,
                        deployedBytecode: contract.evm.deployedBytecode.object,
                        ...(Object.keys(contract.evm.bytecode.linkReferences) !== 0
                            ? contract.evm.bytecode.linkReferences
                            : {}),
                    },
                    null,
                    '\t',
                ),
                { encoding: 'utf-8' },
            ));
        }
    }
    return Promise.all(writePromises);
}

function createStandardInput(contentByPath, config) {
    return {
        language: 'Solidity',
        sources: _.mapValues(contentByPath, v => ({ content: v })),
        settings: {
            ...config.compilerSettings,
            outputSelection: {
                '*': {
                    '*': [ 'abi', 'metadata', 'evm.bytecode', 'evm.deployedBytecode' ],
                },
            },
        },
    };
}

module.exports = {
    compileFiles,
    writeCompilationOutput
}
