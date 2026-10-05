import React, { useState } from 'react';

const CATEGORIES = [
  { value: 'school', label: '学校' },
  { value: 'cram', label: '塾' },
  { value: 'club', label: '部活' },
  { value: 'private', label: '予定' },
  { value: 'other', label: 'その他' },
];

export default function SchedulePanel({
  selectedDate,
  schedules = [],
  onCreate,
  onDelete,
}) {
  const [form, setForm] = useState({
    title: '',
    category: 'private',
    start_time: '18:00',
    end_time: '19:00',
    repeat_type: 'today',
    schedule_date: selectedDate,
  });

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    await onCreate({
      ...form,
      title: form.title.trim(),
      schedule_date: selectedDate,
    });
    setForm((v) => ({
      ...v,
      title: '',
      schedule_date: selectedDate,
    }));
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <p className="eyebrow">SCHEDULES</p>
          <h1>予定・時間</h1>
          <p className="page-description">学校・塾・部活などを登録すると、自動計画がその時間を避けて学習時間を確保します。</p>
        </div>
      </div>

      <section className="card">
        <div className="section-header">
          <div>
            <h2>予定を追加</h2>
            <p>{selectedDate} の固定予定</p>
          </div>
        </div>

        <form className="settings-form" onSubmit={submit}>
          <label>
            予定名
            <input value={form.title} onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))} placeholder="例：学校・塾・部活" />
          </label>

          <div className="form-row">
            <label>
              開始
              <input type="time" value={form.start_time} onChange={(e) => setForm((v) => ({ ...v, start_time: e.target.value }))} />
            </label>
            <label>
              終了
              <input type="time" value={form.end_time} onChange={(e) => setForm((v) => ({ ...v, end_time: e.target.value }))} />
            </label>
          </div>

          <div className="form-row">
            <label>
              種類
              <select value={form.category} onChange={(e) => setForm((v) => ({ ...v, category: e.target.value }))}>
                {CATEGORIES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </label>
            <label>
              繰り返し
              <select value={form.repeat_type} onChange={(e) => setForm((v) => ({ ...v, repeat_type: e.target.value }))}>
                <option value="today">この日のみ</option>
                <option value="daily">毎日</option>
              </select>
            </label>
          </div>

          <button className="primary-button" type="submit">予定を追加</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="section-header">
          <div>
            <h2>登録済みの予定</h2>
            <p>自動計画ではここを勉強不可時間として扱います。</p>
          </div>
        </div>

        <div className="fixed-list">
          {schedules.length === 0 && <p className="muted">予定はありません。</p>}
          {schedules.map((schedule) => (
            <div className="fixed-item" key={schedule.id}>
              <div>
                <strong>{schedule.title}</strong>
                <span>{schedule.start_time} - {schedule.end_time}{schedule.repeat_type === 'daily' ? ' · 毎日' : ''}</span>
              </div>
              <button type="button" onClick={() => onDelete(schedule.id)}>×</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
