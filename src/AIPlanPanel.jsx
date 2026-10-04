```jsx
import React, { useState } from "react";
import { generateAIPlan } from "./gemini";

export default function AIPlanPanel({
  date,
  tasks,
  fixedSchedules,
  settings,
  currentPlan,
  onAdopt,
}) {
  const [userMessage, setUserMessage] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiResult, setAiResult] = useState(null);

  const handleGenerate = async () => {
    setAiError("");
    setAiLoading(true);

    try {
      const result = await generateAIPlan({
        date,
        tasks,
        fixedSchedules,
        settings,
        currentPlan,
        userMessage,
      });

      setAiResult(result);
    } catch (error) {
      console.error(error);

      setAiError(
        error?.message ||
          "AI計画の生成中にエラーが発生しました。"
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleAdopt = () => {
    if (!aiResult?.plan?.length) return;

    if (onAdopt) {
      onAdopt(aiResult.plan);
    }
  };

  const hasPlan =
    Array.isArray(aiResult?.plan) &&
    aiResult.plan.length > 0;

  const hasRemaining =
    Array.isArray(aiResult?.remainingTasks) &&
    aiResult.remainingTasks.length > 0;

  return (
    <section className="ai-plan-panel">
      {/* ========================================
          AI HEADER
      ======================================== */}
      <div className="ai-hero">
        <div className="ai-hero-icon">
          ✦
        </div>

        <div className="ai-hero-content">
          <div className="ai-eyebrow">
            GEMINI AI
          </div>

          <h2>
            学習計画を
            <span>AIで最適化</span>
          </h2>

          <p>
            今日のタスク・空き時間・固定予定・優先度を分析して、
            あなたに合わせた学習計画を提案します。
          </p>
        </div>

        <div className="ai-status">
          <span className="ai-status-dot" />
          AI READY
        </div>
      </div>

      {/* ========================================
          INPUT
      ======================================== */}
      <div className="ai-input-card">
        <div className="ai-input-header">
          <div>
            <strong>
              AIへの要望
            </strong>

            <span>
              今日の状況や希望を自由に入力できます
            </span>
          </div>

          <span className="ai-input-label">
            OPTIONAL
          </span>
        </div>

        <textarea
          id="ai-user-message"
          value={userMessage}
          onChange={(e) =>
            setUserMessage(e.target.value)
          }
          placeholder={
            "例：今日は数学を多めにしたい\n" +
            "例：17時以降は勉強したくない\n" +
            "例：数学が30分延長した\n" +
            "例：今日は少し疲れている"
          }
          rows={4}
          disabled={aiLoading}
        />

        <div className="ai-input-footer">
          <span>
            ✦ AIは現在の自動計画も参考にします
          </span>

          <button
            type="button"
            className="ai-generate-button"
            onClick={handleGenerate}
            disabled={aiLoading}
          >
            {aiLoading ? (
              <>
                <span className="ai-spinner" />
                AIが計画を作成中...
              </>
            ) : (
              <>
                ✦
                <span>
                  AIで計画を作成
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* ========================================
          ERROR
      ======================================== */}
      {aiError && (
        <div className="ai-error">
          <div className="ai-error-icon">
            !
          </div>

          <div>
            <strong>
              AI計画を作成できませんでした
            </strong>

            <p>{aiError}</p>
          </div>
        </div>
      )}

      {/* ========================================
          RESULT
      ======================================== */}
      {aiResult && !aiError && (
        <div className="ai-result">
          {/* Result header */}
          <div className="ai-result-header">
            <div className="ai-result-heading">
              <div className="ai-result-icon">
                ✦
              </div>

              <div>
                <div className="ai-result-eyebrow">
                  AI ANALYSIS
                </div>

                <h3>
                  AIからの提案
                </h3>
              </div>
            </div>

            <div className="ai-result-badge">
              {hasPlan
                ? `${aiResult.plan.length}件を提案`
                : "分析完了"}
            </div>
          </div>

          {/* Summary */}
          {aiResult.summary && (
            <div className="ai-summary">
              <div className="ai-summary-mark">
                “
              </div>

              <p>
                {aiResult.summary}
              </p>
            </div>
          )}

          {/* Advice */}
          {aiResult.advice && (
            <div className="ai-advice">
              <div className="ai-advice-icon">
                💡
              </div>

              <div>
                <strong>
                  AIからのアドバイス
                </strong>

                <p>
                  {aiResult.advice}
                </p>
              </div>
            </div>
          )}

          {/* Schedule */}
          {hasPlan && (
            <div className="ai-schedule-section">
              <div className="ai-section-title">
                <div>
                  <strong>
                    提案された学習計画
                  </strong>

                  <span>
                    AIが優先順位と空き時間を考慮して配置しました
                  </span>
                </div>

                <span className="ai-section-count">
                  {aiResult.plan.length} TASK
                </span>
              </div>

              <div className="ai-schedule">
                {aiResult.plan.map(
                  (item, index) => (
                    <div
                      className="ai-schedule-item"
                      key={`${item.start}-${item.end}-${index}`}
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

          {/* Remaining */}
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
                    AIが優先度を考慮して後回しにしたタスクです
                  </span>
                </div>
              </div>

              <div className="ai-remaining-list">
                {aiResult.remainingTasks.map(
                  (item, index) => (
                    <div
                      className="ai-remaining-item"
                      key={`${item.title}-${index}`}
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
                        {item.minutes}分
                      </span>
                    </div>
                  )
                )}
              </div>
            </div>
          )}

          {/* Adopt */}
          {hasPlan && (
            <div className="ai-adopt-area">
              <div>
                <strong>
                  この計画で勉強しますか？
                </strong>

                <span>
                  採用すると、通常の自動計画として反映されます。
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
