import React from "react";
import { ServerConfigData } from "../../shared/types";

interface Props {
    config: ServerConfigData | null;
}

const TitleBar: React.FC<Props> = ({ config }) => {
    const handleMinimize = () => {
        window.electronAPI.minimizeWindow();
    };

    const handleClose = () => {
        window.electronAPI.closeWindow();
    };

    return (
        <div className="title-bar">
            <div className="title-bar-drag">
                <span className="logo">⛏ {config?.name || "Cemele"}</span>
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
