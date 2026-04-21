import React from "react";

const TitleBar: React.FC = () => {
    const handleMinimize = () => {
        console.log("Minimize clicked"); // Debug
        window.electronAPI.minimizeWindow();
    };

    const handleClose = () => {
        console.log("Close clicked"); // Debug
        window.electronAPI.closeWindow();
    };

    return (
        <div className="title-bar">
            <div className="title-bar-drag">
                <span className="logo">⛏ Mi Modpack</span>
            </div>
            <div className="window-controls">
                <button onClick={handleMinimize} className="btn-minimize">
                    ─
                </button>
                <button onClick={handleClose} className="btn-close">
                    ✕
                </button>
            </div>
        </div>
    );
};

export default TitleBar;
