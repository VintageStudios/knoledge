const fs = require("node:fs");
const path = require("node:path");

const appRoot = path.resolve(__dirname, "..");
const packageJson = require(path.join(appRoot, "package.json"));
const version = packageJson.version;
const distPath = path.join(appRoot, "dist");
const versionsPath = path.resolve(appRoot, "..", "versions");
const releaseFiles = [
  `Knoledge Search Setup ${version}.exe`,
  `Knoledge Search Setup ${version}.exe.blockmap`,
  "latest.yml",
  `Knoledge Search-${version}-mac.zip`,
  `Knoledge Search-${version}-mac.zip.blockmap`,
  `Knoledge Search-${version}.dmg`,
  "latest-mac.yml",
];

for (const file of releaseFiles) {
  const source = path.join(distPath, file);
  if (!fs.existsSync(source)) {
    throw new Error(`Cannot stage update release; build output is missing: ${source}`);
  }
}

fs.mkdirSync(versionsPath, { recursive: true });
for (const file of releaseFiles) {
  fs.copyFileSync(path.join(distPath, file), path.join(versionsPath, file));
}
console.info(`Staged Knoledge Search ${version} update files in ${versionsPath}`);
