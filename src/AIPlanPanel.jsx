```jsx
import React, { useMemo } from "react";

export default function AIPlanPanel({
  date,
  tasks = [],
  fixedSchedules = [],
  settings = {},
  currentPlan = [],
  onAdopt,
}) {
  // ----------------------------------------
  // 時刻を分に変換
  // ----------------------------------------
  const timeToMinutes = (time) => {
    if (!time || typeof time !== "string") {
      return null;
    }

    const parts = time.split(":");

    if (parts.length !== 2) {
      return null;
    }

    const hour = Number(parts[0]);
    const minute = Number(parts[1]);

    if (
      !Number.isFinite(hour) ||
      !Number.isFinite(minute)
    ) {
      return null;
    }

    return hour * 60 + minute;
  };

  // ----------------------------------------
  // 分を時刻に変換
  // ----------------------------------------
  const minutesToTime = (minutes) => {
    const safeMinutes = Math.max(
      0,
      Math.min(24 * 60 - 1, minutes)
    );

    const hour = Math.floor(safeMinutes / 60);
    const minute = safeMinutes % 60;

    return (
      String(hour).padStart(2, "0") +
      ":" +
      String(minute).padStart(2, "0")
    );
  };

  // ----------------------------------------
  // タスクの必要時間を取得
  // ----------------------------------------
  const getTaskMinutes = (task) => {
    const candidates = [
      task?.minutes,
      task?.duration,
      task?.estimatedMinutes,
      task?.studyMinutes,
    ];

    for (const value of candidates) {
      const number = Number(value);

      if (
        Number.isFinite(number) &&
        number > 0
      ) {
        return Math.round(number);
      }
    }

    return 30;
  };

  // ----------------------------------------
  // タスクの優先度を取得
  // ----------------------------------------
  const getPriority = (task) => {
    const value =
      task?.priority ??
      task?.importance ??
      task?.priorityLevel;

    if (typeof value === "number") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.toLowerCase();

      if (
        normalized.includes("高") ||
        normalized.includes("high")
      ) {
        return 3;
      }

      if (
        normalized.includes("中") ||
        normalized.includes("medium")
      ) {
        return 2;
      }

      if (
        normalized.includes("低") ||
        normalized.includes("low")
      ) {
        return 1;
      }

      const number = Number(value);

      if (Number.isFinite(number)) {
        return number;
      }
    }

    return 1;
  };

  // ----------------------------------------
  // 完了済みか確認
  // ----------------------------------------
  const isCompleted = (task) => {
    return (
      task?.completed === true ||
      task?.isCompleted === true ||
      task?.done === true ||
      task?.status === "completed"
    );
  };

  // ----------------------------------------
  // 固定予定を正規化
  // ----------------------------------------
  const normalizedFixedSchedules = useMemo(() => {
    return fixedSchedules
      .map((item) => {
        const start =
          item?.start ||
          item?.startTime ||
          item?.from;

        const end =
          item?.end ||
          item?.endTime ||
          item?.to;

        const startMinutes =
          timeToMinutes(start);

        const endMinutes =
          timeToMinutes(end);

        if (
          startMinutes === null ||
          endMinutes === null ||
          endMinutes <= startMinutes
        ) {
          return null;
        }

        return {
          start: start,
          end: end,
          startMinutes: startMinutes,
          endMinutes: endMinutes,
          title:
            item?.title ||
            item?.name ||
            item?.label ||
            "固定予定",
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          a.startMinutes -
          b.startMinutes
      );
  }, [fixedSchedules]);

  // ----------------------------------------
  // 勉強可能時間を取得
  // ----------------------------------------
  const getStudyStart = () => {
    const candidates = [
      settings?.studyStart,
      settings?.studyStartTime,
      settings?.startTime,
      settings?.availableStart,
    ];

    for (const value of candidates) {
      const result = timeToMinutes(value);

      if (result !== null) {
        return result;
      }
    }

    return 7 * 60;
  };

  const getStudyEnd = () => {
    const candidates = [
      settings?.studyEnd,
      settings?.studyEndTime,
      settings?.endTime,
      settings?.availableEnd,
    ];

    for (const value of candidates) {
      const result = timeToMinutes(value);

      if (result !== null) {
        return result;
      }
    }

    return 23 * 60;
  };

  // ----------------------------------------
  // 自動計画を作成
  // ----------------------------------------
  const generated = useMemo(() => {
    const studyStart = getStudyStart();
    const studyEnd = getStudyEnd();

    const usableTasks = tasks
      .filter((task) => !isCompleted(task))
      .map((task, index) => ({
        original: task,
        index: index,
        title:
          task?.title ||
          task?.name ||
          task?.taskTitle ||
          "学習タスク",
        subject:
          task?.subject ||
          task?.category ||
          "",
        minutes: getTaskMinutes(task),
        priority: getPriority(task),
      }))
      .sort((a, b) => {
        if (b.priority !== a.priority) {
          return b.priority - a.priority;
        }

        return a.index - b.index;
      });

    const result = [];
    const remaining = [];

    let currentTime = studyStart;
    let continuousStudy = 0;

    const isBlocked = (start, end) => {
      return normalizedFixedSchedules.some(
        (fixed) =>
          start < fixed.endMinutes &&
          end > fixed.startMinutes
      );
    };

    const movePastFixedSchedule = () => {
      let moved = false;

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
            minutes:
              fixed.endMinutes -
              fixed.startMinutes,
            reason: "固定予定",
          });

          currentTime = fixed.endMinutes;
          continuousStudy = 0;
          moved = true;
        }
      }

      return moved;
    };

    while (currentTime < studyEnd) {
      movePastFixedSchedule();

      if (currentTime >= studyEnd) {
        break;
      }

      let nextFixedStart = studyEnd;

      for (const fixed of normalizedFixedSchedules) {
        if (
          fixed.startMinutes > currentTime
        ) {
          nextFixedStart = Math.min(
            nextFixedStart,
            fixed.startMinutes
          );
        }
      }

      const available =
        nextFixedStart - currentTime;

      if (available <= 0) {
        currentTime = nextFixedStart;
        continue;
      }

      const task = usableTasks.find(
        (item) => !item.used
      );

      if (!task) {
        break;
      }

      // 90分以上連続したら休憩
      if (
        continuousStudy >= 90 &&
        available >= 10
      ) {
        const breakMinutes = Math.min(
          10,
          available
        );

        result.push({
          start:
            minutesToTime(currentTime),
          end:
            minutesToTime(
              currentTime + breakMinutes
            ),
          type: "break",
          taskTitle: "休憩",
          subject: "",
          minutes: breakMinutes,
          reason:
            "長時間の連続学習を避けるための休憩",
        });

        currentTime += breakMinutes;
        continuousStudy = 0;
        continue;
      }

      const actualMinutes = Math.min(
        task.minutes,
        available
      );

      if (actualMinutes <= 0) {
        break;
      }

      const endTime =
        currentTime + actualMinutes;

      if (isBlocked(currentTime, endTime)) {
        currentTime += 1;
        continue;
      }

      result.push({
        start:
          minutesToTime(currentTime),
        end:
          minutesToTime(endTime),
        type: "study",
        taskTitle: task.title,
        subject: task.subject,
        minutes: actualMinutes,
        reason:
          task.priority >= 3
            ? "優先度の高いタスクを優先して配置"
            : "空いている勉強時間に配置",
      });

      task.used = true;

      currentTime = endTime;
      continuousStudy += actualMinutes;

      if (actualMinutes < task.minutes) {
        remaining.push({
          title: task.title,
          minutes:
            task.minutes - actualMinutes,
          reason:
            "今日の勉強可能時間に入りきらないため",
        });
      }
    }

    usableTasks.forEach((task) => {
      if (!task.used) {
        const alreadyRemaining =
          remaining.some(
            (item) =>
              item.title === task.title
          );

        if (!alreadyRemaining) {
          remaining.push({
            title: task.title,
            minutes: task.minutes,
            reason:
              "今日の勉強可能時間に入りきらないため",
          });
        }
      }
    });

    return {
      plan: result,
      remainingTasks: remaining,
    };
  }, [
    tasks,
    fixedSchedules,
    settings,
  ]);

  const hasPlan =
    generated.plan.length > 0;

  const hasRemaining =
    generated.remainingTasks.length > 0;

  const planCount = hasPlan
    ? String(generated.plan.length) + "件"
    : "計画完了";

  // ----------------------------------------
  // 計画を採用
  // ----------------------------------------
  const handleAdopt = () => {
    if (
      !hasPlan ||
      !onAdopt
    ) {
      return;
    }

    onAdopt(generated.plan);
  };

  return (
    <section className="ai-plan-panel">
      <div className="ai-hero">
        <div className="ai-hero-icon">
          ✓
        </div>

        <div className="ai-hero-content">
          <div className="ai-eyebrow">
            AUTO PLAN
          </div>

          <h2>
            学習計画を
            <span>自動で最適化</span>
          </h2>

          <p>
            今日のタスク・優先度・固定予定・
            勉強可能時間をもとに、
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
            <div className="ai-result-icon">
              ✓
            </div>

            <div>
              <div className="ai-result-eyebrow">
                AUTOMATIC PLANNING
              </div>

              <h3>
                今日の自動学習計画
              </h3>
            </div>
          </div>

          <div className="ai-result-badge">
            {planCount}
          </div>
        </div>

        <div className="ai-summary">
          <div className="ai-summary-mark">
            ✓
          </div>

          <p>
            優先度の高いタスクを優先し、
            固定予定と重ならないように
            今日の勉強可能時間へ自動配置しました。
          </p>
        </div>

        {hasPlan && (
          <div className="ai-schedule-section">
            <div className="ai-section-title">
              <div>
                <strong>
                  自動作成された学習計画
                </strong>

                <span>
                  固定予定・優先度・必要時間を考慮しています
                </span>
              </div>

              <span className="ai-section-count">
                {String(generated.plan.length)} TASK
              </span>
            </div>

            <div className="ai-schedule">
              {generated.plan.map(
                (item, index) => (
                  <div
                    className="ai-schedule-item"
                    key={
                      String(item.start) +
                      "-" +
                      String(item.end) +
                      "-" +
                      String(index)
                    }
                  >
                    <div className="ai-schedule-number">
                      {String(index + 1).padStart(
                        2,
                        "0"
                      )}
                    </div>

                    <div className="ai-time">
                      <strong>
                        {item.start}
                      </strong>

                      <span>—</span>

                      <strong>
                        {item.end}
                      </strong>
                    </div>

                    <div className="ai-schedule-line" />

                    <div className="ai-task">
                      <div className="ai-task-top">
                        <strong>
                          {item.taskTitle}
                        </strong>

                        {item.subject && (
                          <span className="ai-subject">
                            {item.subject}
                          </span>
                        )}
                      </div>

                      {item.reason && (
                        <small>
                          {item.reason}
                        </small>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {hasRemaining && (
          <div className="ai-remaining">
            <div className="ai-remaining-header">
              <div className="ai-remaining-icon">
                !
              </div>

              <div>
                <strong>
                  時間内に完了できないタスク
                </strong>

                <span>
                  自動計画に入りきらなかったタスクです
                </span>
              </div>
            </div>

            <div className="ai-remaining-list">
              {generated.remainingTasks.map(
                (item, index) => (
                  <div
                    className="ai-remaining-item"
                    key={
                      String(
                        item.title
                      ) +
                      "-" +
                      String(index)
                    }
                  >
                    <div>
                      <strong>
                        {item.title}
                      </strong>

                      {item.reason && (
                        <small>
                          {item.reason}
                        </small>
                      )}
                    </div>

                    <span>
                      {String(
                        item.minutes
                      )}分
                    </span>
                  </div>
                )
              )}
            </div>
          </div>
        )}

        {hasPlan && (
          <div className="ai-adopt-area">
            <div>
              <strong>
                この計画を使いますか？
              </strong>

              <span>
                採用すると、通常の学習計画に反映されます。
              </span>
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
```
