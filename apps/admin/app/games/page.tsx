import React from 'react';

export default function GamesMonitoringPage() {
  const games = [
    { slug: 'atrash', name: 'أطرش بالزفة', publicCount: 5, activeRooms: 18, totalPlayedToday: 340, status: 'متاح' },
    { slug: 'mafia', name: 'مافيا O2', publicCount: 8, activeRooms: 14, totalPlayedToday: 210, status: 'متاح' },
    { slug: 'tarneeb', name: 'طرنيب (41)', publicCount: 4, activeRooms: 8, totalPlayedToday: 180, status: 'متاح' },
    { slug: 'hide_seek', name: 'استغماية O2', publicCount: 8, activeRooms: 2, totalPlayedToday: 45, status: 'تجريبي' },
    { slug: 'imposter_sabotage', name: 'المخرب في المطبخ', publicCount: 8, activeRooms: 0, totalPlayedToday: 0, status: 'قيد التطوير' },
  ];

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800 }}>🎮 مراقبة الألعاب والغرف النشطة</h1>
        <p style={{ fontSize: '14px', color: 'var(--o2-text-secondary)' }}>
          إحصائيات فورية لغرف اللعب المتزامنة، وحالة خوادم المطابقة
        </p>
      </div>

      <div className="table-card">
        <div className="table-header">
          <h2 className="table-title">كتالوج الألعاب وحالة السيرفرات</h2>
          <span className="badge-tag badge-active">جميع الخوادم متصلة</span>
        </div>
        <table className="admin-table">
          <thead>
            <tr>
              <th>معرف اللعبة</th>
              <th>اسم اللعبة</th>
              <th>عدد اللاعبين</th>
              <th>الغرف المفتوحة حالياً</th>
              <th>جولات اليوم</th>
              <th>الحالة</th>
              <th>التحكم</th>
            </tr>
          </thead>
          <tbody>
            {games.map((g) => (
              <tr key={g.slug}>
                <td style={{ fontFamily: 'monospace' }}>{g.slug}</td>
                <td style={{ fontWeight: 700 }}>{g.name}</td>
                <td>{g.publicCount} لاعبين</td>
                <td style={{ color: 'var(--o2-gold)', fontWeight: 700 }}>{g.activeRooms}</td>
                <td>{g.totalPlayedToday}</td>
                <td>
                  <span className={`badge-tag ${g.status === 'متاح' ? 'badge-active' : 'badge-warning'}`}>
                    {g.status}
                  </span>
                </td>
                <td>
                  <button className="action-btn secondary">إدارة الإعدادات</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
