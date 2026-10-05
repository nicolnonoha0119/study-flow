
/*
========================================
 StudyFlow 自動学習計画エンジン
 Gemini / AI API 不使用
========================================

・タスクの優先度
・必要時間
・固定予定
・勉強可能時間
・休憩

をもとに、今日の学習計画を自動作成します。
*/

function toMinutes(time) {
  if (!time) return null;

  const match = String(time).match(/^(\d{1,2}):(\d{2})$/);

  if (!match) return null;

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (
    Number.isNaN(hour) ||
    Number.isNaN(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return hour * 60 + minute;
}

function toTime(minutes) {
  const safeMinutes = Math.max(
    0,
    Math.min(1439, Math.round(minutes))
  );

  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;

  return (
    String(hour).padStart(2, "0") +
    ":" +
    String(minute).padStart(2, "0")
  );
}

function getTaskTitle(task) {
  return (
    task?.title ||
    task?.taskTitle ||
    task?.name ||
    task?.task ||
    "学習"
  );
}

function getSubject(task) {
  return (
    task?.subject ||
    task?.category ||
    task?.subjectName ||
    ""
  );
}

function getMinutes(task) {
  const value =
    task?.minutes ??
    task?.duration ??
    task?.requiredMinutes ??
    task?.estimatedMinutes ??
    0;

  const minutes = Number(value);

  if (!Number.isFinite(minutes)) {
    return 0;
  }

  return Math.max(0, Math.round(minutes));
}

function getPriority(task) {
  const value =
    task?.priority ??
    task?.priorityLevel ??
    1;

  if (typeof value === "string") {
    const stars = value.match(/★/g);

    if (stars) {
      return stars.length;
    }

    const number = Number(value);

    if (Number.isFinite(number)) {
      return Math.max(1, Math.min(5, number));
    }
  }

  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 1;
  }

  return Math.max(1, Math.min(5, number));
}

function isCompleted(task) {
  return (
    task?.completed === true ||
    task?.isCompleted === true ||
    task?.done === true ||
    task?.status === "completed" ||
    task?.status === "done"
  );
}

function getFixedStart(item) {
  return (
    item?.start ||
    item?.startTime ||
    item?.from ||
    item?.begin
  );
}

function getFixedEnd(item) {
  return (
    item?.end ||
    item?.endTime ||
    item?.to ||
    item?.finish
  );
}

function getFixedTitle(item) {
  return (
    item?.title ||
    item?.name ||
    item?.taskTitle ||
    item?.label ||
    "固定予定"
  );
}

function normalizeFixedSchedules(fixedSchedules) {
  return (Array.isArray(fixedSchedules)
    ? fixedSchedules
    : []
  )
    .map((item) => {
      const start = toMinutes(getFixedStart(item));
      const end = toMinutes(getFixedEnd(item));

      if (start === null || end === null || end <= start) {
        return null;
      }

      return {
        start,
        end,
        title: getFixedTitle(item),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.start - b.start);
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) {
    return [];
  }

  const sorted = [...intervals].sort(
    (a, b) => a.start - b.start
  );

  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      last.end = Math.max(last.end, current.end);
    } else {
      merged.push({ ...current });
    }
  }

  return merged;
}

function getWeekdayKey(dateString) {
  if (!dateString) return "monday";
  const day = new Date(`${dateString}T00:00:00`).getDay();
  return [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ][day];
}

function getStudyWindow(settings, dateString) {
  const weekly = settings?.weeklyStudyHours;
  const key = getWeekdayKey(dateString);
  const day = weekly?.[key];

  if (day && day.enabled === false) return null;

  const startValue =
    day?.start ||
    settings?.startTime ||
    settings?.studyStart ||
    settings?.availableStart ||
    settings?.dayStart ||
    "07:00";

  const endValue =
    day?.end ||
    settings?.endTime ||
    settings?.studyEnd ||
    settings?.availableEnd ||
    settings?.dayEnd ||
    "23:00";

  const dayStart = toMinutes(startValue);
  const dayEnd = toMinutes(endValue);

  const actualStart = dayStart === null ? 7 * 60 : dayStart;
  const actualEnd = dayEnd === null ? 23 * 60 : dayEnd;

  if (actualEnd <= actualStart) return null;

  return { start: actualStart, end: actualEnd };
}

function getAvailableIntervals(settings, fixedSchedules, dateString) {
  const window = getStudyWindow(settings, dateString);
  if (!window) return [];

  const fixed = fixedSchedules.filter(
    (item) => item.end > window.start && item.start < window.end
  );

  const blocked = fixed.map((item) => ({
    start: Math.max(item.start, window.start),
    end: Math.min(item.end, window.end),
  }));

  const merged = mergeIntervals(blocked);
  const intervals = [];
  let cursor = window.start;

  for (const block of merged) {
    if (cursor < block.start) {
      intervals.push({ start: cursor, end: block.start });
    }
    cursor = Math.max(cursor, block.end);
  }

  if (cursor < window.end) {
    intervals.push({ start: cursor, end: window.end });
  }

  return intervals;
}

function createStudyBlocks(intervals) {
  const blocks = [];

  for (const interval of intervals) {
    let cursor = interval.start;
    const end = interval.end;

    while (cursor < end) {
      const remaining = end - cursor;

      /*
        50分勉強 + 10分休憩を基本にする。
        ただし短い空き時間では無理に休憩を入れない。
      */

      if (remaining <= 30) {
        blocks.push({
          type: "study",
          start: cursor,
          end,
        });

        cursor = end;
        continue;
      }

      const studyLength = Math.min(
        50,
        remaining
      );

      blocks.push({
        type: "study",
        start: cursor,
        end: cursor + studyLength,
      });

      cursor += studyLength;

      if (cursor < end) {
        const restLength = Math.min(
          10,
          end - cursor
        );

        if (restLength >= 5) {
          blocks.push({
            type: "break",
            start: cursor,
            end: cursor + restLength,
          });

          cursor += restLength;
        }
      }
    }
  }

  return blocks;
}

function sortTasks(tasks) {
  return tasks
    .filter((task) => {
      if (!task) return false;
      if (isCompleted(task)) return false;

      return getMinutes(task) > 0;
    })
    .map((task, index) => ({
      original: task,
      index,
      title: getTaskTitle(task),
      subject: getSubject(task),
      minutes: getMinutes(task),
      priority: getPriority(task),
    }))
    .sort((a, b) => {
      if (b.priority !== a.priority) {
        return b.priority - a.priority;
      }

      if (b.minutes !== a.minutes) {
        return b.minutes - a.minutes;
      }

      return a.index - b.index;
    });
}

function buildReason(task) {
  if (task.priority >= 5) {
    return "優先度が最も高いため、先に配置しました。";
  }

  if (task.priority >= 4) {
    return "優先度が高いため、早めに配置しました。";
  }

  if (task.priority === 3) {
    return "優先度を考慮して配置しました。";
  }

  return "残りの勉強時間に合わせて配置しました。";
}

export function generateAutoPlan({
  tasks = [],
  fixedSchedules = [],
  settings = {},
  dateString = new Date().toISOString().slice(0, 10),
}) {
  const normalizedFixed =
    normalizeFixedSchedules(fixedSchedules);

  const availableIntervals =
    getAvailableIntervals(
      settings,
      normalizedFixed,
      dateString
    );

  const studyBlocks =
    createStudyBlocks(availableIntervals);

  const sortedTasks = sortTasks(tasks);

  const plan = [];

  /*
    固定予定も結果に表示する。
  */

  for (const fixed of normalizedFixed) {
    plan.push({
      start: toTime(fixed.start),
      end: toTime(fixed.end),
      type: "fixed",
      taskTitle: fixed.title,
      subject: "",
      minutes: fixed.end - fixed.start,
      reason: "固定予定",
      _start: fixed.start,
    });
  }

  let taskIndex = 0;
  let taskRemaining =
    sortedTasks.length > 0
      ? sortedTasks[0].minutes
      : 0;

  let studySessionCount = 0;

  for (const block of studyBlocks) {
    if (block.type === "break") {
      /*
        最後の勉強ブロックの後に不要な休憩を
        入れないようにする。
      */

      const nextStudyExists =
        studyBlocks.some(
          (nextBlock) =>
            nextBlock.start > block.end &&
            nextBlock.type === "study"
        );

      if (nextStudyExists) {
        plan.push({
          start: toTime(block.start),
          end: toTime(block.end),
          type: "break",
          taskTitle: "休憩",
          subject: "",
          minutes: block.end - block.start,
          reason: "集中力を維持するための休憩です。",
          _start: block.start,
        });
      }

      continue;
    }

    let cursor = block.start;
    let available = block.end - block.start;

    while (
      available > 0 &&
      taskIndex < sortedTasks.length
    ) {
      const task = sortedTasks[taskIndex];

      if (taskRemaining <= 0) {
        taskIndex++;

        if (taskIndex >= sortedTasks.length) {
          break;
        }

        taskRemaining =
          sortedTasks[taskIndex].minutes;

        continue;
      }

      const useMinutes = Math.min(
        available,
        taskRemaining
      );

      const end = cursor + useMinutes;

      plan.push({
        start: toTime(cursor),
        end: toTime(end),
        type: "study",
        taskTitle: task.title,
        subject: task.subject,
        minutes: useMinutes,
        reason:
          buildReason(task) +
          (taskRemaining > useMinutes
            ? " まとまった時間に分割しています。"
            : ""),
        _start: cursor,
      });

      studySessionCount++;

      cursor = end;
      available -= useMinutes;
      taskRemaining -= useMinutes;

      if (taskRemaining <= 0) {
        taskIndex++;

        if (taskIndex < sortedTasks.length) {
          taskRemaining =
            sortedTasks[taskIndex].minutes;
        }
      }
    }
  }

  /*
    残ったタスク
  */

  const remainingTasks = [];

  if (taskIndex < sortedTasks.length) {
    let remainingCurrent = taskRemaining;

    if (remainingCurrent > 0) {
      remainingTasks.push({
        title: sortedTasks[taskIndex].title,
        minutes: remainingCurrent,
        reason:
          "今日の勉強可能時間ではすべて完了できないため、後回しにしました。",
      });
    }

    for (
      let i = taskIndex + 1;
      i < sortedTasks.length;
      i++
    ) {
      remainingTasks.push({
        title: sortedTasks[i].title,
        minutes: sortedTasks[i].minutes,
        reason:
          "優先度を考慮し、今日の時間内に入りきらなかったため後回しにしました。",
      });
    }
  }

  /*
    時刻順に並べる
  */

  plan.sort((a, b) => a._start - b._start);

  const cleanPlan = plan.map(
    ({ _start, ...item }) => item
  );

  const totalStudyMinutes = cleanPlan
    .filter((item) => item.type === "study")
    .reduce(
      (sum, item) => sum + item.minutes,
      0
    );

  const totalAvailableMinutes =
    availableIntervals.reduce(
      (sum, interval) =>
        sum + (interval.end - interval.start),
      0
    );

  let summary = "";

  if (sortedTasks.length === 0) {
    summary =
      "未完了の学習タスクがありません。新しいタスクを登録すると自動で計画できます。";
  } else if (totalStudyMinutes === 0) {
    summary =
      "今日の勉強可能時間がないため、学習計画を作成できませんでした。";
  } else if (remainingTasks.length > 0) {
    summary =
      "優先度の高いタスクから、今日の勉強可能時間に収まるように計画しました。時間内に終わらないタスクは後回しにしています。";
  } else {
    summary =
      "すべての未完了タスクを、優先度と必要時間を考慮して今日の勉強可能時間に配置しました。";
  }

  const advice =
    totalAvailableMinutes > 0
      ? `今日の勉強可能時間は約${totalAvailableMinutes}分です。実際の計画では${totalStudyMinutes}分を学習に使用します。`
      : "固定予定などにより、現在設定されている時間帯に勉強可能時間がありません。";

  return {
    summary,
    advice,
    plan: cleanPlan,
    remainingTasks,
    totalStudyMinutes,
    totalAvailableMinutes,
    studySessionCount,
  };
}
