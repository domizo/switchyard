import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Run } from "./contract";
import { manifestDigest, sha256, validateManifest } from "./fixtures";
import { Problem } from "./store";

/** Deterministic local effects. A replay verifies the existing bytes before accepting them. */
export function buildBundle(
  run: Run,
  root: string,
): NonNullable<Run["delivery"]> {
  if (
    !run.approval ||
    run.approval.inputDigest !== run.inputDigest ||
    run.approval.inputVersion !== run.manifest.version
  )
    throw new Problem(
      409,
      "stale_approval",
      "Approval does not match the current input.",
    );
  if (
    manifestDigest(run.manifest) !== run.inputDigest ||
    validateManifest(run.manifest).some((check) => !check.passed)
  )
    throw new Problem(
      409,
      "invalid_input",
      "The current input no longer matches its evidence.",
    );
  const relative = `${run.id}/v${run.manifest.version}-${run.inputDigest.slice(0, 12)}`;
  const directory = join(root, relative);
  const metadata = {
    ...run.manifest,
    assets: run.manifest.assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      sha256: asset.sha256,
      mediaType: asset.mediaType,
    })),
  };
  const files = [
    ...run.manifest.assets.map((asset) => ({
      name: asset.name,
      content: asset.content,
    })),
    {
      name: "manifest.json",
      content: JSON.stringify(metadata, null, 2) + "\n",
    },
    {
      name: "audit.json",
      content:
        JSON.stringify(
          {
            contractVersion: run.contractVersion,
            runId: run.id,
            inputDigest: run.inputDigest,
            approval: run.approval,
            audit: run.audit,
          },
          null,
          2,
        ) + "\n",
    },
  ];
  const checksums = files.map((file) => ({
    name: file.name,
    sha256: sha256(file.content),
  }));
  const checksumFile =
    checksums.map((file) => `${file.sha256}  ${file.name}`).join("\n") + "\n";
  files.push({ name: "checksums.sha256", content: checksumFile });
  const complete = [
    ...checksums,
    { name: "checksums.sha256", sha256: sha256(checksumFile) },
  ];
  if (existsSync(directory)) {
    for (const file of complete) {
      if (
        !existsSync(join(directory, file.name)) ||
        sha256(readFileSync(join(directory, file.name))) !== file.sha256
      )
        throw new Problem(
          409,
          "bundle_mismatch",
          "An existing bundle has different bytes.",
        );
    }
  } else {
    const temporary = `${directory}.tmp`;
    rmSync(temporary, { recursive: true, force: true });
    mkdirSync(temporary, { recursive: true, mode: 0o700 });
    for (const file of files)
      writeFileSync(join(temporary, file.name), file.content, { mode: 0o600 });
    renameSync(temporary, directory);
  }
  return {
    directory: relative,
    files: complete,
    bundleDigest: sha256(JSON.stringify(complete)),
  };
}
