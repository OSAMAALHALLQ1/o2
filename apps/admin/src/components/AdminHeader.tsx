import React from 'react';

export const AdminHeader: React.FC = () => {
  return (
    <header className="admin-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          فرع العمليات: <strong>غزة الرئيسي & النصيرات</strong>
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span className="badge-tag badge-active">خادم الإنتاج متصل ✓</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '999px',
              backgroundColor: 'var(--o2-brand-red)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              color: 'white',
            }}
          >
            AD
          </div>
          <span style={{ fontSize: '14px', fontWeight: 600 }}>مدير النظام</span>
        </div>
      </div>
    </header>
  );
};
