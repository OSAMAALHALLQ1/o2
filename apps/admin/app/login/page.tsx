import React from 'react';
import Link from 'next/link';

export default function AdminLoginPage() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '70vh',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '400px',
          backgroundColor: 'var(--o2-surface)',
          padding: '32px',
          borderRadius: '16px',
          border: '1px solid var(--o2-border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}
      >
        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <span className="sidebar-logo-badge" style={{ alignSelf: 'center' }}>O2</span>
          <h1 style={{ fontSize: '20px', fontWeight: 800 }}>تسجيل الدخول للإدارة</h1>
          <p style={{ fontSize: '12px', color: 'var(--o2-text-secondary)' }}>
            لوحة إدارة O2 Universe للمشرفين ومدراء الفروع
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={{ fontSize: '12px', color: 'var(--o2-text-secondary)', display: 'block', marginBottom: '4px' }}>
              البريد الإلكتروني / اسم المستخدم
            </label>
            <input
              type="text"
              defaultValue="admin@o2.rest"
              disabled
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--o2-surface-elevated)',
                border: '1px solid var(--o2-border)',
                color: 'var(--o2-text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', color: 'var(--o2-text-secondary)', display: 'block', marginBottom: '4px' }}>
              كلمة المرور
            </label>
            <input
              type="password"
              defaultValue="••••••••••••"
              disabled
              style={{
                width: '100%',
                padding: '10px 12px',
                borderRadius: '8px',
                backgroundColor: 'var(--o2-surface-elevated)',
                border: '1px solid var(--o2-border)',
                color: 'var(--o2-text-primary)',
                fontFamily: 'inherit',
              }}
            />
          </div>
        </div>

        <Link href="/" className="action-btn" style={{ textAlign: 'center', padding: '10px' }}>
          دخول لوحة التحكم (تجريبي)
        </Link>
      </div>
    </div>
  );
}
