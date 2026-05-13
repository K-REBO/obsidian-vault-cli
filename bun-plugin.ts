import { plugin } from "bun";
import path from "path";

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const COMMONLIB = path.join(__dirname, "livesync-commonlib", "src");
const STUBS = path.join(__dirname, "stubs");

plugin({
  name: "obsidian-path-aliases",
  setup(build) {
    // @lib/worker/bgWorker → mock
    build.onResolve({ filter: /^@lib\/worker\/bgWorker/ }, () => ({
      path: path.join(COMMONLIB, "worker/bgWorker.mock.ts"),
    }));

    // pouchdb-browser → pouchdb-http (no IndexedDB in non-browser)
    build.onResolve({ filter: /pouchdb-browser/ }, () => ({
      path: path.join(COMMONLIB, "pouchdb/pouchdb-http.ts"),
    }));

    // @lib/* → livesync-commonlib/src/*
    build.onResolve({ filter: /^@lib\// }, (args) => ({
      path: path.join(COMMONLIB, args.path.slice("@lib/".length)),
    }));

    // @/lib/src/* → livesync-commonlib/src/*
    build.onResolve({ filter: /^@\/lib\/src\// }, (args) => {
      const rest = args.path.slice("@/lib/src/".length);
      if (rest.endsWith(".svelte")) return { path: path.join(STUBS, "svelte-stub.ts") };
      return { path: path.join(COMMONLIB, rest) };
    });

    // @/common/* → stubs/common/*
    build.onResolve({ filter: /^@\/common\// }, (args) => ({
      path: path.join(STUBS, "common", args.path.slice("@/common/".length) + ".ts"),
    }));

    // @/deps, @/main → stubs
    build.onResolve({ filter: /^@\/deps(\.ts)?$/ }, () => ({ path: path.join(STUBS, "deps.ts") }));
    build.onResolve({ filter: /^@\/main$/ }, () => ({ path: path.join(STUBS, "main.ts") }));

    // svelte → stub
    build.onResolve({ filter: /^svelte(\/|$)/ }, () => ({ path: path.join(STUBS, "svelte.ts") }));
  },
});
