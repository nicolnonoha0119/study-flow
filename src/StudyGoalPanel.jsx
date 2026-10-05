import React, { useMemo, useState } from 'react';
import { getGoalStats } from './studyGoalEngine';

const EMPTY_FORM = {
  title: '',
  subject: '数学',
  totalPages: 100,
  currentPage: 0,
  deadline: '',
  minutesPerPage: 3,
  priority: 4,
};

function formatMinutes(minutes) {
  const value = Math.max(0, Math.round(minutes || 0));
  const h = Math.floor(value / 60);
  const m = value % 60;
  if (!h) return `${m}分`;
  if (!m) return `${h}時間`;
  return `${h}時間${m}分`;
}

export default function StudyGoalPanel({
  goals = [],
  selectedDate,
  subjects = [],
  onCreate,
  onUpdate,
  onDelete,
  onCompleteToday,
}) {
  const [form, setForm] = useState({
    ...EMPTY_FORM,
    deadline: selectedDate,
    subject: subjects[0] || 'その他',
  });
  const [editingId, setEditingId] = useState(null);

  const goalSummaries = useMemo(
    () => goals.map((goal) => ({
      goal,
      stats: getGoalStats(goal, selectedDate),
    })),
    [goals, selectedDate]
  );

  const save = async (event) => {
    event.preventDefault();
    const title = form.title.trim();
    if (!title) return;

    const payload = {
      title,
      subject: form.subject,
      total_pages: Math.max(1, Number(form.totalPages) || 1),
      current_page: Math.max(0, Number(form.currentPage) || 0),
      deadline: form.deadline || selectedDate,
      minutes_per_page: Math.max(0.5, Number(form.minutesPerPage) || 3),
      priority: Math.min(5, Math.max(1, Number(form.priority) || 4)),
    };

    if (editingId) {
      await onUpdate(editingId, payload);
    } else {
      await onCreate(payload);
    }

    setEditingId(null);
    setForm({
      ...EMPTY_FORM,
      deadline: selectedDate,
      subject: subjects[0] || 'その他',
    });
  };

  const edit = (goal) => {
    setEditingId(goal.id);
    setForm({
      title: goal.title,
      subject: goal.subject,
      totalPages: goal.total_pages,
      currentPage: goal.current_page,
      deadline: goal.deadline,
      minutesPerPage: goal.minutes_per_page,
      priority: goal.priority,
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="study-goals-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">STUDY GOALS</p>
          <h1>参考書・教材</h1>
          <p className="page-description">
            参考書の進捗と締切を登録すると、毎日のページ数を自動で逆算します。
          </p>
        </div>
      </div>

      <div className="content-grid">
        <section className="card">
          <div className="section-header">
            <div>
              <h2>{editingId ? '参考書を編集' : '参考書を登録'}</h2>
              <p>ページ数と締切から毎日の目標を作ります。</p>
            </div>
          </div>

          <form className="settings-form" onSubmit={save}>
            <label>
              参考書名
              <input
                value={form.title}
                onChange={(e) => setForm((v) => ({ ...v, title: e.target.value }))}
                placeholder="例：青チャート 数III"
              />
            </label>

            <div className="form-row">
              <label>
                科目
                <select
                  value={form.subject}
                  onChange={(e) => setForm((v) => ({ ...v, subject: e.target.value }))}
                >
                  {(subjects.length ? subjects : ['その他']).map((subject) => (
                    <option key={subject} value={subject}>{subject}</option>
                  ))}
                </select>
              </label>

              <label>
                総ページ数
                <input
                  type="number"
                  min="1"
                  value={form.totalPages}
                  onChange={(e) => setForm((v) => ({ ...v, totalPages: e.target.value }))}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                現在のページ
                <input
                  type="number"
                  min="0"
                  value={form.currentPage}
                  onChange={(e) => setForm((v) => ({ ...v, currentPage: e.target.value }))}
                />
              </label>

              <label>
                終了したい日
                <input
                  type="date"
                  value={form.deadline}
                  onChange={(e) => setForm((v) => ({ ...v, deadline: e.target.value }))}
                />
              </label>
            </div>

            <div className="form-row">
              <label>
                1ページあたりの目安（分）
                <input
                  type="number"
                  min="0.5"
                  step="0.5"
                  value={form.minutesPerPage}
                  onChange={(e) => setForm((v) => ({ ...v, minutesPerPage: e.target.value }))}
                />
              </label>

              <label>
                優先度
                <select
                  value={form.priority}
                  onChange={(e) => setForm((v) => ({ ...v, priority: Number(e.target.value) }))}
                >
                  <option value="5">★★★★★</option>
                  <option value="4">★★★★</option>
                  <option value="3">★★★</option>
                  <option value="2">★★</option>
                  <option value="1">★</option>
                </select>
              </label>
            </div>

            <div className="form-actions">
              <button className="primary-button" type="submit">
                {editingId ? '参考書を更新' : '参考書を登録'}
              </button>
              {editingId && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => {
                    setEditingId(null);
                    setForm({ ...EMPTY_FORM, deadline: selectedDate, subject: subjects[0] || 'その他' });
                  }}
                >
                  キャンセル
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="card">
          <div className="section-header">
            <div>
              <h2>モチベーション</h2>
              <p>今日の進み具合と締切までのペース</p>
            </div>
          </div>

          {goalSummaries.length === 0 ? (
            <div className="empty-state">
              <strong>まだ参考書がありません</strong>
              <p>左側から参考書を登録すると、ここに進捗が表示されます。</p>
            </div>
          ) : (
            <div className="goal-summary-list">
              {goalSummaries.map(({ goal, stats }) => (
                <div className="goal-summary-card" key={goal.id}>
                  <div className="goal-summary-top">
                    <div>
                      <span className="subject-tag">{goal.subject}</span>
                      <h3>{goal.title}</h3>
                    </div>
                    <strong>{stats.progressPercent}%</strong>
                  </div>

                  <div className="progress-line large">
                    <div style={{ width: `${stats.progressPercent}%` }} />
                  </div>

                  <div className="goal-stat-grid">
                    <div><span>残り</span><strong>{stats.remainingPages}p</strong></div>
                    <div><span>あと</span><strong>{stats.daysLeft}日</strong></div>
                    <div><span>1日</span><strong>{stats.pagesPerDay}p</strong></div>
                    <div><span>目安</span><strong>{formatMinutes(stats.minutesPerDay)}</strong></div>
                  </div>

                  <div className="goal-today-card">
                    <div>
                      <span>今日の目標</span>
                      <strong>
                        {stats.todayTargetPages > 0
                          ? `P.${stats.todayStartPage}〜${stats.todayEndPage}`
                          : '完了'}
                      </strong>
                    </div>
                    <div>
                      <span>今日の達成</span>
                      <strong>{stats.todayPercent}%</strong>
                    </div>
                  </div>

                  <div className="form-actions">
                    {stats.todayTargetPages > 0 && (
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => onCompleteToday(goal.id, stats.todayEndPage)}
                      >
                        今日のページを完了
                      </button>
                    )}
                    <button className="secondary-button" type="button" onClick={() => edit(goal)}>
                      編集
                    </button>
                    <button className="ghost-button" type="button" onClick={() => onDelete(goal.id)}>
                      削除
                    </button>
                  </div>

                  <p className={stats.overdue ? 'goal-warning' : 'goal-message'}>
                    {stats.overdue
                      ? '締切を過ぎています。残りページを今日から再配分します。'
                      : `このままなら、1日${stats.pagesPerDay}ページほど進めれば${goal.deadline}までに完了できます。`}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
