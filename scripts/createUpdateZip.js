/**
 * Script para empaquetar una actualización en .ZIP, verificar steps.txt
 * y generar la entrada con SHA-256 lista para el manifest.json.
 *
 * Uso:
 *   node scripts/createUpdateZip.js <version> [--first-update] [carpeta_origen]
 *
 * Ejemplos:
 *   # Primera actualización: autogenera steps.txt con COPY para todos los archivos y crea el zip
 *   node scripts/createUpdateZip.js 1.0.0 --first-update
 *
 *   # Actualizaciones posteriores con steps.txt personalizado:
 *   node scripts/createUpdateZip.js 1.1.0
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

// Cargar .env para leer GITHUB_REPOSITORY_URL
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

function formatBytes(bytes) {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

function calculateFileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex").toLowerCase()));
  });
}

function parseGitHubRepo(urlOrSlug) {
  if (!urlOrSlug) return null;
  const cleaned = urlOrSlug
    .trim()
    .replace(/\.git\/?$/, "")
    .replace(/\/+$/, "");
  const match = cleaned.match(/(?:https?:\/\/)?(?:github\.com\/|raw\.githubusercontent\.com\/)?([^/\s]+)\/([^/\s]+)/);
  if (match) {
    return { owner: match[1], repo: match[2] };
  }
  return null;
}

/**
 * Escanea recursivamente todos los archivos de un directorio,
 * excluyendo steps.txt, archivos del sistema (.DS_Store, Thumbs.db) y Git.
 */
function getAllFilesRecursively(dir, baseDir = dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relFromBase = path.relative(baseDir, fullPath).replace(/\\/g, "/");

    // Ignorar steps.txt y archivos temporales/sistema
    if (entry.name === "steps.txt" || entry.name === ".DS_Store" || entry.name === "Thumbs.db" || entry.name.startsWith(".git")) {
      continue;
    }

    if (entry.isDirectory()) {
      results = results.concat(getAllFilesRecursively(fullPath, baseDir));
    } else if (entry.isFile()) {
      results.push(relFromBase);
    }
  }
  return results;
}

function parseAndValidateSteps(stepsPath, sourceDir) {
  const content = fs.readFileSync(stepsPath, "utf-8");
  const lines = content.split(/\r?\n/);
  const steps = [];
  const errors = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine || rawLine.startsWith("#") || rawLine.startsWith("//")) continue;

    const firstSpace = rawLine.indexOf(" ");
    if (firstSpace === -1) {
      errors.push(`Línea ${i + 1}: Comando inválido o incompleto: "${rawLine}"`);
      continue;
    }

    const command = rawLine.substring(0, firstSpace).toUpperCase();
    const argsString = rawLine.substring(firstSpace + 1).trim();

    if (command === "DELETE" || command === "REMOVE") {
      const target = argsString.replace(/^["']|["']$/g, "").trim();
      steps.push({ type: "DELETE", target, line: i + 1 });
    } else if (command === "COPY" || command === "REPLACE" || command === "OVERWRITE") {
      let source = "";
      let target = "";

      if (argsString.includes(" -> ")) {
        const parts = argsString.split(" -> ");
        source = parts[0].trim().replace(/^["']|["']$/g, "");
        target = parts[1].trim().replace(/^["']|["']$/g, "");
      } else {
        const tokens = [];
        const regex = /[^\s"']+|"([^"]*)"|'([^']*)'/g;
        let match;
        while ((match = regex.exec(argsString)) !== null) {
          tokens.push(match[1] || match[2] || match[0]);
        }
        if (tokens.length >= 2) {
          source = tokens[0];
          target = tokens[1];
        }
      }

      if (!source || !target) {
        errors.push(`Línea ${i + 1}: Argumentos incompletos para ${command}: "${rawLine}"`);
        continue;
      }

      // Validar que el archivo o carpeta de origen exista dentro del directorio de actualización
      const fullSourcePath = path.resolve(sourceDir, source.replace(/^[/\\]+/, ""));
      if (!fs.existsSync(fullSourcePath)) {
        errors.push(`Línea ${i + 1}: El archivo de origen no existe en la carpeta: "${source}"`);
      }

      steps.push({ type: command, source, target, line: i + 1 });
    } else {
      errors.push(`Línea ${i + 1}: Comando desconocido: ${command}`);
    }
  }

  return { steps, errors };
}

async function main() {
  const rawArgs = process.argv.slice(2);
  const isFirstUpdate = rawArgs.some((a) => a.toLowerCase() === "--first-update" || a.toLowerCase() === "-f");
  const cleanArgs = rawArgs.filter((a) => a.toLowerCase() !== "--first-update" && a.toLowerCase() !== "-f");

  const version = cleanArgs[0] || "1.0.0";

  // Buscar carpeta de origen
  let sourceDir = cleanArgs[1];
  if (!sourceDir) {
    const candidates = [
      path.join(__dirname, "..", "updates", `v${version}`),
      path.join(__dirname, "..", "updates", version),
      path.join(__dirname, "..", "update-staging"),
    ];
    for (const c of candidates) {
      if (fs.existsSync(c)) {
        sourceDir = c;
        break;
      }
    }
  }

  if (!sourceDir || !fs.existsSync(sourceDir)) {
    console.error(`❌ No se encontró la carpeta de origen para la versión ${version}.`);
    console.log(`\nCrea la carpeta:\n  updates/v${version}/assets/...\n`);
    console.log(`O especifícala manualmente: node scripts/createUpdateZip.js ${version} [--first-update] <ruta_carpeta>`);
    process.exit(1);
  }

  const stepsFile = path.join(sourceDir, "steps.txt");

  // Si se especificó --first-update, generar automáticamente steps.txt con COPY para todos los archivos
  if (isFirstUpdate) {
    console.log(`\n🚀 Modo --first-update activado: Detectando archivos para la primera actualización...`);
    const allFiles = getAllFilesRecursively(sourceDir);

    if (allFiles.length === 0) {
      console.error(`❌ No se encontraron archivos para la actualización en: ${sourceDir}`);
      process.exit(1);
    }

    // Ordenar alfabéticamente para una lista limpia y predecible
    allFiles.sort((a, b) => a.localeCompare(b));

    const stepsLines = [
      `# =============================================================`,
      `# ACTUALIZACIÓN INICIAL v${version} (--first-update)`,
      `# Generado automáticamente por createUpdateZip.js`,
      `# Total de archivos: ${allFiles.length}`,
      `# Fecha: ${new Date().toISOString()}`,
      `# =============================================================`,
      ``,
    ];

    for (const relFile of allFiles) {
      const sourceInZip = relFile;
      let targetInGame = relFile;

      // Si el archivo está dentro de assets/ (ej. assets/mods/jei.jar o assets/options.txt),
      // en el juego se instalará en la ruta relativa sin el prefijo "assets/" (mods/jei.jar o options.txt)
      if (relFile.startsWith("assets/")) {
        targetInGame = relFile.substring("assets/".length);
      }

      stepsLines.push(`COPY "${sourceInZip}" "${targetInGame}"`);
    }

    fs.writeFileSync(stepsFile, stepsLines.join("\n"), "utf-8");
    console.log(`✅ Archivo steps.txt generado automáticamente con ${allFiles.length} instrucciones COPY en:\n   ${stepsFile}\n`);
  } else if (!fs.existsSync(stepsFile)) {
    console.error(`❌ No se encontró el archivo "steps.txt" en: ${sourceDir}`);
    console.log(`💡 Si esta es la primera actualización de tu modpack, ejecuta el comando con --first-update:`);
    console.log(`   node scripts/createUpdateZip.js ${version} --first-update\n`);
    process.exit(1);
  }

  console.log(`📦 Preparando paquete de actualización v${version}...`);
  console.log(`📁 Carpeta de origen: ${sourceDir}`);

  // Validar steps.txt
  const { steps, errors } = parseAndValidateSteps(stepsFile, sourceDir);
  if (errors.length > 0) {
    console.error(`\n❌ Se encontraron errores en steps.txt:`);
    errors.forEach((e) => console.error(`  - ${e}`));
    console.error(`\nCorrige los errores antes de continuar.`);
    process.exit(1);
  }

  console.log(`✅ steps.txt validado con éxito (${steps.length} instrucciones).`);

  // Crear ZIP
  const outputDir = path.join(__dirname, "..", "dist-updates");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const zipFileName = `update-${version}.zip`;
  const zipFilePath = path.join(outputDir, zipFileName);

  console.log(`\n⏳ Comprimiendo archivos en ${zipFileName}...`);
  const zip = new AdmZip();

  // Agregar steps.txt en la raíz del zip
  zip.addLocalFile(stepsFile);

  // Agregar el resto de archivos (assets, etc.)
  const entries = fs.readdirSync(sourceDir);
  for (const entry of entries) {
    if (entry === "steps.txt") continue;
    const fullPath = path.join(sourceDir, entry);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      zip.addLocalFolder(fullPath, entry);
    } else {
      zip.addLocalFile(fullPath);
    }
  }

  zip.writeZip(zipFilePath);

  const zipStat = fs.statSync(zipFilePath);
  const sha256 = await calculateFileSha256(zipFilePath);

  console.log(`\n🎉 ¡ZIP creado exitosamente!`);
  console.log(`📂 Archivo: ${zipFilePath}`);
  console.log(`📊 Tamaño: ${formatBytes(zipStat.size)} (${zipStat.size} bytes)`);
  console.log(`🔐 SHA-256: ${sha256}`);

  // Determinar URL de descarga desde GITHUB_REPOSITORY_URL si está en .env
  const ghRepo = parseGitHubRepo(process.env.GITHUB_REPOSITORY_URL);
  const downloadUrl = ghRepo
    ? `https://github.com/${ghRepo.owner}/${ghRepo.repo}/releases/download/v${version}/${zipFileName}`
    : `https://github.com/TU_USUARIO/TU_REPO/releases/download/v${version}/${zipFileName}`;

  // Generar fragmento para el manifest.json
  const manifestEntry = {
    version: version,
    name: `Actualización v${version}`,
    releaseDate: new Date().toISOString().split("T")[0],
    url: downloadUrl,
    sha256: sha256,
    size: zipStat.size,
    changelog: [`Actualización v${version}`],
  };

  console.log(`\n=============================================================`);
  console.log(`📋 Entrada generada para el manifest.json:`);
  console.log(`=============================================================`);
  console.log(JSON.stringify(manifestEntry, null, 2));
  console.log(`=============================================================\n`);

  // Actualizar automáticamente modpack/manifest.json y/o manifest.json si existen
  const manifestPaths = [path.join(__dirname, "..", "modpack", "manifest.json"), path.join(__dirname, "..", "manifest.json")];

  for (const manifestPath of manifestPaths) {
    if (fs.existsSync(manifestPath)) {
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
        manifest.latestVersion = version;
        if (process.env.MODPACK_NAME) {
          manifest.modpack = process.env.MODPACK_NAME;
        }
        if (process.env.MINECRAFT_VERSION) {
          manifest.minecraftVersion = process.env.MINECRAFT_VERSION;
        }
        if (!Array.isArray(manifest.updates)) manifest.updates = [];

        const existingIndex = manifest.updates.findIndex((u) => u.version === version);
        if (existingIndex >= 0) {
          manifest.updates[existingIndex] = { ...manifest.updates[existingIndex], ...manifestEntry };
        } else {
          manifest.updates.push(manifestEntry);
        }

        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
        console.log(`✅ Archivo ${path.relative(path.join(__dirname, ".."), manifestPath)} actualizado automáticamente!`);
      } catch (e) {
        console.warn(`No se pudo actualizar ${manifestPath}: ${e.message}`);
      }
    }
  }
}

main().catch((err) => {
  console.error("❌ Error inesperado:", err);
  process.exit(1);
});
