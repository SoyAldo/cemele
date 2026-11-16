import React, { useState, useEffect } from "react";
import LoginScreen from "./components/LoginScreen";
import InstallScreen from "./components/InstallScreen";
import PlayScreen from "./components/PlayScreen";
import TitleBar from "./components/TitleBar";
import SettingsModal from "./components/SettingsModal";
import CreatorPinModal from "./components/CreatorPinModal";
import CreatorStudioModal from "./components/CreatorStudioModal";
import { AuthSession, InstallStatus, ServerConfigData } from "../shared/types";

type Screen = "loading" | "login" | "install" | "play";

const App: React.FC = () => {
    const [screen, setScreen] = useState<Screen>("loading");
    const [session, setSession] = useState<AuthSession | null>(null);
    const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);
    const [config, setConfig] = useState<ServerConfigData | null>(null);
    const [showSettings, setShowSettings] = useState(false);
    const [showCreatorPin, setShowCreatorPin] = useState(false);
    const [showCreatorStudio, setShowCreatorStudio] = useState(false);

    useEffect(() => {
        checkInitialState();
    }, []);

    const checkInitialState = async () => {
        try {
            // PRIMERO verificar config
            const serverConfig = await window.electronAPI.getServerConfig();
            setConfig(serverConfig);

            // SEGUNDO verificar instalación
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);

            // LUEGO verificar sesión
            const currentSession = await window.electronAPI.getSession();

            if (!currentSession) {
                setScreen("login");
                return;
            }

            setSession(currentSession);
            setScreen(status.installed ? "play" : "install");
        } catch (error) {
            console.error("Error inicial:", error);
            setScreen("login");
        }
    };

    const handleLogin = async () => {
        const result = await window.electronAPI.microsoftLogin();
        if (result.success && result.session) {
            // Actualizar config para capturar el lastUsername
            const serverConfig = await window.electronAPI.getServerConfig();
            setConfig(serverConfig);

            setSession(result.session);
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);
            setScreen(status.installed ? "play" : "install");
        }
    };

    const handleOfflineLogin = async (username: string) => {
        const result = await window.electronAPI.offlineLogin(username);
        if (result.success && result.session) {
            // Actualizar config para capturar el lastUsername
            const serverConfig = await window.electronAPI.getServerConfig();
            setConfig(serverConfig);

            setSession(result.session);
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);
            setScreen(status.installed ? "play" : "install");
        }
    };

    const handleInstallComplete = async () => {
        const status = await window.electronAPI.checkInstallation();
        setInstallStatus(status);
        setScreen(status.installed ? "play" : "install");
    };

    const handleLogout = async () => {
        await window.electronAPI.logout();
        setSession(null);
        setScreen("login");
    };

    const handleUpdateConfig = async (newConfig: ServerConfigData) => {
        const success = await window.electronAPI.setServerConfig(newConfig);
        if (success) {
            setConfig(newConfig);
            setShowSettings(false);
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);
            setScreen(status.installed ? "play" : "install");
        } else {
            alert("Error al guardar la configuración");
        }
    };

    return (
        <div className="app">
            <TitleBar config={config} onOpenCreator={() => setShowCreatorPin(true)} />

            <main className="main-content">
                {screen === "loading" && (
                    <div className="loading-screen">
                        <div className="spinner"></div>
                        <p>Cargando...</p>
                    </div>
                )}

                {screen === "login" && <LoginScreen onLogin={handleLogin} onOfflineLogin={handleOfflineLogin} config={config} />}

                {screen === "install" && (
                    <InstallScreen
                        onComplete={handleInstallComplete}
                        session={session!}
                        onLogout={handleLogout}
                        installStatus={installStatus}
                    />
                )}

                {screen === "play" && (
                    <PlayScreen
                        session={session!}
                        installStatus={installStatus!}
                        config={config}
                        onLogout={handleLogout}
                        onOpenSettings={() => setShowSettings(true)}
                        onNeedUpdate={async () => {
                            const status = await window.electronAPI.checkInstallation();
                            setInstallStatus(status);
                            setScreen(status.installed ? "play" : "install");
                        }}
                    />
                )}
            </main>

            {showSettings && config && <SettingsModal config={config} onSave={handleUpdateConfig} onClose={() => setShowSettings(false)} />}

            {/* Modal de PIN de Creador */}
            {showCreatorPin && (
                <CreatorPinModal
                    onClose={() => setShowCreatorPin(false)}
                    onSuccess={() => {
                        setShowCreatorPin(false);
                        setShowCreatorStudio(true);
                    }}
                />
            )}

            {/* Modal Principal de Creator Studio */}
            {showCreatorStudio && (
                <CreatorStudioModal
                    onClose={() => setShowCreatorStudio(false)}
                />
            )}
        </div>
    );
};

export default App;
