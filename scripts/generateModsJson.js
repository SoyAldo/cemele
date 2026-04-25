const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

// => Script configuration
const MODPACK_DIR = "./modpack";
const OUTPUT_FILE = "./modpack/mods.json";
const BASE_URL = "https://soyaldo.github.io/example-modpack";

// => Functions
function getFileHash(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha1");
    const stream = fs.createReadStream(filePath);

    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}

async function scanMods(modsDir) {
  const mods = [];

  if (!fs.existsSync(modsDir)) {
    console.log(`⚠️  Carpeta ${modsDir} no existe`);
    return mods;
  }

  const files = fs.readdirSync(modsDir).filter((f) => f.endsWith(".jar"));

  for (const filename of files) {
    const filePath = path.join(modsDir, filename);
    const stats = fs.statSync(filePath);

    const name = filename
      .replace(/-[\d\.]+.*\.jar$/, "")
      .replace(/-/g, " ")
      .replace(/\b\w/g, (l) => l.toUpperCase());

    const mod = {
      name: name,
      filename: filename,
      url: `${BASE_URL}/mods/${encodeURIComponent(filename)}`,
      size: stats.size,
      sha1: await getFileHash(filePath),
      required: true,
    };

    mods.push(mod);
    console.log(`✅ Mod encontrado: ${filename} (${formatBytes(stats.size)})`);
  }

  return mods;
}

async function scanOthers(othersDir, basePath = "./") {
  const others = [];

  if (!fs.existsSync(othersDir)) {
    console.log(`⚠️  Carpeta ${othersDir} no existe`);
    return others;
  }

  const items = fs.readdirSync(othersDir);

  for (const item of items) {
    const fullPath = path.join(othersDir, item);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      others.push(...(await scanOthers(fullPath, `${basePath}${item}/`)));
    } else {
      const relativePathUrl = basePath === "./" ? "" : basePath.substring(2);
      others.push({
        fileName: item,
        path: basePath,
        url: `${BASE_URL}/others/${relativePathUrl}${encodeURIComponent(item)}`.replace(/%2F/g, "/"),
        size: stat.size,
        sha1: await getFileHash(fullPath),
        required: true,
      });
      console.log(`📄 Otro archivo encontrado: ${basePath}${item} (${formatBytes(stat.size)})`);
    }
  }

  return others;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

async function main() {
  console.log("🔧 Generando mods.json...\n");

  const modpackPath = path.resolve(MODPACK_DIR);
  const modsDir = path.join(modpackPath, "mods");
  const configDir = path.join(modpackPath, "config");
  const othersDir = path.join(modpackPath, "others");

  console.log(`📁 Carpeta del modpack: ${modpackPath}`);
  console.log(`🌐 URL base: ${BASE_URL}\n`);

  // Escanear mods
  console.log("🔍 Escaneando mods...");
  const mods = await scanMods(modsDir);

  // Comprimir configuraciones en mods.zip
  console.log("\n🔍 Procesando configuraciones...");
  let configObj = undefined;
  if (fs.existsSync(configDir)) {
    const zipFile = path.join(modpackPath, "configs.zip");
    const zip = new AdmZip();
    zip.addLocalFolder(configDir);
    zip.writeZip(zipFile);

    const stat = fs.statSync(zipFile);
    configObj = {
      fileName: "configs.zip",
      url: `${BASE_URL}/configs.zip`,
      size: stat.size,
      sha1: await getFileHash(zipFile),
      required: true,
    };
    console.log(`⚙️  Configuraciones comprimidas en configs.zip (${formatBytes(stat.size)})`);
  } else {
    console.log(`⚠️  Carpeta ${configDir} no existe, saltando configs...`);
  }

  // Escanear others
  console.log("\n🔍 Escaneando otros archivos...");
  const others = await scanOthers(othersDir);

  // Crear manifest
  const manifest = {
    mods: mods,
    config: configObj,
    others: others.length > 0 ? others : undefined,
  };

  // Guardar
  const outputPath = path.resolve(OUTPUT_FILE);
  fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

  console.log(`\n✅ mods.json generado: ${outputPath}`);
  console.log(`📦 Total mods: ${mods.length}`);
  if (configObj) console.log(`⚙️  Configuraciones: mods.zip generado`);
  console.log(`📄 Total otros: ${others.length}`);
  const totalSize = mods.reduce((a, m) => a + m.size, 0) + (configObj ? configObj.size : 0) + others.reduce((a, o) => a + o.size, 0);
  console.log(`💾 Tamaño total: ${formatBytes(totalSize)}`);
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
