'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export const AdminSidebar: React.FC = () => {
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'نظرة عامة والنشاط', icon: '📊' },
    { href: '/users', label: 'المستخدمين والإشراف', icon: '👥' },
    { href: '/games', label: 'مراقبة الألعاب والغرف', icon: '🎮' },
    { href: '/campaigns', label: 'حملات الـ QR والميزانية', icon: '🏷️' },
    { href: '/analytics', label: 'إيرادات وفروع O2', icon: '📈' },
  ];

  return (
    <aside className="admin-sidebar">
      <div className="sidebar-logo">
        <span className="sidebar-logo-badge">O2</span>
        <span className="sidebar-logo-title">لوحة إدارة O2</span>
      </div>

      <nav className="sidebar-nav">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-link ${isActive ? 'active' : ''}`}
            >
              <span>{item.icon}</span>
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
};
