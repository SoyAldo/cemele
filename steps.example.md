# =============================================================

# INSTRUCCIONES DE ACTUALIZACIÓN v1.1.0

# =============================================================

# 1. ACTUALIZAR UN MOD (Borrar versión vieja y copiar la nueva)

DELETE "mods/jei-1.21.1-neoforge-19.1.0.jar"
COPY "assets/mods/jei-1.21.1-neoforge-19.2.1.jar" "mods/jei-1.21.1-neoforge-19.2.1.jar"

# 2. INSTALAR UN MOD NUEVO

COPY "assets/mods/appleskin-neoforge-mc1.21.1-3.0.4.jar" "mods/appleskin-neoforge-mc1.21.1-3.0.4.jar"

# 3. ELIMINAR UN MOD OBSOLETO O INCOMPATIBLE

DELETE "mods/mod-con-bugs-1.0.jar"

# 4. SOBRESCRIBIR UNA CONFIGURACIÓN

REPLACE "assets/config/fancymenu/custom_layout.json" "config/fancymenu/custom_layout.json"
REPLACE "assets/options.txt" "options.txt"

# 5. AGREGAR SHADERS O RESOURCEPACKS (con espacios en el nombre)

COPY "assets/shaderpacks/BSL Shaders v8.2.zip" "shaderpacks/BSL Shaders v8.2.zip"

## Sintaxis alternativa con flecha (->):

COPY "assets/mods/nuevo-mod.jar" -> "mods/nuevo-mod.jar"
REPLACE "assets/config/fml.toml" -> "config/fml.toml"
