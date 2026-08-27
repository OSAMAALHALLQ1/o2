import React from 'react';

export default function UsersManagementPage() {
  const users = [
    { id: 'usr_001', username: 'anas_o2', name: 'أنس', companion: '🐼 باندا', status: 'نشط', role: 'لاعب', matches: 45 },
    { id: 'usr_002', username: 'karim_chef', name: 'كريم', companion: '🐨 كوالا', status: 'نشط', role: 'لاعب', matches: 32 },
    { id: 'usr_003', username: 'sara_gamer', name: 'سارة', companion: '🦊 ثعلب', status: 'نشط', role: 'مشرف', matches: 120 },
    { id: 'usr_004', username: 'troll_user', name: 'مجهول', companion: '🦖 ديناصور', status: 'مكتوم', role: 'لاعب', matches: 8 },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>👥 إدارة المستخدمين والإشراف</h1>
        <p style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          البحث عن اللاعبين، مراجعة البلاغات، وتطبيق إجراءات الإشراف (كتم / تعليق / حظر)
        </p>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h2 className="table-title">قائمة اللاعبين والمشرفين</h2>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="action-btn secondary">تصدير CSV</button>
            <button className="action-btn">+ إضافة مستخدم</button>
          </div>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>المعرف</th>
              <th>اسم المستخدم</th>
              <th>الاسم الظاهر</th>
              <th>الرفيق</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>المباريات</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td style={{ fontFamily: 'monospace', color: 'var(--o2-text-muted)' }}>{u.id}</td>
                <td style={{ fontWeight: 700 }}>@{u.username}</td>
                <td>{u.name}</td>
                <td>{u.companion}</td>
                <td>{u.role}</td>
                <td>
                  <span className={`badge-tag ${u.status === 'نشط' ? 'badge-active' : 'badge-warning'}`}>
                    {u.status}
                  </span>
                </td>
                <td>{u.matches}</td>
                <td>
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button className="action-btn secondary">عرض</button>
                    <button className="action-btn secondary" style={{ color: 'var(--o2-error)' }}>إشراف</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
