import React, { useState, useEffect } from "react";
import { AuthSession, InstallProgressData } from "../../shared/types";

interface Props {
    onComplete: () => void;
    session: AuthSession;
    onLogout: () => void;
}

const InstallScreen: React.FC<Props> = ({ onComplete, session, onLogout }) => {
    const [progress, setProgress] = useState(0);
    const [installing, setInstalling] = useState(false);
    const [stage, setStage] = useState("");
    const [message, setMessage] = useState("Listo para instalar");
    const [error, setError] = useState("");

    useEffect(() => {
        window.electronAPI.onInstallProgress((data: InstallProgressData) => {
            setProgress(data.percentage);
            setStage(data.stage);
            setMessage(data.message);
        });

        window.electronAPI.onInstallComplete(() => {
            setMessage("¡Instalación completa!");
            setTimeout(onComplete, 1500);
        });

        window.electronAPI.onInstallError((data: any) => {
            setError(data.error);
            setInstalling(false);
        });

        return () => {
            window.electronAPI.removeAllListeners("install-progress");
            window.electronAPI.removeAllListeners("install-complete");
            window.electronAPI.removeAllListeners("install-error");
        };
    }, [onComplete]);

    const handleInstall = async () => {
        setInstalling(true);
        setError("");
        setMessage("Iniciando instalación...");
        const result = await window.electronAPI.installModpack();

        if (!result.success && !error) {
            setError(result.error || "Error desconocido");
            setInstalling(false);
        }
    };

    return (
        <div className="screen install-screen">
            <button className="btn-back" onClick={onLogout} title="Volver al inicio" disabled={installing || !!error}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M15 18L9 12L15 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
            </button>
            <div className="install-card-mockup">
                <h2>Instalación</h2>
                <p className="welcome">Bienvenido, {session.username}</p>

                <button onClick={handleInstall} className={`btn-install-mockup ${error ? "btn-install-error" : ""}`} disabled={installing}>
                    {error ? "REINTENTAR" : "EMPEZAR"}
                </button>

                {error && (
                    <div className="error-message">
                        ❌ Error: {error}
                    </div>
                )}
            </div>

            {installing && (
                <div className="progress-mockup">
                    <div className="progress-text-mockup">
                        ({Math.round(progress)}% | {message}...)
                    </div>
                    <div className="progress-bar-bg-mockup">
                        <div className="progress-bar-fill-mockup" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}
        </div>
    );
};

export default InstallScreen;
