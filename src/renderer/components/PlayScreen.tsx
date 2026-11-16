import React, { useState, useEffect } from "react";
import { AuthSession, InstallStatus, ServerConfigData } from "../../shared/types";

interface Props {
    session: AuthSession;
    installStatus: InstallStatus;
    config: ServerConfigData | null;
    onLogout: () => void;
    onOpenSettings: () => void;
    onNeedUpdate?: () => void;
}

const PlayScreen: React.FC<Props> = ({ session, installStatus, config, onLogout, onOpenSettings, onNeedUpdate }) => {
    const [launching, setLaunching] = useState(false);
    const [checkingUpdates, setCheckingUpdates] = useState(false);
    const [updateMessage, setUpdateMessage] = useState<string | null>(null);
    const [currentVersion, setCurrentVersion] = useState<string>(
        installStatus.currentVersion || installStatus.version || config?.version || "1.0.0"
    );

    useEffect(() => {
        if (installStatus.currentVersion) {
            setCurrentVersion(installStatus.currentVersion);
        }
    }, [installStatus.currentVersion]);

    useEffect(() => {
        const verifyUpdates = async () => {
            try {
                const status = await window.electronAPI.checkInstallation();
                if (status.currentVersion) {
                    setCurrentVersion(status.currentVersion);
                }
                if (status.needsUpdate && onNeedUpdate) {
                    onNeedUpdate();
                }
            } catch (e) {
                console.warn("No se pudo verificar actualizaciones en PlayScreen", e);
            }
        };
        verifyUpdates();
    }, [onNeedUpdate]);

    useEffect(() => {
        const unsubscribe = window.electronAPI.onGameClosed?.((data) => {
            setLaunching(false);
            if (data?.code !== 0 && data?.code !== null) {
                console.warn("Minecraft finalizó con código:", data?.code, data?.error);
                const msg = data?.error
                    ? `El juego se cerró de forma inesperada (código ${data.code}):\n\n${data.error}\n\nRevisa la carpeta de logs para más detalles.`
                    : `El juego se cerró de forma inesperada (código ${data.code}). Revisa la carpeta de logs para más detalles.`;
                alert(msg);
            }
        });
        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const handleCheckUpdates = async () => {
        if (checkingUpdates || launching) return;
        setCheckingUpdates(true);
        setUpdateMessage(null);
        try {
            const status = await window.electronAPI.checkInstallation();
            if (status.currentVersion) {
                setCurrentVersion(status.currentVersion);
            }
            if (status.needsUpdate) {
                setUpdateMessage(`¡Nueva versión v${status.latestVersion} disponible! Redirigiendo...`);
                setTimeout(() => {
                    if (onNeedUpdate) onNeedUpdate();
                }, 1200);
            } else {
                setUpdateMessage(`¡Estás en la última versión (v${status.currentVersion || currentVersion})!`);
                setTimeout(() => setUpdateMessage(null), 4000);
            }
        } catch (e: any) {
            setUpdateMessage("No se pudo verificar: " + (e.message || "Error de red"));
            setTimeout(() => setUpdateMessage(null), 4000);
        } finally {
            setCheckingUpdates(false);
        }
    };

    const handlePlay = async () => {
        setLaunching(true);
        const result = await window.electronAPI.launchGame();

        if (!result.success) {
            if (result.needsUpdate && onNeedUpdate) {
                alert(result.error);
                onNeedUpdate();
            } else {
                alert(`Error al iniciar: ${result.error}`);
            }
        }
        setLaunching(false);
    };

    return (
        <div className="screen play-screen">
            <header className="play-header">
                <div className="user-info">
                    <div className="avatar">{session.username[0].toUpperCase()}</div>
                    <div>
                        <span className="username">{session.username}</span>
                        <span className="status">● En línea</span>
                    </div>
                </div>
                <div className="header-right">
                    <div className="header-actions">
                        <button
                            onClick={handleCheckUpdates}
                            className="btn-icon"
                            title="Buscar actualizaciones"
                            disabled={checkingUpdates}
                        >
                            <svg className={checkingUpdates ? "spin" : ""} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                            </svg>
                        </button>
                        <button onClick={() => window.electronAPI.openModsFolder()} className="btn-icon" title="Abrir carpeta de mods">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-1.22-1.8A2 2 0 0 0 7.53 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z"/>
                            </svg>
                        </button>
                        <button onClick={onOpenSettings} className="btn-icon" title="Configuración">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                                <circle cx="12" cy="12" r="3"/>
                            </svg>
                        </button>
                    </div>
                    <button onClick={onLogout} className="btn-logout">
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <div className="play-content">
                <div className="play-actions">
                    <button onClick={handlePlay} className={`btn-play ${launching ? "loading" : ""}`} disabled={launching}>
                        {launching ? "Iniciando..." : "Jugar"}
                    </button>
                </div>
            </div>

            {/* Información de Versión y Botón de Comprobación en PlayScreen */}
            <footer className="play-footer-version">
                <div className="version-info-box">
                    <span className="version-dot">●</span>
                    <span className="version-label">Versión:</span>
                    <strong className="version-tag">v{currentVersion.replace(/^v/i, "")}</strong>
                </div>

                <button
                    onClick={handleCheckUpdates}
                    className={`btn-check-updates ${checkingUpdates ? "checking" : ""}`}
                    disabled={checkingUpdates || launching}
                    title="Comprobar si hay nuevas actualizaciones en GitHub"
                >
                    <svg className={checkingUpdates ? "spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/>
                    </svg>
                    <span>{checkingUpdates ? "Buscando..." : "Buscar actualizaciones"}</span>
                </button>

                {updateMessage && (
                    <div className={`update-status-toast ${updateMessage.includes("Nueva") ? "has-update" : ""}`}>
                        {updateMessage}
                    </div>
                )}
            </footer>
        </div>
    );
};

export default PlayScreen;
