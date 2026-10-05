```jsx
import React, { useState } from "react";
import { generateAutoPlan } from "./autoPlanner";

export default function AIPlanPanel({
  date,
  tasks,
  fixedSchedules,
  settings,
  currentPlan,
  onAdopt,
}) {
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState("");
  const [planResult, setPlanResult] = useState(null);

  const handleGenerate = () => {
    setPlanError("");
    setPlanLoading(true);

    try {
      const result = generateAutoPlan({
        date,
        tasks,
        fixedSchedules,
        settings,
        currentPlan,
      });

      setPlanResult(result);
    } catch (error) {
      console.error(error);

      setPlanError(
        error?.message ||
          "自動計画の作成中にエラーが発生しました。"
      );
    } finally {
      setPlanLoading(false);
    }
  };

  const handleAdopt = () => {
    if (
      !planResult ||
      !Array.isArray(planResult.plan)
    ) {
      return;
    }

    const studyPlan = planResult.plan.filter(
      (item) =>
        item.type === "study"
    );

    if (studyPlan.length === 0) {
      return;
    }

    if (onAdopt) {
      onAdopt(studyPlan);
    }
  };

  const hasPlan =
    planResult &&
    Array.isArray(planResult.plan) &&
    planResult.plan.length > 0;

  const hasRemaining =
    planResult &&
    Array.isArray(planResult.remainingTasks) &&
    planResult.remainingTasks.length > 0;

 const planCount = hasPlan
  ? String(planResult.plan.length) + "件"
  : "計画完了";

  return (
    <section className="ai-plan-panel">
      <div className="ai-hero">
        <div className="ai-hero-icon">✦</div>

        <div className="ai-hero-content">
          <div className="ai-eyebrow">
            STUDYFLOW
          </div>

          <h2>
            学習計画を
            <span>自動で作成</span>
          </h2>

          <p>
            今日のタスク・空き時間・固定予定・優先度を分析して、
            StudyFlowが自動で学習計画を作成します。
          </p>
        </div>

        <div className="ai-status">
          <span className="ai-status-dot" />
          AUTO PLAN
        </div>
      </div>

      <div className="ai-input-card">
        <div className="ai-input-header">
          <div>
            <strong>
              今日の学習計画を自動作成
            </strong>

            <span>
              登録したタスクと予定から最適な順番で配置します
            </span>
          </div>

          <span className="ai-input-label">
            AUTOMATIC
          </span>
        </div>

        <div
          style={{
            padding: "13px 14px",
            borderRadius: "10px",
            background: "#ffffff",
            border: "1px solid #e3e6ee",
            color: "#737b8d",
            fontSize: "11px",
            lineHeight: "1.7",
          }}
        >
          <div>
            ✓ 優先度の高いタスクから配置
          </div>

          <div>
            ✓ 固定予定と重ならないように配置
          </div>

          <div>
            ✓ 必要時間を考慮して自動分割
          </div>

          <div>
            ✓ 長時間連続しないよう休憩を設定
          </div>
        </div>

        <div className="ai-input-footer">
          <span>
            ✦ Geminiなどの外部AIは使用しません
          </span>

          <button
            type="button"
            className="ai-generate-button"
            onClick={handleGenerate}
            disabled={planLoading}
          >
            {planLoading ? (
              <>
                <span className="ai-spinner" />
                計画を作成中...
              </>
            ) : (
              <>
                <span>✦</span>
                <span>自動で計画を作成</span>
              </>
            )}
          </button>
        </div>
      </div>

      {planError && (
        <div className="ai-error">
          <div className="ai-error-icon">
            !
          </div>

          <div>
            <strong>
              自動計画を作成できませんでした
            </strong>

            <p>{planError}</p>
          </div>
        </div>
      )}

      {planResult && !planError && (
        <div className="ai-result">
          <div className="ai-result-header">
            <div className="ai-result-heading">
              <div className="ai-result-icon">
                ✦
              </div>

              <div>
                <div className="ai-result-eyebrow">
                  AUTOMATIC PLAN
                </div>

                <h3>
                  今日の学習計画
                </h3>
              </div>
            </div>

            <div className="ai-result-badge">
              {planCount}
            </div>
          </div>

          {planResult.summary && (
            <div className="ai-summary">
              <div className="ai-summary-mark">
                “
              </div>

              <p>
                {planResult.summary}
              </p>
            </div>
          )}

          {planResult.advice && (
            <div className="ai-advice">
              <div className="ai-advice-icon">
                💡
              </div>

              <div>
                <strong>
                  計画について
                </strong>

                <p>
                  {planResult.advice}
                </p>
              </div>
            </div>
          )}

          {hasPlan && (
            <div className="ai-schedule-section">
              <div className="ai-section-title">
                <div>
                  <strong>
                    作成された学習計画
                  </strong>

                  <span>
                    優先度・必要時間・固定予定を考慮して配置しました
                  </span>
                </div>

                <span className="ai-section-count">
                  {String(planResult.plan.length)} TASK
                </span>
              </div>

              <div className="ai-schedule">
                {planResult.plan.map(
                  (item, index) => (
                    <div
                      className="ai-schedule-item"
                      key={
                        String(item.start || "") +
                        "-" +
                        String(item.end || "") +
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
                          {item.start || "--:--"}
                        </strong>

                        <span>—</span>

                        <strong>
                          {item.end || "--:--"}
                        </strong>
                      </div>

                      <div
                        className="ai-schedule-line"
                        style={{
                          background:
                            item.type === "fixed"
                              ? "#b7bcc8"
                              : item.type === "break"
                              ? "#d6d9e1"
                              : undefined,
                        }}
                      />

                      <div className="ai-task">
                        <div className="ai-task-top">
                          <strong>
                            {item.taskTitle ||
                              "学習"}
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
                    今日の時間に入りきらないタスクです
                  </span>
                </div>
              </div>

              <div className="ai-remaining-list">
                {planResult.remainingTasks.map(
                  (item, index) => (
                    <div
                      className="ai-remaining-item"
                      key={
                        String(
                          item.title || "task"
                        ) +
                        "-" +
                        String(index)
                      }
                    >
                      <div>
                        <strong>
                          {item.title ||
                            "未完了タスク"}
                        </strong>

                        {item.reason && (
                          <small>
                            {item.reason}
                          </small>
                        )}
                      </div>

                      <span>
                        {String(
                          item.minutes || 0
                        )}
                        分
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
                  この計画で勉強しますか？
                </strong>

                <span>
                  採用すると通常の学習計画に反映されます。
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
      )}
    </section>
  );
}
```
