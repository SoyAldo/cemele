import React, { useState } from "react";
import { ServerConfigData } from "../../shared/types";

interface Props {
    config: ServerConfigData;
    onSave: (config: ServerConfigData) => void;
    onClose: () => void;
}

const SettingsModal: React.FC<Props> = ({ config, onSave, onClose }) => {
    const [ramMin, setRamMin] = useState(config.ramMin);
    const [ramMax, setRamMax] = useState(config.ramMax);

    const handleSave = () => {
        onSave({
            ...config,
            ramMin,
            ramMax,
        });
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Configuración</h2>
                    <button className="btn-close-modal" onClick={onClose}>
                        &times;
                    </button>
                </div>

                <div className="modal-body">
                    <div className="form-group">
                        <label>RAM Mínima (Ej: 2G)</label>
                        <input 
                            type="text" 
                            value={ramMin} 
                            onChange={(e) => setRamMin(e.target.value)} 
                        />
                    </div>

                    <div className="form-group">
                        <label>RAM Máxima (Ej: 4G)</label>
                        <input 
                            type="text" 
                            value={ramMax} 
                            onChange={(e) => setRamMax(e.target.value)} 
                        />
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        Cancelar
                    </button>
                    <button className="btn-primary" onClick={handleSave}>
                        Guardar Cambios
                    </button>
                </div>
            </div>
        </div>
    );
};

export default SettingsModal;
