import React, { useState } from "react";
import { AuthSession, InstallStatus } from "../../shared/types";

interface Props {
    session: AuthSession;
    installStatus: InstallStatus;
    onLogout: () => void;
}

const PlayScreen: React.FC<Props> = ({ session, installStatus, onLogout }) => {
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
                <button onClick={onLogout} className="btn-logout">
                    Cerrar sesión
                </button>
            </header>

            <div className="play-content">
                <div className="modpack-banner">
                    <div className="banner-content">
                        <h1>Mi Modpack</h1>
                        <p>La mejor experiencia moddeada</p>
                        <div className="version-badge">{installStatus.version}</div>
                    </div>
                </div>

                <div className="actions-grid">
                    <button onClick={handlePlay} className={`btn-play ${launching ? "loading" : ""}`} disabled={launching}>
                        {launching ? "Iniciando..." : "▶ JUGAR"}
                    </button>

                    <div className="secondary-actions">
                        <button onClick={() => window.electronAPI.openModsFolder()}>📁 Mods</button>
                        <button onClick={() => window.electronAPI.openSettings()}>⚙ Configuración</button>
                    </div>
                </div>

                <div className="news-section">
                    <h3>Noticias del Modpack</h3>
                    <div className="news-item">
                        <span className="date">20 Abr 2026</span>
                        <p>Actualización 1.2.0 disponible</p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PlayScreen;
