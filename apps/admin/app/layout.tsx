import React from 'react';
import type { Metadata } from 'next';
import '../src/styles/admin.css';
import { AdminSidebar } from '../src/components/AdminSidebar';
import { AdminHeader } from '../src/components/AdminHeader';

export const metadata: Metadata = {
  title: 'لوحة إدارة O2 Universe — لوحة التحكم',
  description: 'لوحة التحكم والإدارة لشبكة مطاعم وألعاب O2 Universe',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <div className="admin-layout">
          <AdminSidebar />
          <div className="admin-main">
            <AdminHeader />
            <main className="admin-content">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
