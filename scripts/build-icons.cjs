const fs = require("node:fs/promises");
const path = require("node:path");
const pngToIco = require("png-to-ico");

async function main() {
  const source = path.resolve(__dirname, "../PWA/icons/icon-512.png");
  const target = path.resolve(__dirname, "../desktop/icons/icon.ico");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, await pngToIco(source));
}

main().catch((error) => {
  console.error("Could not create the Windows app icon:", error);
  process.exitCode = 1;
});
