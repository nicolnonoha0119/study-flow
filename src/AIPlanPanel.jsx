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

  return (
    <div className="ai-plan-panel">
      <div className="ai-plan-header">
        <div>
          <div className="ai-plan-title">
            ✨ Gemini AIで最適化
          </div>

          <div className="ai-plan-description">
            今日のタスク・空き時間・固定予定・優先度を考慮して、
            AIが学習計画を調整します。
          </div>
        </div>
      </div>

      <div className="ai-plan-input-area">
        <label htmlFor="ai-user-message">
          AIへの要望
        </label>

        <textarea
          id="ai-user-message"
          value={userMessage}
          onChange={(e) => setUserMessage(e.target.value)}
          placeholder={
            "例：今日は数学を多めにしたい\n" +
            "例：17時以降は勉強したくない\n" +
            "例：数学が30分延長した\n" +
            "例：今日は少し疲れている"
          }
          rows={4}
          disabled={aiLoading}
        />

        <button
          type="button"
          className="ai-generate-button"
          onClick={handleGenerate}
          disabled={aiLoading}
        >
          {aiLoading
            ? "✨ Geminiが計画を考えています..."
            : "✨ Gemini AIで最適化"}
        </button>
      </div>

      {aiError && (
        <div className="ai-error">
          <strong>AI計画を作成できませんでした</strong>
          <div>{aiError}</div>
        </div>
      )}

      {aiResult && !aiError && (
        <div className="ai-result">
          <div className="ai-result-title">
            🤖 AIの提案
          </div>

          {aiResult.summary && (
            <div className="ai-summary">
              {aiResult.summary}
            </div>
          )}

          {aiResult.advice && (
            <div className="ai-advice">
              <strong>💡 アドバイス</strong>
              <p>{aiResult.advice}</p>
            </div>
          )}

          {Array.isArray(aiResult.plan) &&
            aiResult.plan.length > 0 && (
              <div className="ai-schedule">
                {aiResult.plan.map((item, index) => (
                  <div
                    className="ai-schedule-item"
                    key={`${item.start}-${item.end}-${index}`}
                  >
                    <div className="ai-time">
                      {item.start}–{item.end}
                    </div>

                    <div className="ai-task">
                      <strong>
                        {item.taskTitle || "学習"}
                      </strong>

                      {item.subject && (
                        <span>{item.subject}</span>
                      )}

                      {item.reason && (
                        <small>{item.reason}</small>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

          {Array.isArray(aiResult.remainingTasks) &&
            aiResult.remainingTasks.length > 0 && (
              <div className="ai-remaining">
                <div className="ai-remaining-title">
                  ⏳ 時間不足
                </div>

                {aiResult.remainingTasks.map(
                  (item, index) => (
                    <div
                      className="ai-remaining-item"
                      key={`${item.title}-${index}`}
                    >
                      <strong>{item.title}</strong>

                      <span>
                        {item.minutes}分
                      </span>

                      {item.reason && (
                        <small>{item.reason}</small>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

          {Array.isArray(aiResult.plan) &&
            aiResult.plan.length > 0 && (
              <button
                type="button"
                className="ai-adopt-button"
                onClick={handleAdopt}
              >
                ✅ この計画を採用
              </button>
            )}
        </div>
      )}
    </div>
  );
}
