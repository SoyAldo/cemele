# Cómo crear tu Modpack

1. Crea un repo público: github.com/tuusuario/modpack-files
2. Sube los archivos:

```plain
modpack/
├── mods.json
└── mods/
    └── (tus archivos .jar)
```

3. Activa GitHub Pages en Settings → Pages → Source: main branch
   Tu URL será: https://tuusuario.github.io/modpack-files/modpack/mods.json
4. Configura en CEMELE:

```
baseUrl: "https://tuusuario.github.io/modpack-files/modpack",
modsListUrl: "https://tuusuario.github.io/modpack-files/modpack/mods.json",
```

# 5. ¡Listo! El instalador lo descargará todo automáticamente.
