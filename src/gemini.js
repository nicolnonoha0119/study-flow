import { supabase } from "./supabase";

export async function generateAIPlan({
  date,
  tasks,
  fixedSchedules,
  settings,
  currentPlan,
  userMessage,
}) {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();

  if (sessionError) {
    throw new Error("ログイン情報の取得に失敗しました。");
  }

  if (!session?.access_token) {
    throw new Error("ログインしてください。");
  }

  const response = await fetch("/api/gemini", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({
      date,
      tasks,
      fixedSchedules,
      settings,
      currentPlan,
      userMessage,
    }),
  });

  let data;

  try {
    data = await response.json();
  } catch {
    throw new Error(
      "AIサーバーから正しい応答を取得できませんでした。"
    );
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
        "Geminiとの通信に失敗しました。"
    );
  }

  if (!data.success) {
    throw new Error(
      data?.error ||
        "AI計画の生成に失敗しました。"
    );
  }

  return {
    summary: data.summary || "",
    advice: data.advice || "",
    plan: Array.isArray(data.plan)
      ? data.plan
      : [],
    remainingTasks: Array.isArray(data.remainingTasks)
      ? data.remainingTasks
      : [],
  };
}
