{
  description = "Headless CLI for reading and writing encrypted Obsidian LiveSync vaults";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";

    # Pin the submodule so remote builds (nix build github:K-REBO/...) work without
    # needing --recursive clone. Local builds with an initialized submodule also work.
    livesync-commonlib = {
      url = "github:vrtmrz/livesync-commonlib/258d9aca1139e718efb0431449556c0543d72c7e";
      flake = false;
    };
  };

  outputs = { self, nixpkgs, flake-utils, livesync-commonlib }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
        version = "1.0.0";
      in {
        # ── Package ───────────────────────────────────────────────────────────
        packages.default = pkgs.buildNpmPackage {
          pname = "obsidian-vault";
          inherit version;

          src = pkgs.lib.cleanSourceWith {
            src = ./.;
            # Exclude generated/local-only directories from the store path.
            # livesync-commonlib is provided via the flake input instead.
            filter = path: _type:
              let rel = pkgs.lib.removePrefix (toString ./. + "/") (toString path);
              in !(pkgs.lib.hasPrefix "livesync-commonlib" rel)
              && !(pkgs.lib.hasPrefix "node_modules" rel)
              && !(pkgs.lib.hasPrefix "dist" rel);
          };

          npmDepsHash = "sha256-OXjkR/jdeHuoTMF9Bouvuk93YSeIzfAWRG/Iyc+ZDtY=";

          nativeBuildInputs = [ pkgs.bun ];

          # package.json has no "build" script; suppress the default npm build step.
          dontNpmBuild = true;

          preBuild = ''
            # Place the pinned submodule (overwrite anything from src)
            rm -rf livesync-commonlib
            cp -r ${livesync-commonlib} livesync-commonlib
            chmod -R u+w livesync-commonlib

            # Apply local patches to the submodule
            for p in ${./patches}/*.patch; do
              patch -d livesync-commonlib -p1 < "$p"
            done

            # Svelte stub — Bun cannot intercept bare package specifiers via plugins,
            # so we provide a shim directly in node_modules.
            mkdir -p node_modules/svelte
            cp stubs/svelte.ts node_modules/svelte/index.ts
            printf '{"name":"svelte","version":"0.0.0","main":"index.js","type":"module"}' \
              > node_modules/svelte/package.json

            # Bun writes a build cache; redirect it to a writable tmp location.
            export HOME="$TMPDIR"
          '';

          buildPhase = ''
            runHook preBuild
            bun build \
              --compile \
              --outfile=obsidian-vault \
              ./src/index.ts
            runHook postBuild
          '';

          installPhase = ''
            runHook preInstall
            install -Dm755 obsidian-vault $out/bin/obsidian-vault
            runHook postInstall
          '';

          meta = {
            description = "Headless CLI for encrypted Obsidian LiveSync vaults";
            homepage = "https://github.com/K-REBO/obsidian-vault-cli";
            license = pkgs.lib.licenses.mit;
            mainProgram = "obsidian-vault";
          };
        };

        # ── Dev shell ─────────────────────────────────────────────────────────
        devShells.default = pkgs.mkShell {
          packages = [ pkgs.bun ];
          shellHook = ''
            echo "obsidian-vault dev shell — bun $(bun --version)"
            echo "Run: bun install && bash install.sh"
          '';
        };
      }
    );
}
