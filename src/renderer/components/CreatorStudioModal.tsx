import React, { useState, useEffect } from "react";
import { CreatorActionItem, CreatorPackageResult } from "../../shared/types";

interface Props {
  onClose: () => void;
}

const CreatorStudioModal: React.FC<Props> = ({ onClose }) => {
  const [tab, setTab] = useState<"build" | "history">("build");

  // Formulario de actualización
  const [version, setVersion] = useState("1.1.0");
  const [name, setName] = useState("");
  const [changelogText, setChangelogText] = useState("");
  const [actions, setActions] = useState<CreatorActionItem[]>([]);

  // Submodal para eliminar archivo antiguo
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTargetPath, setDeleteTargetPath] = useState("");

  // Submodal para destino de configs
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customType, setCustomType] = useState<"COPY" | "REPLACE">("COPY");
  const [customLocalPath, setCustomLocalPath] = useState("");
  const [customTargetFolder, setCustomTargetFolder] = useState("config/");
  const [customFileName, setCustomFileName] = useState("");

  // Estado del manifiesto
  const [manifestData, setManifestData] = useState<any>(null);

  // Estado de generación
  const [packaging, setPackaging] = useState(false);
  const [packageError, setPackageError] = useState("");
  const [packageResult, setPackageResult] = useState<CreatorPackageResult | null>(null);

  // Vista previa de steps.txt expandida
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    loadManifest();
  }, []);

  const loadManifest = async () => {
    try {
      const data = await window.electronAPI.getLocalManifestData();
      setManifestData(data);
      if (data && data.latestVersion) {
        // Sugerir la siguiente versión automáticamente
        const parts = data.latestVersion.split(".").map((n: string) => parseInt(n) || 0);
        if (parts.length === 3) {
          setVersion(`${parts[0]}.${parts[1]}.${parts[2] + 1}`);
        } else {
          setVersion(`${data.latestVersion}.1`);
        }
      }
    } catch (err) {
      console.error("Error al cargar manifiesto:", err);
    }
  };

  // 1. Añadir Mods (.jar) mediante explorador nativo
  const handleAddMods = async () => {
    try {
      const files = await window.electronAPI.selectFilesDialog({
        title: "Seleccionar Mods (.jar)",
        filters: [{ name: "Mods de Minecraft (.jar)", extensions: ["jar"] }],
        multi: true,
      });

      if (files && files.length > 0) {
        const newActions: CreatorActionItem[] = files.map((filePath) => {
          const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "mod.jar";
          return {
            id: `${Date.now()}-${Math.random()}`,
            type: "COPY",
            localSourcePath: filePath,
            targetPath: `mods/${fileName}`,
          };
        });

        setActions((prev) => [...prev, ...newActions]);
      }
    } catch (err) {
      console.error("Error al seleccionar mods:", err);
    }
  };

  // 2. Añadir Configs o archivos adicionales mediante explorador nativo
  const handleAddConfigs = async () => {
    try {
      const files = await window.electronAPI.selectFilesDialog({
        title: "Seleccionar Archivos de Configuración",
        filters: [
          { name: "Configuraciones y Datos", extensions: ["json", "toml", "txt", "cfg", "yaml", "yml", "zip", "*"] },
        ],
        multi: true,
      });

      if (files && files.length > 0) {
        if (files.length === 1) {
          const filePath = files[0];
          const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "config.json";
          setCustomLocalPath(filePath);
          setCustomFileName(fileName);
          setCustomTargetFolder("config/");
          setCustomType("REPLACE");
          setShowCustomModal(true);
        } else {
          // Múltiples configs a la carpeta config/ por defecto
          const newActions: CreatorActionItem[] = files.map((filePath) => {
            const fileName = filePath.replace(/\\/g, "/").split("/").pop() || "file";
            return {
              id: `${Date.now()}-${Math.random()}`,
              type: "REPLACE",
              localSourcePath: filePath,
              targetPath: `config/${fileName}`,
            };
          });
          setActions((prev) => [...prev, ...newActions]);
        }
      }
    } catch (err) {
      console.error("Error al seleccionar configs:", err);
    }
  };

  const handleConfirmCustomAction = () => {
    if (!customLocalPath || !customFileName) return;
    const cleanFolder = customTargetFolder.replace(/^[/\\]+/, "").trim();
    const targetPath = cleanFolder ? `${cleanFolder}/${customFileName}`.replace(/\/+/g, "/") : customFileName;

    setActions((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        type: customType,
        localSourcePath: customLocalPath,
        targetPath,
      },
    ]);

    setShowCustomModal(false);
  };

  // 3. Añadir borrado de archivo obsoleto (DELETE)
  const handleAddDeleteAction = () => {
    if (!deleteTargetPath.trim()) return;
    setActions((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random()}`,
        type: "DELETE",
        targetPath: deleteTargetPath.trim().replace(/^[/\\]+/, ""),
      },
    ]);
    setDeleteTargetPath("");
    setShowDeleteModal(false);
  };

  const handleRemoveAction = (id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  };

  // Generar preview de steps.txt
  const generatePreviewSteps = () => {
    const lines = [
      `# =============================================================`,
      `# ACTUALIZACIÓN v${version || "1.0.0"} - steps.txt`,
      `# =============================================================`,
      "",
    ];

    actions.forEach((a) => {
      if (a.type === "DELETE") {
        lines.push(`DELETE "${a.targetPath}"`);
      } else {
        lines.push(`${a.type} "assets/${a.targetPath}" "${a.targetPath}"`);
      }
    });

    return lines.join("\n");
  };

  // 4. Empaquetar y guardar el ZIP
  const handlePackage = async () => {
    if (!version.trim()) {
      setPackageError("Indica un número de versión válido (ej. 1.1.0).");
      return;
    }

    if (actions.length === 0) {
      setPackageError("Agrega al menos una acción (añadir mod, reemplazar config o eliminar archivo).");
      return;
    }

    // Pedir ubicación de guardado
    const defaultZipName = `update-${version.trim()}.zip`;
    const destinationZipPath = await window.electronAPI.selectSaveZipDialog(defaultZipName);

    if (!destinationZipPath) {
      return; // Usuario canceló el diálogo
    }

    setPackaging(true);
    setPackageError("");
    setPackageResult(null);

    const changelog = changelogText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    try {
      const result = await window.electronAPI.packageUpdate({
        version: version.trim(),
        name: name.trim() || `Actualización v${version.trim()}`,
        changelog,
        actions: actions.map((a) => ({
          type: a.type,
          localSourcePath: a.localSourcePath,
          targetPath: a.targetPath,
        })),
        destinationZipPath,
      });

      if (result.success) {
        setPackageResult(result);
        loadManifest(); // Refrescar manifiesto
      } else {
        setPackageError(result.error || "Error al empaquetar la actualización.");
      }
    } catch (err: any) {
      setPackageError(err.message || "Error inesperado.");
    } finally {
      setPackaging(false);
    }
  };

  const handleOpenFolder = (fullPath: string) => {
    window.electronAPI.openItemInFolder(fullPath);
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content creator-studio-modal">
        {/* Cabecera */}
        <div className="modal-header">
          <div className="creator-header-title">
            <span className="creator-badge">STUDIO</span>
            <h3>Creador Visual de Actualizaciones</h3>
          </div>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        {/* Pestañas */}
        <div className="creator-tabs">
          <button
            className={`creator-tab ${tab === "build" ? "active" : ""}`}
            onClick={() => { setTab("build"); setPackageResult(null); }}
          >
            🛠️ Nueva Actualización
          </button>
          <button
            className={`creator-tab ${tab === "history" ? "active" : ""}`}
            onClick={() => setTab("history")}
          >
            📋 Historial del Manifiesto ({manifestData?.updates?.length || 0})
          </button>
        </div>

        {/* Vista: Creador de Actualización */}
        {tab === "build" && (
          <div className="creator-body">
            {packageResult ? (
              /* Pantalla de Éxito tras empaquetar */
              <div className="creator-success-card">
                <div className="success-icon">🎉</div>
                <h4>¡Paquete de Actualización Creado con Éxito!</h4>
                <p className="success-subtitle">
                  El archivo <strong>{packageResult.zipPath?.split(/[/\\]/).pop()}</strong> ha sido comprimido y el manifiesto ha sido actualizado.
                </p>

                <div className="success-details">
                  <div className="detail-row">
                    <span>Tamaño:</span>
                    <strong>{packageResult.size ? `${(packageResult.size / (1024 * 1024)).toFixed(2)} MB (${packageResult.size} bytes)` : "N/A"}</strong>
                  </div>
                  <div className="detail-row">
                    <span>Firma SHA-256:</span>
                    <code className="sha-code">{packageResult.sha256}</code>
                  </div>
                  <div className="detail-row">
                    <span>Ubicación:</span>
                    <span className="path-text">{packageResult.zipPath}</span>
                  </div>
                </div>

                <div className="success-steps-guide">
                  <h5>📌 Próximos 2 pasos para publicar:</h5>
                  <ol>
                    <li>
                      Sube el archivo <strong>{packageResult.zipPath?.split(/[/\\]/).pop()}</strong> a los <strong>Releases</strong> de tu repositorio de GitHub con la etiqueta <code>v{version}</code>.
                    </li>
                    <li>
                      Haz <code>git add manifest.json && git commit -m "chore: v{version}" && git push</code> en la rama principal de tu repositorio.
                    </li>
                  </ol>
                </div>

                <div className="success-actions">
                  <button onClick={() => packageResult.zipPath && handleOpenFolder(packageResult.zipPath)} className="btn-secondary">
                    📂 Abrir Carpeta del ZIP
                  </button>
                  <button onClick={() => { setPackageResult(null); setActions([]); setName(""); setChangelogText(""); }} className="btn-primary">
                    ➕ Crear Otra Actualización
                  </button>
                </div>
              </div>
            ) : (
              /* Formulario principal de creación */
              <>
                <div className="creator-form-grid">
                  <div className="form-group">
                    <label>Número de Versión:</label>
                    <input
                      type="text"
                      value={version}
                      onChange={(e) => setVersion(e.target.value)}
                      placeholder="ej. 1.1.0"
                      className="input-text"
                    />
                  </div>
                  <div className="form-group">
                    <label>Título / Nombre del Parche:</label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="ej. Parche de Rendimiento y Nuevos Mods"
                      className="input-text"
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label>Notas de la Actualización (Changelog - una por línea):</label>
                  <textarea
                    rows={2}
                    value={changelogText}
                    onChange={(e) => setChangelogText(e.target.value)}
                    placeholder="• Añadido mod Embeddium&#10;• Arreglado crash con shaders&#10;• Opciones optimizadas"
                    className="textarea-changelog"
                  />
                </div>

                {/* Barra de herramientas para añadir acciones */}
                <div className="creator-actions-bar">
                  <span className="actions-bar-label">Acciones de actualización:</span>
                  <div className="actions-buttons">
                    <button onClick={handleAddMods} className="btn-action-add btn-add-mod" title="Seleccionar uno o más archivos .jar">
                      ➕ Añadir Mod(s) (.jar)
                    </button>
                    <button onClick={handleAddConfigs} className="btn-action-add btn-add-config" title="Seleccionar configs, shaders, resourcepacks">
                      📄 Añadir Config(s)
                    </button>
                    <button onClick={() => setShowDeleteModal(true)} className="btn-action-add btn-add-delete" title="Marcar un archivo viejo para borrar">
                      🗑️ Eliminar Archivo (DELETE)
                    </button>
                  </div>
                </div>

                {/* Lista interactiva de acciones */}
                <div className="creator-actions-list-container">
                  {actions.length === 0 ? (
                    <div className="empty-actions-box">
                      <p>No has añadido ninguna acción a esta actualización.</p>
                      <small>Haz clic en los botones de arriba para seleccionar mods, configuraciones o marcar mods viejos para borrar.</small>
                    </div>
                  ) : (
                    <table className="creator-actions-table">
                      <thead>
                        <tr>
                          <th>Acción</th>
                          <th>Origen Local</th>
                          <th>Destino en el Juego</th>
                          <th style={{ width: "40px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {actions.map((act) => (
                          <tr key={act.id}>
                            <td>
                              <span className={`badge-action badge-${act.type.toLowerCase()}`}>
                                {act.type}
                              </span>
                            </td>
                            <td className="source-cell" title={act.localSourcePath || "N/A"}>
                              {act.type === "DELETE" ? (
                                <em style={{ color: "#a0aec0" }}>Eliminar del cliente</em>
                              ) : (
                                act.localSourcePath?.split(/[/\\]/).pop()
                              )}
                            </td>
                            <td className="target-cell">
                              <code>{act.targetPath}</code>
                            </td>
                            <td>
                              <button
                                onClick={() => handleRemoveAction(act.id)}
                                className="btn-remove-row"
                                title="Quitar acción"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* Acordeón de Vista Previa de steps.txt */}
                <div className="creator-preview-toggle">
                  <button onClick={() => setShowPreview(!showPreview)} className="btn-toggle-preview">
                    {showPreview ? "▼ Ocultar steps.txt" : "▶ Ver vista previa de steps.txt"} ({actions.length} líneas)
                  </button>
                  {showPreview && (
                    <pre className="creator-steps-preview">{generatePreviewSteps()}</pre>
                  )}
                </div>

                {packageError && <div className="error-message" style={{ marginTop: "10px" }}>❌ {packageError}</div>}

                {/* Botón Final */}
                <div className="creator-footer">
                  <button onClick={onClose} className="btn-secondary" disabled={packaging}>
                    Cancelar
                  </button>
                  <button onClick={handlePackage} className="btn-primary btn-package" disabled={packaging || actions.length === 0}>
                    {packaging ? "Comprimiendo y Firmando..." : "📦 Empaquetar y Guardar .ZIP"}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Vista: Historial del Manifiesto */}
        {tab === "history" && (
          <div className="creator-body creator-history-body">
            <div className="manifest-info-header">
              <div>
                <strong>Modpack: </strong> {manifestData?.modpack || "Cemele"}
              </div>
              <div>
                <strong>Última Versión: </strong> <span className="version-tag">v{manifestData?.latestVersion || "1.0.0"}</span>
              </div>
            </div>

            <div className="history-list">
              {(!manifestData?.updates || manifestData.updates.length === 0) ? (
                <p className="empty-text">No hay actualizaciones registradas en el manifiesto.</p>
              ) : (
                manifestData.updates.slice().reverse().map((up: any) => (
                  <div key={up.version} className="history-card">
                    <div className="history-card-header">
                      <span className="history-version">v{up.version}</span>
                      <span className="history-name">{up.name}</span>
                      <span className="history-date">{up.releaseDate}</span>
                    </div>

                    {up.changelog && up.changelog.length > 0 && (
                      <ul className="history-changelog">
                        {up.changelog.map((c: string, idx: number) => (
                          <li key={idx}>{c}</li>
                        ))}
                      </ul>
                    )}

                    <div className="history-meta">
                      <small><strong>SHA-256: </strong><code>{up.sha256}</code></small>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Submodal: Eliminar archivo antiguo */}
        {showDeleteModal && (
          <div className="submodal-overlay">
            <div className="submodal-content">
              <h4>🗑️ Eliminar Archivo en el Cliente (DELETE)</h4>
              <p>Indica la ruta relativa del mod o archivo que debe eliminarse de la carpeta del juego de los usuarios:</p>
              <input
                type="text"
                value={deleteTargetPath}
                onChange={(e) => setDeleteTargetPath(e.target.value)}
                placeholder="ej: mods/rubidium-mc1.20.1-0.7.1a.jar"
                className="input-text"
                autoFocus
              />
              <div className="submodal-actions">
                <button onClick={() => setShowDeleteModal(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleAddDeleteAction} className="btn-primary" disabled={!deleteTargetPath.trim()}>
                  Añadir Borrado
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submodal: Personalizar destino de archivo */}
        {showCustomModal && (
          <div className="submodal-overlay">
            <div className="submodal-content">
              <h4>📄 Destino del Archivo en el Juego</h4>
              <p>Archivo seleccionado: <strong>{customFileName}</strong></p>

              <div className="form-group">
                <label>Tipo de Acción:</label>
                <select value={customType} onChange={(e: any) => setCustomType(e.target.value)} className="input-text">
                  <option value="REPLACE">REPLACE (Sobrescribir si ya existe)</option>
                  <option value="COPY">COPY (Copiar)</option>
                </select>
              </div>

              <div className="form-group">
                <label>Carpeta de Destino en el Juego:</label>
                <select
                  value={customTargetFolder}
                  onChange={(e) => setCustomTargetFolder(e.target.value)}
                  className="input-text"
                >
                  <option value="config/">config/ (Configuraciones)</option>
                  <option value="mods/">mods/ (Mods)</option>
                  <option value="shaderpacks/">shaderpacks/ (Shaders)</option>
                  <option value="resourcepacks/">resourcepacks/ (Texturas)</option>
                  <option value="">Raíz del juego (.)</option>
                </select>
              </div>

              <div className="submodal-actions">
                <button onClick={() => setShowCustomModal(false)} className="btn-secondary">Cancelar</button>
                <button onClick={handleConfirmCustomAction} className="btn-primary">Añadir Acción</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorStudioModal;

