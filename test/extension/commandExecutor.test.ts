// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT license. See LICENSE file in the project root for details.

import { CommandExecutor } from "../../src/common/commandExecutor";
import { ConsoleLogger } from "../../src/extension/log/ConsoleLogger";
import { Node } from "../../src/common/node/node";
import { ChildProcess } from "../../src/common/node/childProcess";
import { EventEmitter } from "events";
import { Crypto } from "../../src/common/node/crypto";
import * as assert from "assert";
import * as semver from "semver";
import * as sinon from "sinon";
import * as path from "path";
import * as fs from "fs";
import { AppLauncher } from "../../src/extension/appLauncher";

suite("commandExecutor", function () {
    suite("extensionContext", function () {
        let childProcessStubInstance = new ChildProcess();
        let childProcessStub: Sinon.SinonStub & ChildProcess;
        const sandbox = sinon.sandbox.create();
        let Log = new ConsoleLogger();
        const sampleReactNative022ProjectDir = path.join(
            __dirname,
            "..",
            "resources",
            "sampleReactNative022Project",
        );

        let nodeModulesRoot: string;

        teardown(function () {
            let mockedMethods = [Log.log, ...Object.keys(childProcessStubInstance)];

            mockedMethods.forEach(method => {
                if (method.hasOwnProperty("restore")) {
                    (<any>method).restore();
                }
            });

            childProcessStub.restore();
            sandbox.restore();
        });

        setup(() => {
            childProcessStub = sinon
                .stub(Node, "ChildProcess")
                .returns(childProcessStubInstance) as ChildProcess & Sinon.SinonStub;

            sandbox.stub(
                AppLauncher,
                "getNodeModulesRootByProjectPath",
                (projectRoot: string) => nodeModulesRoot,
            );

            nodeModulesRoot = sampleReactNative022ProjectDir;
        });

        test("should execute a command", async function () {
            let ce = new CommandExecutor(nodeModulesRoot, process.cwd(), Log);
            let loggedOutput: string = "";

            sinon.stub(Log, "log", function (message: string, formatMessage: boolean = true) {
                loggedOutput += semver.clean(message) || "";
                console.log(message);
            });

            await ce.execute("node -v");
            assert(loggedOutput);
        });

        test("should reject on bad command", async () => {
            let ce = new CommandExecutor(nodeModulesRoot);

            try {
                await ce.execute("bar");
                assert.fail(null, null, "bar should not be a valid command");
            } catch (reason) {
                console.log(reason.message);
                assert.strictEqual(reason.errorCode, 101);
                assert.strictEqual(reason.errorLevel, 0);
            }
        });

        test("should reject on good command that fails", async () => {
            let ce = new CommandExecutor(nodeModulesRoot);

            try {
                await ce.execute("node install bad-package");
                assert.fail(null, null, "node should not be able to install bad-package");
            } catch (reason) {
                console.log(reason.message);
                assert.strictEqual(reason.errorCode, 101);
                assert.strictEqual(reason.errorLevel, 0);
            }
        });

        test("should spawn a command", async () => {
            let ce = new CommandExecutor(nodeModulesRoot);

            sinon.stub(Log, "log", function (message: string, formatMessage: boolean = true) {
                console.log(message);
            });

            return await ce.spawn("node", ["-v"]);
        });

        test("spawn should reject a bad command", async () => {
            let ce = new CommandExecutor(nodeModulesRoot);
            sinon.stub(Log, "log", function (message: string, formatMessage: boolean = true) {
                console.log(message);
            });

            try {
                return await ce.spawn("bar", ["-v"]);
            } catch (reason) {
                console.log(reason.message);
                assert.strictEqual(reason.errorCode, 101);
                assert.strictEqual(reason.errorLevel, 0);
            }
        });

        test("should not fail on react-native command without arguments", async () => {
            (sinon.stub(childProcessStubInstance, "spawn") as Sinon.SinonStub).returns({
                stdout: new EventEmitter(),
                stderr: new EventEmitter(),
                outcome: Promise.resolve(),
            });

            try {
                await new CommandExecutor(nodeModulesRoot).spawnReactCommand("run-ios").outcome;
            } catch (error) {
                assert.fail("react-native command was not expected to fail");
            }
        });

        suite("getReactNativeVersion", () => {
            const reactNativePackageDir = path.join(
                sampleReactNative022ProjectDir,
                "node_modules",
                "react-native",
            );
            const fsHelper = new Node.FileSystem();

            suiteSetup(() => {
                fsHelper.makeDirectoryRecursiveSync(reactNativePackageDir);
            });

            suiteTeardown(() => {
                fsHelper.removePathRecursivelySync(
                    path.join(sampleReactNative022ProjectDir, "node_modules"),
                );
            });

            test("getReactNativeVersion should return version string if 'version' field is found in react-native package package.json file from node_modules", async () => {
                const commandExecutor: CommandExecutor = new CommandExecutor(
                    nodeModulesRoot,
                    sampleReactNative022ProjectDir,
                );
                const versionObj = {
                    version: "^0.22.0",
                };

                fs.writeFileSync(
                    path.join(reactNativePackageDir, "package.json"),
                    JSON.stringify(versionObj, null, 2),
                );

                const version = await commandExecutor.getReactNativeVersion();
                assert.strictEqual(version, "0.22.0");
            });

            test("getReactNativeVersion should return version string if there isn't 'version' field in react-native package's package.json file", async () => {
                const commandExecutor: CommandExecutor = new CommandExecutor(
                    nodeModulesRoot,
                    sampleReactNative022ProjectDir,
                );
                const testObj = {
                    test: "test",
                };

                fs.writeFileSync(
                    path.join(reactNativePackageDir, "package.json"),
                    JSON.stringify(testObj, null, 2),
                );

                const version = await commandExecutor.getReactNativeVersion();
                assert.strictEqual(version, "0.22.2");
            });
        });

        suite("ReactNativeClIApproaches", function () {
            const RNGlobalCLINameContent: any = {
                ["react-native-tools.reactNativeGlobalCommandName"]: "",
            };

            test("selectReactNativeCLI should return local CLI", (done: Mocha.Done) => {
                const localCLIPath = path.join(
                    sampleReactNative022ProjectDir,
                    "node_modules",
                    ".bin",
                    "react-native",
                );
                let commandExecutor: CommandExecutor = new CommandExecutor(
                    nodeModulesRoot,
                    sampleReactNative022ProjectDir,
                );
                CommandExecutor.ReactNativeCommand =
                    RNGlobalCLINameContent["react-native-tools.reactNativeGlobalCommandName"];
                assert.strictEqual(commandExecutor.selectReactNativeCLI(), localCLIPath);
                done();
            });

            test("selectReactNativeCLI should return global CLI", (done: Mocha.Done) => {
                const randomHash = new Crypto().hash(Math.random().toString(36).substring(2, 15));
                RNGlobalCLINameContent[
                    "react-native-tools.reactNativeGlobalCommandName"
                ] = randomHash;
                let commandExecutor: CommandExecutor = new CommandExecutor(
                    nodeModulesRoot,
                    sampleReactNative022ProjectDir,
                );
                CommandExecutor.ReactNativeCommand =
                    RNGlobalCLINameContent["react-native-tools.reactNativeGlobalCommandName"];
                assert.strictEqual(commandExecutor.selectReactNativeCLI(), randomHash);
                done();
            });
        });
    });
});
