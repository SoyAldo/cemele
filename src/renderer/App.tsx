import React, { useState, useEffect } from "react";
import LoginScreen from "./components/LoginScreen";
import InstallScreen from "./components/InstallScreen";
import PlayScreen from "./components/PlayScreen";
import TitleBar from "./components/TitleBar";
import { AuthSession, InstallStatus } from "../shared/types";

type Screen = "loading" | "login" | "install" | "play";

const App: React.FC = () => {
    const [screen, setScreen] = useState<Screen>("loading");
    const [session, setSession] = useState<AuthSession | null>(null);
    const [installStatus, setInstallStatus] = useState<InstallStatus | null>(null);

    useEffect(() => {
        checkInitialState();
    }, []);

    const checkInitialState = async () => {
        try {
            // Verificar sesión
            const currentSession = await window.electronAPI.getSession();
            if (!currentSession) {
                setScreen("login");
                return;
            }
            setSession(currentSession);

            // Verificar instalación
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);
            setScreen(status.installed ? "play" : "install");
        } catch (error) {
            console.error("Error inicial:", error);
            setScreen("login");
        }
    };

    const handleLogin = async () => {
        const result = await window.electronAPI.microsoftLogin();
        if (result.success && result.session) {
            setSession(result.session);
            const status = await window.electronAPI.checkInstallation();
            setInstallStatus(status);
            setScreen(status.installed ? "play" : "install");
        }
    };

    const handleInstallComplete = () => {
        setInstallStatus({ installed: true, version: "1.20.1-forge" });
        setScreen("play");
    };

    const handleLogout = async () => {
        await window.electronAPI.logout();
        setSession(null);
        setScreen("login");
    };

    return (
        <div className="app">
            <TitleBar />

            <main className="main-content">
                {screen === "loading" && (
                    <div className="loading-screen">
                        <div className="spinner"></div>
                        <p>Cargando...</p>
                    </div>
                )}

                {screen === "login" && <LoginScreen onLogin={handleLogin} />}

                {screen === "install" && <InstallScreen onComplete={handleInstallComplete} session={session!} />}

                {screen === "play" && <PlayScreen session={session!} installStatus={installStatus!} onLogout={handleLogout} />}
            </main>
        </div>
    );
};

export default App;
