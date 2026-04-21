import React from "react";

interface Props {
    onLogin: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
    const handleLogin = async () => {
        console.log("Login button clicked"); // Debug

        try {
            const result = await window.electronAPI.microsoftLogin();
            console.log("Login result:", result); // Debug

            if (result.success && result.session) {
                onLogin(); // Llamar al callback del padre
            } else {
                console.error("Login failed:", result.error);
            }
        } catch (error) {
            console.error("Login error:", error);
        }
    };

    return (
        <div className="screen login-screen">
            <div className="login-card">
                <h1>Mi Modpack Launcher</h1>
                <p className="subtitle">v1.0.0 • Minecraft 1.20.1</p>

                <div className="login-illustration">
                    <div className="minecraft-block">⛏</div>
                </div>

                {/* Botón con onClick correcto */}
                <button onClick={handleLogin} className="btn-microsoft">
                    Iniciar sesión con Microsoft
                </button>

                <p className="hint">Se requiere cuenta de Microsoft con Minecraft comprado</p>
            </div>
        </div>
    );
};

export default LoginScreen;
