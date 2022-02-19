'use strict'
require('colors');
const { promises: fs } = require('fs');
const fsSync = require('fs');
const _ = require('lodash');
const mkdirp = require('mkdirp');
const { basename, resolve: resolvePath } = require('path');
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
    console.info(`Compiling ${inputFiles.map(f => basename(f)).join(', ')} with ${solc.version()}...`)
    const contents = await Promise.all(
        inputFiles.map(f => fs.readFile(f, { encoding: 'utf-8' })),
    );
    const inputContentByPath = inputFiles.length > 0
        ? _.fromPairs(inputFiles.map((p, i) => [p, contents[i]]))
        : {};
    const standardInput = createStandardInput(inputContentByPath, config);
    const compilerOutput = JSON.parse(solc.compile(
        JSON.stringify(standardInput),
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
    return {
        standardInput,
        sources: compilerOutput.sources,
        contracts: _.omitBy(
            compilerOutput.contracts,
            (contracts, path) => !inputFiles.includes(path)
        ),
    };
}

function resolveImportContent(path) {
    try {
        path = require.resolve(path);
    } catch (err) {
        path = require.resolve(path, { paths: [`${process.cwd()}`] });
    }
    return { contents: fsSync.readFileSync(path, { encoding: 'utf-8' }) };
}

async function writeCompilationOutput(compilationOutput, outputDir, standardInputName) {
    await mkdirp(outputDir);
    const writePromises = [];
    for (const [path, contracts] of Object.entries(compilationOutput.contracts)) {
        for (const [contractName, contract] of Object.entries(contracts)) {
            writePromises.push(fs.writeFile(
                resolvePath(outputDir, `${contractName}.output.json`),
                JSON.stringify(
                    _.omitBy(
                        {
                            abi: contract.abi,
                            bytecode: addHexPrefix(contract.evm.bytecode.object),
                            deployedBytecode: addHexPrefix(contract.evm.deployedBytecode.object),
                            bytecodeLinkReferences: _.get(
                                contract,
                                ['evm', 'bytecode', 'linkReferences'],
                                {},
                            ),
                            deployedBytecodeLinkReferences: _.get(
                                contract,
                                ['evm', 'deployedBytecode', 'linkReferences'],
                                {},
                            ),
                            deployedBytecodeImmutableReferences: createImmutables(
                                contract,
                                compilationOutput.sources,
                            ),
                        },
                        v => _.isEmpty(v),
                    ),
                    null,
                    '\t',
                ),
                { encoding: 'utf-8' },
            ));
        }
    }
    if (standardInputName) {
        writePromises.push(fs.writeFile(
            resolvePath(outputDir, standardInputName),
            JSON.stringify(compilationOutput.standardInput, null, '\t'),
        ));
    }
    return Promise.all(writePromises);
}

function addHexPrefix(bytes) {
    if (bytes.startsWith('0x')) {
        return bytes;
    }
    return `0x${bytes}`;
}

function createImmutables(contract, sources) {
    const references = _.get(
        contract,
        ['evm', 'deployedBytecode', 'immutableReferences'],
        {},
    );
    return _.mapKeys(references, (_v,id) => findImmutableVariable(contract, sources, id));
}

function findImmutableVariable(contract, sources, id) {
    id = parseInt(id);
    let currentContract;
    const _walk = node => {
        if (node.nodeType === 'ContractDefinition') {
            currentContract = node.name;
        }
        if (node.id === id) {
            return `${currentContract}.${node.name}`;
        }
        for (const ch of node.nodes || []) {
            const variable = _walk(ch);
            if (variable) {
                return variable;
            }
        }
    };
    for (const sourceFile in sources) {
        const variable = _walk(sources[sourceFile].ast);
        if (variable) {
            return variable;
        }
    }
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
                    '': [ 'ast' ],
                },
            },
        },
    };
}

module.exports = {
    compileFiles,
    writeCompilationOutput
}
