import React, { useState, useEffect } from "react";
import { AuthSession, InstallProgressData, InstallStatus } from "../../shared/types";

interface Props {
    onComplete: () => void;
    session: AuthSession;
    onLogout: () => void;
    installStatus?: InstallStatus | null;
}

const InstallScreen: React.FC<Props> = ({ onComplete, session, onLogout, installStatus }) => {
    const isUpdate = !!installStatus?.needsUpdate;
    const [progress, setProgress] = useState(0);
    const [installing, setInstalling] = useState(false);
    const [stage, setStage] = useState("");
    const [message, setMessage] = useState(isUpdate ? "Actualización lista para aplicar" : "Listo para instalar");
    const [error, setError] = useState("");

    useEffect(() => {
        window.electronAPI.onInstallProgress((data: InstallProgressData) => {
            setProgress(data.percentage);
            setStage(data.stage);
            setMessage(data.message);
        });

        window.electronAPI.onInstallComplete(() => {
            setMessage(isUpdate ? "¡Actualización completada!" : "¡Instalación completa!");
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
    }, [onComplete, isUpdate]);

    const handleInstall = async () => {
        setInstalling(true);
        setError("");
        setMessage(isUpdate ? "Descargando actualización..." : "Iniciando instalación...");
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
                <h2>{isUpdate ? "Actualización" : "Instalación"}</h2>
                <p className="welcome">Bienvenido, {session.username}</p>

                {isUpdate && installStatus?.latestVersion && (
                    <div style={{ margin: "10px 0", fontSize: "14px", color: "#a0aec0" }}>
                        <div>
                            <span>Versión: </span>
                            <strong style={{ color: "#fff" }}>{installStatus.currentVersion ? `v${installStatus.currentVersion.replace(/^v/i, "")}` : "Base"}</strong>
                            <span> ➔ </span>
                            <strong style={{ color: "#48bb78" }}>v{installStatus.latestVersion.replace(/^v/i, "")}</strong>
                        </div>
                        {installStatus.pendingUpdatesCount && installStatus.pendingUpdatesCount > 1 ? (
                            <div style={{ fontSize: "12px", color: "#63b3ed", marginTop: "4px" }}>
                                ({installStatus.pendingUpdatesCount} actualizaciones pendientes que se aplicarán secuencialmente)
                            </div>
                        ) : null}
                    </div>
                )}

                <button onClick={handleInstall} className={`btn-install-mockup ${error ? "btn-install-error" : ""}`} disabled={installing}>
                    {error ? "REINTENTAR" : isUpdate ? "ACTUALIZAR" : "EMPEZAR"}
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
