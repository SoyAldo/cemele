import React, { useState } from "react";
import { AuthSession, InstallStatus, ServerConfigData } from "../../shared/types";

interface Props {
    session: AuthSession;
    installStatus: InstallStatus;
    config: ServerConfigData | null;
    onLogout: () => void;
    onOpenSettings: () => void;
}

const PlayScreen: React.FC<Props> = ({ session, installStatus, config, onLogout, onOpenSettings }) => {
    const [launching, setLaunching] = useState(false);

    const handlePlay = async () => {
        setLaunching(true);
        const result = await window.electronAPI.launchGame();

        if (!result.success) {
            alert(`Error al iniciar: ${result.error}`);
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
                        <button onClick={() => window.electronAPI.openModsFolder()} className="btn-icon" title="Abrir carpeta de mods">📁</button>
                        <button onClick={onOpenSettings} className="btn-icon" title="Configuración">⚙</button>
                    </div>
                    <button onClick={onLogout} className="btn-logout">
                        Cerrar sesión
                    </button>
                </div>
            </header>

            <div className="play-content">
                <div className="modpack-banner">
                    <div className="banner-content">
                        <h1>{config?.name || "Cemele"}</h1>
                        <p>La mejor experiencia moddeada con mapaches</p>
                        <div className="version-badge">{installStatus.version}</div>
                    </div>
                </div>

                <div className="play-actions">
                    <button onClick={handlePlay} className={`btn-play ${launching ? "loading" : ""}`} disabled={launching}>
                        {launching ? "Iniciando..." : "▶ JUGAR"}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlayScreen;
