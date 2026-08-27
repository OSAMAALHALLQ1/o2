import React from 'react';

export default function AnalyticsAttributionPage() {
  const branchStats = [
    { branch: 'فرع غزة الرئيسي — الرمال', orders: 1240, revenue: '₪98,500.00', gemsGiven: '9,850 💎', avgOrder: '₪79.40' },
    { branch: 'فرع النصيرات — السوق التجاري', orders: 860, revenue: '₪62,400.00', gemsGiven: '6,240 💎', avgOrder: '₪72.50' },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>📈 إحصائيات الإيرادات وربط المطاعم</h1>
        <p style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          تحليل تأثير تطبيق O2 Universe على مبيعات فروع المطاعم وتفاعل الزبائن
        </p>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h2 className="table-title">أداء الفروع والمبيعات المنسوبة للتطبيق</h2>
          <span className="badge-tag badge-active">تقرير الشهر الحالي</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>اسم الفرع</th>
              <th>عدد الطلبات المربوطة</th>
              <th>إجمالي المبيعات</th>
              <th>الجواهر الممنوحة</th>
              <th>متوسط قيمة الطلب</th>
            </tr>
          </thead>
          <tbody>
            {branchStats.map((b, idx) => (
              <tr key={idx}>
                <td style={{ fontWeight: 700 }}>{b.branch}</td>
                <td style={{ fontWeight: 600 }}>{b.orders} طلب</td>
                <td style={{ color: 'var(--o2-success)', fontWeight: 700 }}>{b.revenue}</td>
                <td style={{ color: 'var(--o2-gold)', fontWeight: 700 }}>{b.gemsGiven}</td>
                <td>{b.avgOrder}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
