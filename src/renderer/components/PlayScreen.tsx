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
        </div>
    );
};

export default PlayScreen;
