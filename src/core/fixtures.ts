import { createHash } from "node:crypto";
import type { Manifest, Review } from "./contract";

export const sha256 = (value: string | Buffer) =>
  createHash("sha256").update(value).digest("hex");
export function fixtureManifest(version = 1): Manifest {
  const durationSeconds = version === 1 ? 6 : 8;
  const raw = [
    {
      id: "poster",
      name: "harbor-poster.svg",
      mediaType: "image/svg+xml",
      content:
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><rect width="640" height="480" fill="#edf3fa"/><circle cx="320" cy="190" r="100" fill="#1764ed"/><path d="M0 350L640 270V480H0Z" fill="#13233c"/><text x="36" y="440" fill="white" font-family="sans-serif" font-size="36">HARBOR / SYNTHETIC STUDY</text></svg>\n',
    },
    {
      id: "motion",
      name: "harbor-motion.json",
      mediaType: "application/json",
      content:
        JSON.stringify(
          {
            synthetic: true,
            durationSeconds,
            framesPerSecond: 24,
            color: "#1764ed",
          },
          null,
          2,
        ) + "\n",
    },
    {
      id: "notes",
      name: "harbor-notes.txt",
      mediaType: "text/plain",
      content:
        "Original synthetic portfolio fixture. No client, customer, or company content.\nLocal review only; no delivery outside this machine.\n",
    },
  ];
  return {
    version,
    title: "Harbor launch kit",
    durationSeconds,
    assets: raw.map((asset) => ({ ...asset, sha256: sha256(asset.content) })),
  };
}
export function manifestDigest(manifest: Manifest): string {
  return sha256(
    JSON.stringify({
      version: manifest.version,
      title: manifest.title,
      durationSeconds: manifest.durationSeconds,
      assets: manifest.assets.map(({ id, name, sha256, mediaType }) => ({
        id,
        name,
        sha256,
        mediaType,
      })),
    }),
  );
}
export function validateManifest(manifest: Manifest) {
  const unique =
    new Set(manifest.assets.map((asset) => asset.id)).size ===
      manifest.assets.length &&
    new Set(manifest.assets.map((asset) => asset.name)).size ===
      manifest.assets.length;
  return manifest.assets.map((asset) => {
    const checksumMatches = sha256(asset.content) === asset.sha256;
    let mediaValid = true;
    if (asset.id === "motion") {
      try {
        const motion: unknown = JSON.parse(asset.content);
        mediaValid =
          typeof motion === "object" &&
          motion !== null &&
          "durationSeconds" in motion &&
          motion.durationSeconds === manifest.durationSeconds;
      } catch {
        mediaValid = false;
      }
    }
    return {
      assetId: asset.id,
      passed: unique && checksumMatches && mediaValid,
      reason: !unique
        ? "Duplicate asset identity"
        : !checksumMatches
          ? "Checksum mismatch"
          : !mediaValid
            ? "Motion duration does not match manifest"
            : "Checksum and manifest matched",
    };
  });
}
export function fixtureReview(manifest: Manifest): Review {
  return {
    summary: "All three assets match the manifest.",
    findings: [
      {
        assetId: "poster",
        message: "Poster checksum matches the input manifest.",
        severity: "info",
      },
      {
        assetId: "motion",
        message: `Motion duration is ${manifest.durationSeconds} seconds; confirm the release intent.`,
        severity: "attention",
      },
      {
        assetId: "notes",
        message:
          "Release notes declare synthetic provenance and local delivery.",
        severity: "info",
      },
    ],
  };
}
