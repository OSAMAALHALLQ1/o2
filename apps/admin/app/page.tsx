import React from 'react';

export default function DashboardOverviewPage() {
  const kpis = [
    { label: 'إجمالي المستخدمين المسجلين', value: '14,280', badge: '+12% هذا الأسبوع' },
    { label: 'اللاعبين النشطين يومياً (DAU)', value: '3,840', badge: 'قمة النشاط مسائية' },
    { label: 'الغرف النشطة حالياً', value: '42 غرفة', badge: 'مافيا & أطرش بالزفة' },
    { label: 'الجواهر الموزعة للطلبات', value: '18,650 💎', badge: 'معدل ربط فواتير 89%' },
  ];

  const recentOrders = [
    { id: 'ORD-9842', branch: 'فرع غزة الرئيسي', user: 'أنس (anas_o2)', amount: '₪120.00', gems: '12 💎', status: 'موثق ✓' },
    { id: 'ORD-9841', branch: 'فرع النصيرات', user: 'كريم (karim_chef)', amount: '₪85.00', gems: '8 💎', status: 'موثق ✓' },
    { id: 'ORD-9840', branch: 'فرع غزة الرئيسي', user: 'سارة (sara_gamer)', amount: '₪210.00', gems: '21 💎', status: 'موثق ✓' },
    { id: 'ORD-9839', branch: 'فرع النصيرات', user: 'محمود (mahmoud_99)', amount: '₪65.00', gems: '6 💎', status: 'موثق ✓' },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>📊 نظرة عامة على النشاط والألعاب</h1>
        <p style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          مراقبة حية للمستخدمين، نشاط صالات الألعاب، وفواتير فروع مطعم O2
        </p>
      </div>

      {/* KPI Cards Grid */}
      <div className="kpi-grid">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="kpi-card">
            <span className="kpi-label">{kpi.label}</span>
            <span className="kpi-val">{kpi.value}</span>
            <span className="kpi-badge">{kpi.badge}</span>
          </div>
        ))}
      </div>

      {/* Recent Activity Table */}
      <div className="table-card">
        <div className="table-header">
          <h2 className="table-title">🧾 أحدث طلبات مطعم O2 المربوطة بالجواهر</h2>
          <span className="badge-tag badge-active">تحديث مباشر</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>رقم الطلب</th>
              <th>الفرع</th>
              <th>المستخدم</th>
              <th>قيمة الطلب</th>
              <th>الجواهر الممنوحة</th>
              <th>الحالة</th>
            </tr>
          </thead>
          <tbody>
            {recentOrders.map((ord) => (
              <tr key={ord.id}>
                <td style={{ fontWeight: 700, fontFamily: 'monospace' }}>{ord.id}</td>
                <td>{ord.branch}</td>
                <td>{ord.user}</td>
                <td style={{ fontWeight: 600 }}>{ord.amount}</td>
                <td style={{ color: 'var(--o2-gold)', fontWeight: 700 }}>{ord.gems}</td>
                <td>
                  <span className="badge-tag badge-active">{ord.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
