import { GoogleGenAI } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY;

const ai = GEMINI_API_KEY
  ? new GoogleGenAI({
      apiKey: GEMINI_API_KEY,
    })
  : null;

function sendJson(res, status, data) {
  res.status(status).setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(data));
}

function cleanJsonText(text) {
  if (!text) {
    return "";
  }

  let value = text.trim();

  if (value.startsWith("```")) {
    value = value
      .replace(/^```(?:json)?/i, "")
      .replace(/```$/i, "")
      .trim();
  }

  return value;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return sendJson(res, 405, {
      error: "POST method is required.",
    });
  }

  if (!GEMINI_API_KEY) {
    return sendJson(res, 500, {
      error: "GEMINI_API_KEY is not configured on Vercel.",
    });
  }

  try {
    /*
     * ----------------------------------------
     * Supabase認証確認
     * ----------------------------------------
     */

    const authorization = req.headers.authorization || "";

    if (!authorization.startsWith("Bearer ")) {
      return sendJson(res, 401, {
        error: "Authentication is required.",
      });
    }

    const accessToken = authorization.replace("Bearer ", "").trim();

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return sendJson(res, 500, {
        error: "Supabase environment variables are missing.",
      });
    }

    const supabase = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(accessToken);

    if (authError || !user) {
      return sendJson(res, 401, {
        error: "Invalid authentication.",
      });
    }

    /*
     * ----------------------------------------
     * リクエストデータ
     * ----------------------------------------
     */

    const {
      date,
      tasks = [],
      fixedSchedules = [],
      settings = {},
      currentPlan = [],
      userMessage = "",
    } = req.body || {};

    if (!date) {
      return sendJson(res, 400, {
        error: "date is required.",
      });
    }

    /*
     * ----------------------------------------
     * Geminiへの入力
     * ----------------------------------------
     */

    const systemInstruction = `
あなたはStudyFlowという高校生向け学習計画アプリのAI学習プランナーです。

目的：
ユーザーが実際に実行しやすい、現実的で具体的な勉強計画を作成してください。

重要ルール：
1. 固定予定と重なる時間には勉強を入れない。
2. 勉強可能時間を超える計画を作らない。
3. タスクの必要時間を勝手に大幅変更しない。
4. 優先度が高いタスクを基本的に優先する。
5. 数学など毎日取り組む必要がある科目は優先的に考慮する。
6. 長時間連続の勉強を避け、適切に休憩を入れる。
7. ただし休憩時間を必要以上に増やさない。
8. 既に完了しているタスクは計画に入れない。
9. 予定が多すぎて全部できない場合は、何を翌日に回すべきか明示する。
10. 「絶対に全部終わる」とは言わず、時間不足なら正直に伝える。
11. 高校生が実際に使うアプリなので、説明は簡潔にする。
12. 時刻は24時間表記を使用する。

出力は必ずJSONだけにしてください。
Markdown、コードブロック、説明文は不要です。

JSON形式：
{
  "summary": "今日の計画についての短いコメント",
  "advice": "勉強の進め方についての短いアドバイス",
  "plan": [
    {
      "start": "14:00",
      "end": "15:00",
      "type": "study",
      "taskTitle": "数学",
      "subject": "数学",
      "minutes": 60,
      "reason": "優先度が高いため"
    }
  ],
  "remainingTasks": [
    {
      "title": "英語",
      "minutes": 30,
      "reason": "時間不足のため"
    }
  ]
}

typeには必ず "study" または "break" または "fixed" のどれかを使用してください。
`;

    const userInput = `
今日の日付：
${date}

ユーザーID：
${user.id}

【学習設定】
${JSON.stringify(settings, null, 2)}

【タスク】
${JSON.stringify(tasks, null, 2)}

【固定予定】
${JSON.stringify(fixedSchedules, null, 2)}

【現在の自動計画】
${JSON.stringify(currentPlan, null, 2)}

【ユーザーからの追加要望】
${userMessage || "特になし"}

上記をすべて考慮して、今日の最適な学習計画を作成してください。
`;

    /*
     * ----------------------------------------
     * Gemini API
     * ----------------------------------------
     */

    const interaction = await ai.interactions.create({
      model: "gemini-3.8-flash",
      system_instruction: systemInstruction,
      input: userInput,
      store: false,
      generation_config: {
        temperature: 0.3,
      },
    });

    const outputText = interaction.output_text || "";

    if (!outputText) {
      return sendJson(res, 502, {
        error: "Gemini returned an empty response.",
      });
    }

    /*
     * ----------------------------------------
     * JSON解析
     * ----------------------------------------
     */

    let result;

    try {
      result = JSON.parse(cleanJsonText(outputText));
    } catch (parseError) {
      console.error("Gemini JSON parse error:", parseError);
      console.error("Gemini output:", outputText);

      return sendJson(res, 502, {
        error: "Gemini returned an invalid plan.",
        raw: outputText,
      });
    }

    /*
     * ----------------------------------------
     * 最低限のレスポンス検証
     * ----------------------------------------
     */

    if (!result || !Array.isArray(result.plan)) {
      return sendJson(res, 502, {
        error: "Gemini returned an invalid plan structure.",
      });
    }

    return sendJson(res, 200, {
      success: true,
      plan: result.plan,
      summary: result.summary || "",
      advice: result.advice || "",
      remainingTasks: Array.isArray(result.remainingTasks)
        ? result.remainingTasks
        : [],
    });
  } catch (error) {
    console.error("Gemini API error:", error);

    return sendJson(res, 500, {
      error:
        error?.message ||
        "An unexpected error occurred while contacting Gemini.",
    });
  }
}
