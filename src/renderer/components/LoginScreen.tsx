import React, { useState } from "react";
import { ServerConfigData } from "../../shared/types";

interface Props {
    onLogin: () => void;
    onOfflineLogin: (username: string) => void;
    config: ServerConfigData | null;
}

const LoginScreen: React.FC<Props> = ({ onLogin, onOfflineLogin, config }) => {
    const [loading, setLoading] = useState(false);
    const [username, setUsername] = useState(config?.lastUsername || "");

    /*
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
    */

    const handleOfflineLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!username.trim()) return;

        setLoading(true);
        await onOfflineLogin(username);
        setLoading(false);
    };

    return (
        <div className="screen login-screen">
            <div className="login-card">
                <h1>¡Elige tu nombre!</h1>
                <p>Escribe el nombre de usuario que deseas utilizar en el servidor.</p>
                <form onSubmit={handleOfflineLogin} className="offline-login-form">
                    <input
                        type="text"
                        placeholder="Nombre de jugador"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        disabled={loading}
                        className="input-username"
                    />
                    <button type="submit" className="btn-play-offline" disabled={loading || !username.trim()}>
                        {loading ? "Entrando..." : "Entrar"}
                    </button>
                </form>

                {/* <div className="login-divider">
                    <span>o</span>
                </div>

                <button onClick={handleLogin} className="btn-microsoft" disabled={loading}>
                    {loading ? "Conectando..." : "Iniciar sesión con Microsoft"}
                </button> 
                */}
            </div>
        </div>
    );
};

export default LoginScreen;
