// frontend/src/components/modals/UserProfileModal.tsx
import React, { useState } from 'react';
import type { OperatorSession } from '../../types';

interface UserProfileModalProps {
  session: OperatorSession;
  onUpdateAvatar: (url: string) => void;
  onClose: () => void;
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({ session, onUpdateAvatar, onClose }) => {
  const [avatarInput, setAvatarInput] = useState(session.avatarUrl || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (avatarInput.trim()) {
      onUpdateAvatar(avatarInput.trim());
    }
    onClose();
  };

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>Configurações de Perfil — Operador CCO</h3>
          <button onClick={onClose} style={styles.closeButton}>✕</button>
        </div>

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.profileHeaderBox}>
            <img 
              src={avatarInput || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150'} 
              alt="Avatar" 
              style={styles.avatarPreview}
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150';
              }}
            />
            <div>
              <span style={styles.operatorIdBadge}>{session.operatorId}</span>
              <h4 style={styles.roleTitle}>{session.role}</h4>
              <span style={styles.activeStatus}>● Sessão Ativa & Segura</span>
            </div>
          </div>

          <div style={styles.inputGroup}>
            <label style={styles.label}>URL da Nova Foto de Perfil (Avatar)</label>
            <input 
              type="url" 
              value={avatarInput}
              onChange={(e) => setAvatarInput(e.target.value)}
              placeholder="https://exemplo.com/sua-foto.jpg"
              style={styles.input}
            />
            <span style={styles.inputHint}>Insira o link direto de uma imagem pública para atualizar seu avatar.</span>
          </div>

          <div style={styles.metaContainer}>
            <div style={styles.metaRow}>
              <span>Eixo Operacional:</span>
              <strong>Linha 6-Laranja (Brasilândia ➔ São Joaquim)</strong>
            </div>
            <div style={styles.metaRow}>
              <span>Nível de Credenciamento:</span>
              <strong style={{ color: 'var(--uni-success)' }}>Nível 3 (Comandos Críticos Ativos)</strong>
            </div>
          </div>

          <div style={styles.modalActions}>
            <button type="button" onClick={onClose} style={styles.cancelBtn}>Cancelar</button>
            <button type="submit" style={styles.saveBtn}>Salvar Alterações</button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(0, 0, 0, 0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, fontFamily: 'var(--uni-font)', backdropFilter: 'blur(4px)' },
  modal: { backgroundColor: 'var(--uni-bg-secondary)', border: '1px solid var(--uni-border)', borderRadius: '16px', width: '100%', maxWidth: '460px', padding: '1.5rem', boxShadow: '0 20px 40px rgba(0,0,0,0.8)' },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem', borderBottom: '1px solid var(--uni-border)', paddingBottom: '0.75rem' },
  modalTitle: { fontSize: '0.9rem', fontWeight: 700, color: 'var(--uni-text-main)' },
  closeButton: { background: 'none', border: 'none', color: 'var(--uni-text-muted)', fontSize: '1rem', cursor: 'pointer' },
  form: { display: 'flex', flexDirection: 'column', gap: '1.25rem' },
  profileHeaderBox: { display: 'flex', alignItems: 'center', gap: '1rem', backgroundColor: 'var(--uni-bg-primary)', padding: '1rem', borderRadius: '10px', border: '1px solid var(--uni-border)' },
  avatarPreview: { width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--uni-orange)' },
  operatorIdBadge: { fontSize: '0.65rem', backgroundColor: 'rgba(255, 102, 0, 0.15)', color: 'var(--uni-orange)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontFamily: 'monospace', fontWeight: 'bold' },
  roleTitle: { fontSize: '0.95rem', fontWeight: 700, color: 'var(--uni-text-main)', margin: '0.2rem 0' },
  activeStatus: { fontSize: '0.65rem', color: 'var(--uni-success)', fontWeight: 'bold' },
  inputGroup: { display: 'flex', flexDirection: 'column', gap: '0.4rem' },
  label: { fontSize: '0.7rem', color: 'var(--uni-text-muted)', fontWeight: 600 },
  input: { backgroundColor: 'var(--uni-bg-primary)', border: '1px solid var(--uni-border)', borderRadius: '8px', padding: '0.65rem', color: 'var(--uni-text-main)', fontSize: '0.8rem', outline: 'none' },
  inputHint: { fontSize: '0.65rem', color: 'var(--uni-text-muted)' },
  metaContainer: { backgroundColor: 'var(--uni-bg-primary)', padding: '0.85rem', borderRadius: '8px', border: '1px solid var(--uni-border)', display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.75rem' },
  metaRow: { display: 'flex', justifyContent: 'space-between', color: 'var(--uni-text-muted)' },
  modalActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' },
  cancelBtn: { backgroundColor: 'var(--uni-bg-card)', border: '1px solid var(--uni-border)', color: 'var(--uni-text-main)', padding: '0.6rem 1rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 },
  saveBtn: { backgroundColor: 'var(--uni-orange)', border: 'none', color: '#fff', padding: '0.6rem 1.25rem', borderRadius: '8px', fontSize: '0.75rem', cursor: 'pointer', fontWeight: 600 }
};