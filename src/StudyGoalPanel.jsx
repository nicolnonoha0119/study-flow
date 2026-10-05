/*
  StudyFlow - Study Goal Engine
  参考書のページ進捗と締切から、毎日の学習目標を計算する純粋関数。
*/

export function dateToLocal(dateString) {
  return new Date(`${dateString}T00:00:00`);
}

export function diffDays(fromDate, toDate) {
  const a = dateToLocal(fromDate);
  const b = dateToLocal(toDate);
  return Math.round((b - a) / 86400000);
}

export function todayDateString() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function normalizeStudyGoal(goal, userId) {
  const totalPages = Math.max(1, Number(goal?.total_pages ?? goal?.totalPages) || 1);
  const currentPage = Math.min(
    totalPages,
    Math.max(0, Number(goal?.current_page ?? goal?.currentPage) || 0)
  );

  return {
    id: goal?.id || crypto.randomUUID(),
    user_id: goal?.user_id || userId,
    title: goal?.title || '参考書',
    subject: goal?.subject || 'その他',
    total_pages: totalPages,
    current_page: currentPage,
    deadline: goal?.deadline || todayDateString(),
    minutes_per_page: Math.max(
      0.5,
      Number(goal?.minutes_per_page ?? goal?.minutesPerPage) || 3
    ),
    priority: Math.min(
      5,
      Math.max(1, Number(goal?.priority) || 4)
    ),
    created_at: goal?.created_at || new Date().toISOString(),
  };
}

export function getGoalStats(goal, dateString = todayDateString()) {
  const total = Math.max(1, Number(goal.total_pages) || 1);
  const current = Math.min(total, Math.max(0, Number(goal.current_page) || 0));
  const remaining = Math.max(0, total - current);
  const percent = Math.min(100, Math.round((current / total) * 100));

  const rawDaysLeft = diffDays(dateString, goal.deadline) + 1;
  const daysLeft = Math.max(1, rawDaysLeft);
  const pagesPerDay = remaining > 0 ? Math.ceil(remaining / daysLeft) : 0;
  const minutesPerDay = Math.ceil(pagesPerDay * Number(goal.minutes_per_page || 3));

  let todayStartPage = current + 1;
  let todayEndPage = current;

  if (remaining > 0 && rawDaysLeft >= 1) {
    todayEndPage = Math.min(total, current + pagesPerDay);
  }

  const todayTargetPages = Math.max(0, todayEndPage - todayStartPage + 1);
  const todayDonePages = Math.max(
    0,
    Math.min(todayTargetPages, current - todayStartPage + 1)
  );
  const todayPercent = todayTargetPages > 0
    ? Math.min(100, Math.round((todayDonePages / todayTargetPages) * 100))
    : 100;

  return {
    totalPages: total,
    currentPage: current,
    remainingPages: remaining,
    progressPercent: percent,
    daysLeft,
    overdue: rawDaysLeft < 1 && remaining > 0,
    pagesPerDay,
    minutesPerDay,
    todayStartPage,
    todayEndPage,
    todayTargetPages,
    todayDonePages,
    todayPercent,
  };
}

/*
  selected date が今日より未来なら、期限までの残ページを
  「今日を含む残日数」で線形配分した累積到達ページを使います。
  毎日 current_page が更新されれば、翌日の計画は自動で再配分されます。
*/
export function getDailyGoalTarget(goal, dateString, baseDate = todayDateString()) {
  const total = Math.max(1, Number(goal.total_pages) || 1);
  const current = Math.min(total, Math.max(0, Number(goal.current_page) || 0));
  const remaining = Math.max(0, total - current);
  const deadlineDays = diffDays(baseDate, goal.deadline) + 1;
  const offset = diffDays(baseDate, dateString);

  if (remaining <= 0 || deadlineDays <= 0 || offset < 0 || offset >= deadlineDays) {
    return null;
  }

  const cumulativeEnd = Math.min(
    total,
    current + Math.ceil((remaining * (offset + 1)) / deadlineDays)
  );

  const previousCumulativeEnd = offset === 0
    ? current
    : Math.min(
        total,
        current + Math.ceil((remaining * offset) / deadlineDays)
      );

  const startPage = previousCumulativeEnd + 1;
  const endPage = cumulativeEnd;
  const pages = Math.max(0, endPage - startPage + 1);

  if (pages <= 0) return null;

  return {
    startPage,
    endPage,
    pages,
    minutes: Math.max(1, Math.ceil(pages * Number(goal.minutes_per_page || 3))),
  };
}

export function buildDailyGoalTasks(goals = [], dateString, baseDate = todayDateString()) {
  return goals
    .map((goal) => {
      const target = getDailyGoalTarget(goal, dateString, baseDate);
      if (!target) return null;

      const stats = getGoalStats(goal, baseDate);
      const pressure = stats.minutesPerDay > 180 ? 5 : stats.minutesPerDay > 120 ? 4 : 3;

      return {
        id: `goal-${goal.id}-${dateString}`,
        goalId: goal.id,
        title: `${goal.title}　P.${target.startPage}〜${target.endPage}`,
        subject: goal.subject,
        minutes: target.minutes,
        priority: Math.max(Number(goal.priority || 4), pressure),
        task_date: dateString,
        completed: false,
        studied_minutes: 0,
        source: 'study_goal',
        goalStartPage: target.startPage,
        goalEndPage: target.endPage,
        goalPages: target.pages,
      };
    })
    .filter(Boolean);
}
