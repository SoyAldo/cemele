import React, { useState } from "react";

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

const CreatorPinModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) {
      setError("Por favor ingresa el PIN");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const isValid = await window.electronAPI.verifyCreatorPin(pin.trim());
      if (isValid) {
        onSuccess();
      } else {
        setError("PIN incorrecto. Revisa CREATOR_PIN en tu .env (por defecto: 1234)");
      }
    } catch (err: any) {
      setError(err.message || "Error al verificar el PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content creator-pin-modal">
        <div className="modal-header">
          <h3>🔐 Acceso de Creador</h3>
          <button className="btn-close-modal" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit} className="creator-pin-form">
          <p className="creator-pin-desc">
            Introduce tu clave de creador para acceder al panel visual de creación y empaquetado de actualizaciones.
          </p>

          <div className="form-group">
            <label>PIN de Acceso:</label>
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••"
              autoFocus
              maxLength={20}
              className="pin-input"
            />
          </div>

          {error && <div className="error-message">{error}</div>}

          <div className="modal-actions">
            <button type="button" onClick={onClose} className="btn-secondary" disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn-primary" disabled={loading}>
              {loading ? "Verificando..." : "Ingresar al Panel"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreatorPinModal;

