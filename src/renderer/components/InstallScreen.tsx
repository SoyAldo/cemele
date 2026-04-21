import React, { useState, useEffect } from "react";
import { AuthSession, InstallProgressData } from "../../shared/types";

interface Props {
    onComplete: () => void;
    session: AuthSession;
}

const InstallScreen: React.FC<Props> = ({ onComplete, session }) => {
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

    const getStageIcon = () => {
        switch (stage) {
            case "java":
                return "☕";
            case "minecraft":
                return "📦";
            case "neoforge":
                return "🔧"; // ← Cambiado
            case "mods":
                return "🧩";
            default:
                return "📥";
        }
    };

    return (
        <div className="screen install-screen">
            <div className="install-card">
                <h2>Instalación del Modpack</h2>
                <p className="welcome">Bienvenido, {session.username}</p>

                <div className="install-stages">
                    <div className={`stage ${stage === "java" ? "active" : ""} ${progress > 25 ? "done" : ""}`}>
                        <span>☕ Java 17</span>
                    </div>
                    <div className={`stage ${stage === "minecraft" ? "active" : ""} ${progress > 60 ? "done" : ""}`}>
                        <span>📦 Minecraft</span>
                    </div>
                    <div className={`stage ${stage === "neoforge" ? "active" : ""} ${progress > 85 ? "done" : ""}`}>
                        <span>🔧 NeoForge</span> {/* ← Cambiado */}
                    </div>
                    <div className={`stage ${stage === "mods" ? "active" : ""} ${progress >= 100 ? "done" : ""}`}>
                        <span>🧩 Mods</span>
                    </div>
                </div>

                {installing ? (
                    <div className="progress-section">
                        <div className="stage-icon">{getStageIcon()}</div>
                        <div className="progress-bar-bg">
                            <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="progress-text">{message}</span>
                        <span className="progress-percent">{progress}%</span>
                    </div>
                ) : (
                    <button onClick={handleInstall} className="btn-install" disabled={!!error}>
                        📥 Instalar Modpack
                    </button>
                )}

                {error && (
                    <div className="error-message">
                        ❌ Error: {error}
                        <button onClick={handleInstall} className="btn-retry">
                            Reintentar
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default InstallScreen;
