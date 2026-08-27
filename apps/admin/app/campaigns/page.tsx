import React from 'react';

export default function CampaignsManagementPage() {
  const campaigns = [
    { id: 'cmp_01', title: 'حملة افتتاح فرع النصيرات', type: 'CAMPAIGN_MARKETING', cap: '₪5,000.00', spent: '₪1,450.00', claims: 290, status: 'نشطة' },
    { id: 'cmp_02', title: 'حملة فواتير الصيف 2026', type: 'RECEIPT_ORDER', cap: '₪10,000.00', spent: '₪6,800.00', claims: 680, status: 'نشطة' },
    { id: 'cmp_03', title: 'جوائز جيلاتو O2 المجانية', type: 'CAMPAIGN_MARKETING', cap: '₪2,000.00', spent: '₪2,000.00', claims: 400, status: 'مكتملة الميزانية' },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>🏷️ حملات الـ QR وسقوف الميزانية المالية</h1>
        <p style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          إدارة الحملات الترويجية والتحكم في الحد المالي الأقصى للجوائز العينية
        </p>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h2 className="table-title">حملات الاستجابة السريعة (QR Campaigns)</h2>
          <button className="action-btn">+ إنشاء حملة جديدة</button>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>معرف الحملة</th>
              <th>عنوان الحملة</th>
              <th>النوع</th>
              <th>سقف الميزانية الفعلي</th>
              <th>المصروف الفعلي</th>
              <th>المطالبات</th>
              <th>الحالة</th>
              <th>الإجراءات</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td style={{ fontFamily: 'monospace' }}>{c.id}</td>
                <td style={{ fontWeight: 700 }}>{c.title}</td>
                <td style={{ fontSize: '11px', color: 'var(--o2-text-muted)' }}>{c.type}</td>
                <td style={{ fontWeight: 600 }}>{c.cap}</td>
                <td style={{ color: 'var(--o2-gold)', fontWeight: 700 }}>{c.spent}</td>
                <td>{c.claims}</td>
                <td>
                  <span className={`badge-tag ${c.status === 'نشطة' ? 'badge-active' : 'badge-warning'}`}>
                    {c.status}
                  </span>
                </td>
                <td>
                  <button className="action-btn secondary">تعديل</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
