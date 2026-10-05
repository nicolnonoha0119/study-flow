import React, { useMemo } from "react";

// ----------------------------------------
// ヘルパー関数
// ----------------------------------------
const timeToMinutes = (time) => {
  if (!time || typeof time !== "string") return null;

  const parts = time.split(":");
  if (parts.length !== 2) return null;

  const hour = Number(parts[0]);
  const minute = Number(parts[1]);

  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;

  return hour * 60 + minute;
};

const minutesToTime = (minutes) => {
  const safeMinutes = Math.max(0, Math.min(24 * 60 - 1, minutes));
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;

  return String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0");
};

const getTaskMinutes = (task) => {
  const candidates = [
    task?.minutes,
    task?.duration,
    task?.estimatedMinutes,
    task?.studyMinutes,
  ];

  for (const value of candidates) {
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) {
      return Math.round(number);
    }
  }

  return 30;
};

const getPriority = (task) => {
  const value = task?.priority ?? task?.importance ?? task?.priorityLevel;

  if (typeof value === "number") return value;

  if (typeof value === "string") {
    const normalized = value.toLowerCase();

    if (normalized.includes("高") || normalized.includes("high")) return 3;
    if (normalized.includes("中") || normalized.includes("medium")) return 2;
    if (normalized.includes("低") || normalized.includes("low")) return 1;

    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return 1;
};

const isCompleted = (task) =>
  task?.completed === true ||
  task?.isCompleted === true ||
  task?.done === true ||
  task?.status === "completed";

const pickTime = (candidates, fallback) => {
  for (const value of candidates) {
    const result = timeToMinutes(value);
    if (result !== null) return result;
  }
  return fallback;
};

// ----------------------------------------
// コンポーネント
// ----------------------------------------
export default function AIPlanPanel({
  date,
  tasks = [],
  fixedSchedules = [],
  settings = {},
  currentPlan = [],
  onAdopt,
}) {
  // 固定予定を正規化
  const normalizedFixedSchedules = useMemo(() => {
    if (!Array.isArray(fixedSchedules)) return [];

    return fixedSchedules
      .map((item) => {
        const start = item?.start || item?.startTime || item?.from;
        const end = item?.end || item?.endTime || item?.to;

        const startMinutes = timeToMinutes(start);
        const endMinutes = timeToMinutes(end);

        if (
          startMinutes === null ||
          endMinutes === null ||
          endMinutes <= startMinutes
        ) {
          return null;
        }

        return {
          start,
          end,
          startMinutes,
          endMinutes,
          title: item?.title || item?.name || item?.label || "固定予定",
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.startMinutes - b.startMinutes);
  }, [fixedSchedules]);

  // 自動計画を作成
  const generated = useMemo(() => {
    const studyStart = pickTime(
      [
        settings?.studyStart,
        settings?.studyStartTime,
        settings?.startTime,
        settings?.availableStart,
      ],
      7 * 60
    );

    const studyEnd = pickTime(
      [
        settings?.studyEnd,
        settings?.studyEndTime,
        settings?.endTime,
        settings?.availableEnd,
      ],
      23 * 60
    );

    const usableTasks = (Array.isArray(tasks) ? tasks : [])
      .filter((task) => !isCompleted(task))
      .map((task, index) => ({
        index,
        title: task?.title || task?.name || task?.taskTitle || "学習タスク",
        subject: task?.subject || task?.category || "",
        minutes: getTaskMinutes(task),
        priority: getPriority(task),
      }))
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return a.index - b.index;
      });

    const result = [];
    const remaining = [];

    let currentTime = studyStart;
    let continuousStudy = 0;
    let taskIndex = 0;

    // 現在時刻が固定予定の中なら、その予定を記録して終了時刻まで進める
    const movePastFixedSchedule = () => {
      for (const fixed of normalizedFixedSchedules) {
        if (
          currentTime >= fixed.startMinutes &&
          currentTime < fixed.endMinutes
        ) {
          result.push({
            start: fixed.start,
            end: fixed.end,
            type: "fixed",
            taskTitle: fixed.title,
            subject: "",
            minutes: fixed.endMinutes - fixed.startMinutes,
            reason: "固定予定",
          });

          currentTime = fixed.endMinutes;
          continuousStudy = 0;
        }
      }
    };

    while (currentTime < studyEnd && taskIndex < usableTasks.length) {
      movePastFixedSchedule();

      if (currentTime >= studyEnd) break;

      // 次の固定予定の開始時刻(なければ勉強終了時刻)
      let nextFixedStart = studyEnd;
      for (const fixed of normalizedFixedSchedules) {
        if (fixed.startMinutes > currentTime) {
          nextFixedStart = Math.min(nextFixedStart, fixed.startMinutes);
        }
      }

      const available = Math.min(nextFixedStart, studyEnd) - currentTime;

      if (available <= 0) {
        currentTime = nextFixedStart;
        continue;
      }

      // 90分以上連続したら休憩
      if (continuousStudy >= 90 && available >= 10) {
        const breakMinutes = 10;

        result.push({
          start: minutesToTime(currentTime),
          end: minutesToTime(currentTime + breakMinutes),
          type: "break",
          taskTitle: "休憩",
          subject: "",
          minutes: breakMinutes,
          reason: "長時間の連続学習を避けるための休憩",
        });

        currentTime += breakMinutes;
        continuousStudy = 0;
        continue;
      }

      const task = usableTasks[taskIndex];
      const actualMinutes = Math.min(task.minutes, available);
      const endTime = currentTime + actualMinutes;

      result.push({
        start: minutesToTime(currentTime),
        end: minutesToTime(endTime),
        type: "study",
        taskTitle: task.title,
        subject: task.subject,
        minutes: actualMinutes,
        reason:
          task.priority >= 3
            ? "優先度の高いタスクを優先して配置"
            : "空いている勉強時間に配置",
      });

      taskIndex += 1;
      currentTime = endTime;
      continuousStudy += actualMinutes;

      // 一部しか入らなかった場合は残りを記録
      if (actualMinutes < task.minutes) {
        remaining.push({
          title: task.title,
          minutes: task.minutes - actualMinutes,
          reason: "今日の勉強可能時間に入りきらないため",
        });
      }
    }

    // 未配置のタスク
    usableTasks.slice(taskIndex).forEach((task) => {
      remaining.push({
        title: task.title,
        minutes: task.minutes,
        reason: "今日の勉強可能時間に入りきらないため",
      });
    });

    return { plan: result, remainingTasks: remaining };
  }, [tasks, normalizedFixedSchedules, settings]);

  const hasPlan = generated.plan.length > 0;
  const hasRemaining = generated.remainingTasks.length > 0;
  const planCount = hasPlan ? String(generated.plan.length) + "件" : "計画なし";

  const handleAdopt = () => {
    if (!hasPlan || !onAdopt) return;
    onAdopt(generated.plan);
  };

  return (
    <section className="ai-plan-panel">
      <div className="ai-hero">
        <div className="ai-hero-icon">✓</div>

        <div className="ai-hero-content">
          <div className="ai-eyebrow">AUTO PLAN</div>

          <h2>
            学習計画を
            <span>自動で最適化</span>
          </h2>

          <p>
            今日のタスク・優先度・固定予定・勉強可能時間をもとに、
            実行しやすい学習計画を自動で作成します。
          </p>
        </div>

        <div className="ai-status">
          <span className="ai-status-dot" />
          AUTO READY
        </div>
      </div>

      <div className="ai-result">
        <div className="ai-result-header">
          <div className="ai-result-heading">
            <div className="ai-result-icon">✓</div>

            <div>
              <div className="ai-result-eyebrow">AUTOMATIC PLANNING</div>
              <h3>今日の自動学習計画</h3>
            </div>
          </div>

          <div className="ai-result-badge">{planCount}</div>
        </div>

        <div className="ai-summary">
          <div className="ai-summary-mark">✓</div>

          <p>
            優先度の高いタスクを優先し、固定予定と重ならないように
            今日の勉強可能時間へ自動配置しました。
          </p>
        </div>

        {hasPlan && (
          <div className="ai-schedule-section">
            <div className="ai-section-title">
              <div>
                <strong>自動作成された学習計画</strong>
                <span>固定予定・優先度・必要時間を考慮しています</span>
              </div>

              <span className="ai-section-count">
                {String(generated.plan.length)} TASK
              </span>
            </div>

            <div className="ai-schedule">
              {generated.plan.map((item, index) => (
                <div
                  className="ai-schedule-item"
                  key={item.start + "-" + item.end + "-" + index}
                >
                  <div className="ai-schedule-number">
                    {String(index + 1).padStart(2, "0")}
                  </div>

                  <div className="ai-time">
                    <strong>{item.start}</strong>
                    <span>—</span>
                    <strong>{item.end}</strong>
                  </div>

                  <div className="ai-schedule-line" />

                  <div className="ai-task">
                    <div className="ai-task-top">
                      <strong>{item.taskTitle}</strong>

                      {item.subject && (
                        <span className="ai-subject">{item.subject}</span>
                      )}
                    </div>

                    {item.reason && <small>{item.reason}</small>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasRemaining && (
          <div className="ai-remaining">
            <div className="ai-remaining-header">
              <div className="ai-remaining-icon">!</div>

              <div>
                <strong>時間内に完了できないタスク</strong>
                <span>自動計画に入りきらなかったタスクです</span>
              </div>
            </div>

            <div className="ai-remaining-list">
              {generated.remainingTasks.map((item, index) => (
                <div
                  className="ai-remaining-item"
                  key={item.title + "-" + index}
                >
                  <div>
                    <strong>{item.title}</strong>
                    {item.reason && <small>{item.reason}</small>}
                  </div>

                  <span>{String(item.minutes)}分</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {hasPlan && (
          <div className="ai-adopt-area">
            <div>
              <strong>この計画を使いますか?</strong>
              <span>採用すると、通常の学習計画に反映されます。</span>
            </div>

            <button
              type="button"
              className="ai-adopt-button"
              onClick={handleAdopt}
            >
              <span>✓</span>
              この計画を採用
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
