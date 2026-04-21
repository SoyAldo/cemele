const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

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

function scanConfigs(configDir, basePath = "") {
    const configs = [];

    if (!fs.existsSync(configDir)) {
        console.log(`⚠️  Carpeta ${configDir} no existe`);
        return configs;
    }

    const items = fs.readdirSync(configDir);

    for (const item of items) {
        const fullPath = path.join(configDir, item);
        const relativePath = basePath ? `${basePath}/${item}` : item;
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            configs.push(...scanConfigs(fullPath, relativePath));
        } else {
            configs.push({
                path: relativePath,
                url: `${BASE_URL}/config/${encodeURIComponent(relativePath).replace(/%2F/g, "/")}`,
            });
            console.log(`⚙️  Config encontrado: ${relativePath}`);
        }
    }

    return configs;
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

    console.log(`📁 Carpeta del modpack: ${modpackPath}`);
    console.log(`🌐 URL base: ${BASE_URL}\n`);

    // Escanear mods
    console.log("🔍 Escaneando mods...");
    const mods = await scanMods(modsDir);

    // Escanear configs
    console.log("\n🔍 Escaneando configuraciones...");
    const configFiles = scanConfigs(configDir);

    // Crear manifest
    const manifest = {
        mods: mods,
        configFiles: configFiles.length > 0 ? configFiles : undefined,
    };

    // Guardar
    const outputPath = path.resolve(OUTPUT_FILE);
    fs.writeFileSync(outputPath, JSON.stringify(manifest, null, 2));

    console.log(`\n✅ mods.json generado: ${outputPath}`);
    console.log(`📦 Total mods: ${mods.length}`);
    console.log(`⚙️  Total configs: ${configFiles.length}`);
    console.log(`💾 Tamaño total: ${formatBytes(mods.reduce((a, m) => a + m.size, 0))}`);
}

main().catch((err) => {
    console.error("❌ Error:", err);
    process.exit(1);
});
