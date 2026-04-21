import React, { useState } from "react";

interface Props {
    onLogin: () => void;
}

const LoginScreen: React.FC<Props> = ({ onLogin }) => {
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        setLoading(true);
        console.log("Login button clicked");

        try {
            const result = await window.electronAPI.microsoftLogin();
            console.log("Login result:", result);

            if (result.success && result.session) {
                onLogin();
            } else {
                console.error("Login failed:", result.error);
                alert("Error: " + (result.error || "Login falló"));
            }
        } catch (error) {
            console.error("Login error:", error);
            alert("Error de conexión: " + error);
        } finally {
            setLoading(false);
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

                <button onClick={handleLogin} className="btn-microsoft" disabled={loading}>
                    {loading ? "Conectando..." : "Iniciar sesión con Microsoft"}
                </button>

                <p className="hint">Se requiere cuenta de Microsoft con Minecraft comprado</p>
            </div>
        </div>
    );
};

export default LoginScreen;
