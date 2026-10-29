/**
 * obsidian-vault CLI entry point
 *
 * Run with:
 *   node --import tsx/esm --experimental-loader ./path-loader.mjs src/index.ts <command> [args]
 */

import { run, handle, flush, Plugin } from "@oclif/core";
import pjson from "../package.json" with { type: "json" };
import commandsDefault from "./commands/index.js";

// In Bun compiled binaries, import.meta.url is a virtual /$bunfs/ path.
// oclif's dynamic module loading (require/import by computed path) fails in the
// Bun virtual FS because node:fs APIs can't read /$bunfs/ at runtime.
//
// Fix: patch Plugin.prototype.loadCommandsFromTarget so that for /$bunfs/ roots
// it returns the statically imported commands object instead of dynamically
// requiring the commands file. All other code paths are unaffected.
const isBunCompiled = import.meta.url.startsWith("file:///$bunfs/");

if (isBunCompiled) {
    const proto = Plugin.prototype as any;
    const orig = proto.loadCommandsFromTarget;
    proto.loadCommandsFromTarget = async function () {
        if ((this.root as string | undefined)?.startsWith("/$bunfs/")) {
            return (this.commandCache ??= commandsDefault);
        }
        return orig.call(this);
    };
}

const opts = isBunCompiled
    ? { root: new URL(".", import.meta.url).pathname.replace(/\/+$/, ""), pjson: pjson as any }
    : import.meta.url;

await run(process.argv.slice(2), opts)
    .catch(handle)
    .finally(async () => {
        await flush();
    });
