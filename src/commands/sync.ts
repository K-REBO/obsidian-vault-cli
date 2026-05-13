/**
 * sync — Sync vault to a local directory (rsync-style)
 *
 * Unlike dump, sync:
 *   - Skips files that are already up-to-date (mtime + size check)
 *   - Downloads changed/new files in parallel
 *   - Optionally deletes local files not present in the vault (--delete)
 */

import { Command, Args, Flags } from "@oclif/core";
import { createDFM, listFiles, type VaultEntry } from "../lib/connection.ts";
import fs from "node:fs";
import path from "node:path";

export default class Sync extends Command {
    static description = "Sync vault to a local directory (rsync-style: skip unchanged, parallel download)";

    static examples = [
        "<%= config.bin %> sync",
        "<%= config.bin %> sync ./my-vault",
        "<%= config.bin %> sync ./my-vault --delete",
        "<%= config.bin %> sync ./my-vault --parallel 16 --dry-run",
    ];

    static args = {
        dir: Args.string({
            description: "Output directory (default: ./vault-dump)",
            required: false,
        }),
    };

    static flags = {
        verbose: Flags.boolean({
            char: "v",
            description: "Show verbose LiveSync log output",
            default: false,
        }),
        quiet: Flags.boolean({
            char: "q",
            description: "Only show summary",
            default: false,
        }),
        delete: Flags.boolean({
            description: "Delete local files not present in vault",
            default: false,
        }),
        "dry-run": Flags.boolean({
            char: "n",
            description: "Show what would be transferred without doing it",
            default: false,
        }),
        parallel: Flags.integer({
            char: "p",
            description: "Number of concurrent downloads",
            default: 8,
        }),
        "skip-errors": Flags.boolean({
            description: "Skip files that fail to read instead of aborting",
            default: false,
        }),
    };

    async run(): Promise<void> {
        const { args, flags } = await this.parse(Sync);
        const outputDir = path.resolve(args.dir || "./vault-dump");
        const dryRun = flags["dry-run"];

        const dfm = await createDFM(flags.verbose);
        try {
            const remoteFiles = await listFiles(dfm);

            if (remoteFiles.length === 0) {
                this.log("Vault is empty, nothing to sync.");
                return;
            }

            // ── 1. Classify each remote file ────────────────────────────────
            const toDownload: VaultEntry[] = [];
            let skipped = 0;

            for (const file of remoteFiles) {
                const localPath = path.join(outputDir, file.path);
                if (needsUpdate(localPath, file)) {
                    toDownload.push(file);
                } else {
                    skipped++;
                }
            }

            // ── 2. Handle --delete ───────────────────────────────────────────
            const toDelete: string[] = [];
            if (flags.delete && fs.existsSync(outputDir)) {
                const remotePaths = new Set(remoteFiles.map(f => f.path));
                for (const localRel of walkDir(outputDir)) {
                    if (!remotePaths.has(localRel)) toDelete.push(localRel);
                }
            }

            // ── 3. Summary / dry-run ─────────────────────────────────────────
            this.log(`Remote: ${remoteFiles.length} files  |  Download: ${toDownload.length}  |  Skip: ${skipped}  |  Delete: ${toDelete.length}`);
            if (dryRun) {
                for (const f of toDownload) this.log(`  + ${f.path}`);
                for (const f of toDelete)   this.log(`  - ${f}`);
                this.log("Dry run — no changes made.");
                return;
            }
            if (toDownload.length === 0 && toDelete.length === 0) {
                this.log("Already up-to-date.");
                return;
            }

            // ── 4. Parallel download with concurrency limit ──────────────────
            let succeeded = 0;
            let failed = 0;
            const concurrency = flags.parallel;

            const downloadOne = async (file: VaultEntry): Promise<void> => {
                const outPath = path.join(outputDir, file.path);
                try {
                    const doc = await dfm.getById(file.id);
                    if (!doc || !("data" in doc)) throw new Error("No data in document");
                    const content = (doc as any).data.join("");

                    fs.mkdirSync(path.dirname(outPath), { recursive: true });
                    fs.writeFileSync(outPath, content, "utf-8");

                    // Sync mtime so next run can skip this file
                    if (file.mtime) {
                        const t = file.mtime / 1000;
                        fs.utimesSync(outPath, t, t);
                    }

                    if (!flags.quiet) this.log(`  +  ${file.path}`);
                    succeeded++;
                } catch (err) {
                    const msg = `FAIL ${file.path}: ${(err as Error).message?.slice(0, 80)}`;
                    if (flags["skip-errors"]) {
                        this.warn(msg);
                        failed++;
                    } else {
                        throw new Error(msg);
                    }
                }
            };

            // Run downloads in batches of `concurrency`
            for (let i = 0; i < toDownload.length; i += concurrency) {
                await Promise.all(toDownload.slice(i, i + concurrency).map(downloadOne));
            }

            // ── 5. Delete ────────────────────────────────────────────────────
            for (const rel of toDelete) {
                const p = path.join(outputDir, rel);
                fs.rmSync(p);
                if (!flags.quiet) this.log(`  -  ${rel}`);
                pruneEmptyDirs(path.dirname(p), outputDir);
            }

            this.log(`\nSync complete: ${succeeded} downloaded, ${skipped} skipped, ${toDelete.length} deleted, ${failed} failed`);
            this.log(`Directory: ${outputDir}`);
        } finally {
            await dfm.close();
            process.exit(0);
        }
    }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function needsUpdate(localPath: string, remote: VaultEntry): boolean {
    let stat: fs.Stats;
    try {
        stat = fs.statSync(localPath);
    } catch {
        return true; // file doesn't exist locally
    }

    // vault.size is compressed size; local file is decompressed — size comparison is unreliable.
    // Use mtime only: set via utimesSync after each download so subsequent runs can skip correctly.
    if (remote.mtime !== undefined) {
        return Math.abs(stat.mtimeMs - remote.mtime) > 1000;
    }

    // No mtime info → always re-download to be safe
    return true;
}

function* walkDir(dir: string, base = dir): Generator<string> {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            yield* walkDir(full, base);
        } else {
            yield path.relative(base, full);
        }
    }
}

function pruneEmptyDirs(dir: string, root: string): void {
    if (dir === root || !dir.startsWith(root)) return;
    try {
        fs.rmdirSync(dir); // fails if non-empty
        pruneEmptyDirs(path.dirname(dir), root);
    } catch {
        // non-empty or already gone — stop
    }
}
