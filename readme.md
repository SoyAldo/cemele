# Sistema de Actualizaciones de Modpack - CEMELE

Este launcher cuenta con un **sistema de manifiesto con verificación criptográfica SHA-256 y parches por instrucciones (`steps.txt`)** conectado directamente a tu repositorio de **GitHub**.

---

## ⚙️ Configuración Única en `.env`

Solo necesitas definir una única variable con la URL de tu repositorio de GitHub:

```env
GITHUB_REPOSITORY_URL=https://github.com/tu-usuario/tu-repo
```

Con solo esa línea, el launcher automáticamente:
1. Buscará el manifiesto en la rama `main` usando la URL raw de GitHub:
   `https://raw.githubusercontent.com/{Username}/{RepositoryName}/refs/heads/main/README.md`
   (o `manifest.json` / `modpack/manifest.json`).
2. Resolverá las descargas de los archivos `.zip` desde los **Releases** de ese mismo repositorio:
   `https://github.com/{Username}/{RepositoryName}/releases/download/v{version}/update-{version}.zip`.

---

## 🚀 Cómo funciona

1. **El launcher consulta el manifiesto:**
   Al iniciar, consulta la versión más reciente en GitHub.
2. **Detección de actualizaciones:**
   Compara la versión local del jugador (`version.json`) con `latestVersion` del manifiesto.
3. **Descarga desde GitHub Releases:**
   Descarga el paquete `.zip` correspondiente a la versión pendiente.
4. **Fase de Verificación Criptográfica (SHA-256):**
   Calcula el hash del archivo descargado en stream y lo compara con el manifiesto. Si no coincide, aborta de inmediato para proteger al usuario de archivos corruptos o descargas incompletas.
5. **Ejecución y Corroboración de Instrucciones (`steps.txt`):**
   Descomprime el ZIP en un directorio temporal y ejecuta las órdenes de reemplazo, copiado y borrado. Cada acción se corrobora (verificando que los archivos existan y que sus tamaños coincidan).
6. **Registro local:**
   Actualiza `version.json` en el cliente y habilita el botón de juego.

---

## 📁 Estructura del ZIP de Actualización

Cada release en GitHub contiene un archivo `.zip` con la siguiente estructura interna:

```text
📦 update-1.1.0.zip
├── 📄 steps.txt
└── 📁 assets/
    ├── 📁 mods/
    │   └── nuevo-mod-1.20.1.jar
    └── 📁 configs/
        └── options.txt
```

### Sintaxis de `steps.txt`:

```text
# Eliminar un mod viejo o incompatible del cliente
DELETE mods/mod-viejo-1.0.jar

# Copiar un archivo nuevo (desde el zip hacia la carpeta del juego)
COPY assets/mods/nuevo-mod-1.20.1.jar mods/nuevo-mod-1.20.1.jar

# Reemplazar o sobreescribir una configuración
REPLACE assets/configs/options.txt options.txt

# Si los nombres contienen espacios, puedes usar comillas o " -> ":
COPY "assets/mods/1.20.1 Seed To Sapling.jar" "mods/1.20.1 Seed To Sapling.jar"
COPY assets/configs/custom.json -> config/custom.json
```

---

## 🛠️ Cómo crear y publicar una actualización

### Paso 1: Preparar la carpeta de la versión
Crea tu carpeta dentro de `updates/` con el nombre de tu versión (ej: `updates/v1.1.0`):

```text
updates/v1.1.0/
├── steps.txt
└── assets/
    ├── mods/
    │   └── ... (nuevos .jar)
    └── configs/
        └── ... (archivos a reemplazar)
```

### Paso 2: Empaquetar y validar automáticamente
Ejecuta el script generador indicando la versión:

```bash
npm run create:update 1.1.0
```

El script automáticamente:
* ✅ Analiza y valida que todos los archivos citados en `steps.txt` realmente existan en `assets/`.
* 📦 Comprime los archivos en `dist-updates/update-1.1.0.zip`.
* 🔐 Calcula el hash **SHA-256** del archivo generado.
* 📋 Genera la entrada JSON y actualiza automáticamente los archivos `manifest.json`.

### Paso 3: Subir a GitHub Releases
1. Entra a tu repositorio en GitHub y ve a **Releases** → **Draft a new release**.
2. En **Tag version**, coloca `v1.1.0` (o la versión que empaquetaste).
3. Sube el archivo `dist-updates/update-1.1.0.zip` a los archivos del release.
4. Publica el Release.

### Paso 4: Subir el manifiesto al repositorio
Haz commit y push de `manifest.json` a la rama principal (`main`) de tu repositorio:

```bash
git add manifest.json modpack/manifest.json
git commit -m "chore: publicar actualización v1.1.0"
git push origin main
```
